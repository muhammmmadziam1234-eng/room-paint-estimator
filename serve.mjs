import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const assets=new Map([['/',['index.html','text/html']],['/style.css',['style.css','text/css']],['/app.mjs',['app.mjs','text/javascript']],['/estimate.mjs',['estimate.mjs','text/javascript']]]);
createServer(async(req,res)=>{
  const asset=assets.get(new URL(req.url,'http://localhost').pathname);
  if(!asset){res.writeHead(404).end();return;}
  try{const body=await readFile(new URL('./'+asset[0],import.meta.url));res.writeHead(200,{'Content-Type':asset[1]+'; charset=utf-8'}).end(body);}
  catch{res.writeHead(500).end();}
}).listen(Number(process.env.PORT||4190),'127.0.0.1',function(){
  console.log('Room Paint Estimator: http://127.0.0.1:'+this.address().port);
});
