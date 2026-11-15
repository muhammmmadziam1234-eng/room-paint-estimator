import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('../serve.mjs',import.meta.url));
async function start(t){
  const child=spawn(process.execPath,[script],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','inherit']});
  t.after(()=>child.kill());
  let output='';
  for await(const chunk of child.stdout){
    output+=chunk;
    const match=output.match(/127\.0\.0\.1:(\d+)/);
    if(match)return Number(match[1]);
  }
  throw new Error('The server stopped before it began listening.');
}
function raw(port,request){
  return new Promise((resolve,reject)=>{
    let reply='';
    const socket=net.connect(port,'127.0.0.1',()=>socket.write(request));
    socket.setTimeout(3000,()=>socket.destroy(new Error('No reply to: '+request.split('\r\n')[0])));
    socket.on('data',chunk=>{reply+=chunk;}).on('error',reject).on('close',()=>resolve(reply));
  });
}
const get=target=>'GET '+target+' HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n';
test('serves the page, its script and its font',async t=>{
  const port=await start(t), root='http://127.0.0.1:'+port;
  for(const [path,type] of [['/','text/html'],['/style.css','text/css'],['/app.mjs','text/javascript'],['/estimate.mjs','text/javascript'],['/fonts/gelasio-bold.woff2','font/woff2']]){
    const response=await fetch(root+path);
    assert.equal(response.status,200,path);
    assert.match(response.headers.get('content-type'),new RegExp('^'+type),path);
    await response.arrayBuffer();
  }
});
test('a malformed address is refused and the server keeps running',async t=>{
  const port=await start(t);
  assert.match(await raw(port,get('//')),/^HTTP\/1\.1 400/);
  assert.match(await raw(port,get('/')),/^HTTP\/1\.1 200/);
});
test('only listed files are served, and only by GET or HEAD',async t=>{
  const port=await start(t);
  for(const target of ['/package.json','/test/serve.test.mjs','/../../etc/passwd','/..%2f..%2fetc%2fpasswd','/.git/config'])
    assert.match(await raw(port,get(target)),/^HTTP\/1\.1 404/,target);
  const post=await raw(port,'POST / HTTP/1.1\r\nHost: x\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}');
  assert.match(post,/^HTTP\/1\.1 405/);
  assert.match(post,/Allow: GET, HEAD/i);
});
