import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const assets=new Map([['/',['index.html','text/html; charset=utf-8']],['/style.css',['style.css','text/css; charset=utf-8']],['/app.mjs',['app.mjs','text/javascript; charset=utf-8']],['/estimate.mjs',['estimate.mjs','text/javascript; charset=utf-8']],['/fonts/gelasio-bold.woff2',['fonts/gelasio-bold.woff2','font/woff2']]]);
createServer(async(req,res)=>{
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{Allow:'GET, HEAD'}).end();return;}
  let path;
  try{path=new URL(req.url,'http://localhost').pathname;}catch{res.writeHead(400).end();return;}
  const asset=assets.get(path);
  if(!asset){res.writeHead(404).end();return;}
  try{const body=await readFile(new URL('./'+asset[0],import.meta.url));res.writeHead(200,{'Content-Type':asset[1],'X-Content-Type-Options':'nosniff'}).end(body);}
  catch{res.writeHead(500).end();}
}).listen(Number(process.env.PORT||4190),'127.0.0.1',function(){
  console.log('Room Paint Estimator: http://127.0.0.1:'+this.address().port);
});
