// Service worker for Second Coat. It precaches the app shell and answers from the cache first, so the
// whole quote builder works offline. Every address is resolved relative to this file, so it also works
// from a sub-path such as /room-paint-estimator/ on GitHub Pages.
// VERSION is a hash of the precached files. `npm run stamp` writes it and a test checks it, so a changed
// file always gets a new cache, and the old cache is deleted when the new worker activates.
const VERSION='d5cefd0c3c';
const PREFIX='second-coat-';
const CACHE=PREFIX+VERSION;
const SHELL=['./','index.html','style.css','print.css','app.mjs','quote.mjs','units.mjs','state.mjs','format.mjs','store.mjs','pwa.mjs',
  'manifest.webmanifest','fonts/gelasio-bold.woff2','icons/icon.svg','icons/icon-180.png','icons/icon-192.png','icons/icon-512.png','icons/icon-maskable-512.png'];

self.addEventListener('install',event=>{
  // addAll is all or nothing: if one file cannot be fetched this worker does not install and the old one keeps serving.
  // `reload` skips the HTTP cache so a new version never precaches stale files.
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL.map(path=>new Request(path,{cache:'reload'})))));
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    for(const name of await caches.keys())if(name.startsWith(PREFIX)&&name!==CACHE)await caches.delete(name); // only our own old caches
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',event=>{
  const {request}=event;
  if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const hit=await cache.match(request,{ignoreSearch:true}); // the quote lives in the hash, but ignore any query string too
    if(hit)return hit;
    try{return await fetch(request);}
    catch(error){
      const shell=request.mode==='navigate'?await cache.match('index.html'):undefined;
      if(shell)return shell;
      throw error;
    }
  })());
});
