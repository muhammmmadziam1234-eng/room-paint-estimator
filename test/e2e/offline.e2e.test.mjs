import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request as httpRequest} from 'node:http';
import {readFileSync} from 'node:fs';
import {startServer,launch,openPage,room,total,skip} from './helpers.mjs';

let server, browser, proxy;
const VERSION=/const VERSION='([^']+)'/.exec(readFileSync(new URL('../../sw.js',import.meta.url),'utf8'))[1];
const PREFIX='/room-paint-estimator/';
test.before(async()=>{
  if(skip)return;
  server=await startServer();
  browser=await launch();
  // Stands in for GitHub Pages serving the site from a sub-path: /room-paint-estimator/x is forwarded to /x.
  proxy=createServer((req,res)=>{
    if(!req.url.startsWith(PREFIX)){res.writeHead(404).end();return;}
    const upstream=httpRequest({host:'127.0.0.1',port:server.port,path:'/'+req.url.slice(PREFIX.length),method:req.method},answer=>{res.writeHead(answer.statusCode,answer.headers);answer.pipe(res);});
    req.pipe(upstream);
  });
  await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
});
test.after(async()=>{await browser?.close();server?.stop();proxy?.close();});

const controlled=page=>page.waitForFunction(()=>navigator.serviceWorker.controller!==null);

for(const [label,base] of [['at the site root',()=>server.url],['under a /room-paint-estimator/ sub-path',()=>`http://127.0.0.1:${proxy.address().port}${PREFIX}`]])
test(`offline: ${label}, the app reloads and keeps working with the network cut`,{skip},async()=>{
  const {page,context,problems}=await openPage(browser,base());
  await controlled(page);
  const scope=await page.evaluate(async()=>(await navigator.serviceWorker.ready).scope);
  assert.equal(scope,base(),'the worker is scoped to the folder the app is served from');
  // Everything the page loaded is in the cache, so nothing is fetched from the network after this.
  const loaded=await page.evaluate(()=>performance.getEntriesByType('resource').map(entry=>new URL(entry.name).pathname));
  const cached=await page.evaluate(async version=>(await (await caches.open('second-coat-'+version)).keys()).map(request=>new URL(request.url).pathname),VERSION);
  for(const path of new Set(loaded))assert.ok(cached.includes(path),path+' was loaded but is not cached');
  assert.ok(cached.length>=16);

  await context.setOffline(true);
  assert.equal(await page.evaluate(()=>fetch('./not-in-the-cache-'+Date.now()).then(()=>'reached the network',()=>'blocked')),'blocked','the network really is cut');
  await page.reload();
  await page.waitForSelector('.room');
  assert.equal(await total(page),'$215.00');
  await page.click('#add-room');
  await room(page,2).locator('[data-field="windows"]').fill('2');
  assert.equal(await total(page),'$372.76'); // 170.00 + (40 - 2.88) m2 x 4.25 = 157.76, plus 45.00 setup
  await page.fill('#quote-name','Made offline');
  await page.click('#save');
  await page.waitForFunction(()=>document.querySelectorAll('.saved-item').length===1);
  await page.goto(base()); // a fresh visit with no address hash, still offline
  await page.waitForSelector('.room');
  assert.equal(await page.inputValue('#quote-name'),'Made offline','the draft is restored offline');
  assert.equal(await page.locator('.saved-item').count(),1);
  await page.click('#print');
  await context.setOffline(false);
  // The only failure is the deliberate probe request above (the console line does not carry its address).
  assert.deepEqual(problems.filter(problem=>!/not-in-the-cache/.test(problem)),['error: Failed to load resource: net::ERR_FAILED']);
});

test('a new worker deletes only its own old caches',{skip},async()=>{
  const {page,problems}=await openPage(browser,server.url);
  await controlled(page);
  await page.evaluate(async()=>{
    for(const name of ['second-coat-oldversion','other-app-cache'])await (await caches.open(name)).put('./x',new Response('x'));
    await (await navigator.serviceWorker.getRegistration()).unregister();
  });
  await page.reload();                  // registers a fresh worker, which installs and activates
  await controlled(page);
  await page.waitForFunction(async()=>!(await caches.keys()).includes('second-coat-oldversion'));
  assert.deepEqual((await page.evaluate(()=>caches.keys())).sort(),['other-app-cache','second-coat-'+VERSION]);
  assert.deepEqual(problems,[]);
});
