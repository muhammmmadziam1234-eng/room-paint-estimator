import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const html='text/html; charset=utf-8', css='text/css; charset=utf-8', js='text/javascript; charset=utf-8';
// The only files that are ever served. Anything else, including this script, is a 404.
// Page, scripts and styles must be revalidated; fonts and icons may be kept for a day.
const NO_CACHE='no-cache', KEEP='public, max-age=86400';
const assets=new Map([
  ['/',['index.html',html,NO_CACHE]],
  ['/index.html',['index.html',html,NO_CACHE]],
  ['/style.css',['style.css',css,NO_CACHE]],
  ['/print.css',['print.css',css,NO_CACHE]],
  ['/app.mjs',['app.mjs',js,NO_CACHE]],
  ['/quote.mjs',['quote.mjs',js,NO_CACHE]],
  ['/units.mjs',['units.mjs',js,NO_CACHE]],
  ['/state.mjs',['state.mjs',js,NO_CACHE]],
  ['/format.mjs',['format.mjs',js,NO_CACHE]],
  ['/store.mjs',['store.mjs',js,NO_CACHE]],
  ['/estimate.mjs',['estimate.mjs',js,NO_CACHE]],
  ['/fonts/gelasio-bold.woff2',['fonts/gelasio-bold.woff2','font/woff2',KEEP]],
  ['/icons/icon.svg',['icons/icon.svg','image/svg+xml',KEEP]]
]);
createServer(async(req,res)=>{
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{Allow:'GET, HEAD'}).end();return;}
  let path;
  try{path=new URL(req.url,'http://localhost').pathname;}catch{res.writeHead(400).end();return;}
  const asset=assets.get(path);
  if(!asset){res.writeHead(404).end();return;}
  try{
    const body=await readFile(new URL('./'+asset[0],import.meta.url));
    res.writeHead(200,{'Content-Type':asset[1],'Cache-Control':asset[2],'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
    res.end(req.method==='HEAD'?undefined:body);
  }catch{res.writeHead(500).end();}
}).listen(Number(process.env.PORT||4190),'127.0.0.1',function(){
  console.log('Room Paint Estimator: http://127.0.0.1:'+this.address().port);
});
