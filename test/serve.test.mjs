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
test('serves the page, its scripts, styles, font and icon',async t=>{
  const port=await start(t), root='http://127.0.0.1:'+port;
  for(const [path,type] of [['/','text/html'],['/index.html','text/html'],['/style.css','text/css'],['/print.css','text/css'],['/app.mjs','text/javascript'],
    ['/quote.mjs','text/javascript'],['/units.mjs','text/javascript'],['/state.mjs','text/javascript'],['/format.mjs','text/javascript'],['/store.mjs','text/javascript'],
    ['/estimate.mjs','text/javascript'],['/pwa.mjs','text/javascript'],['/sw.js','text/javascript'],['/manifest.webmanifest','application/manifest+json'],
    ['/fonts/gelasio-bold.woff2','font/woff2'],['/icons/icon.svg','image/svg+xml'],['/icons/icon-180.png','image/png'],['/icons/icon-192.png','image/png'],['/icons/icon-512.png','image/png'],['/icons/icon-maskable-512.png','image/png']]){
    const response=await fetch(root+path);
    assert.equal(response.status,200,path);
    assert.ok(response.headers.get('content-type').startsWith(type),path+' is '+response.headers.get('content-type'));
    await response.arrayBuffer();
  }
});
test('pages must be revalidated, fonts and icons may be cached, and every response says nosniff',async t=>{
  const port=await start(t), root='http://127.0.0.1:'+port;
  for(const [path,cache] of [['/','no-cache'],['/app.mjs','no-cache'],['/style.css','no-cache'],['/fonts/gelasio-bold.woff2','public, max-age=86400'],['/icons/icon.svg','public, max-age=86400']]){
    const response=await fetch(root+path);
    assert.equal(response.headers.get('cache-control'),cache,path);
    assert.equal(response.headers.get('x-content-type-options'),'nosniff',path);
    await response.arrayBuffer();
  }
  const head=await fetch(root+'/',{method:'HEAD'});
  assert.equal(head.status,200);
  assert.equal((await head.arrayBuffer()).byteLength,0);
});
test('a malformed address is refused and the server keeps running',async t=>{
  const port=await start(t);
  assert.match(await raw(port,get('//')),/^HTTP\/1\.1 400/);
  assert.match(await raw(port,get('/')),/^HTTP\/1\.1 200/);
});
test('only listed files are served, and only by GET or HEAD',async t=>{
  const port=await start(t);
  for(const target of ['/package.json','/package-lock.json','/serve.mjs','/test/serve.test.mjs','/test/e2e/helpers.mjs','/node_modules/playwright-core/package.json','/docs/preview.png','/README.md','/../../etc/passwd','/..%2f..%2fetc%2fpasswd','/.git/config','/favicon.ico','/index.html/','/APP.MJS'])
    assert.match(await raw(port,get(target)),/^HTTP\/1\.1 404/,target);
  const post=await raw(port,'POST / HTTP/1.1\r\nHost: x\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}');
  assert.match(post,/^HTTP\/1\.1 405/);
  assert.match(post,/Allow: GET, HEAD/i);
});
