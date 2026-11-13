const CACHE='wld-shell-v31';
const SHELL=['/','/index.html','/icon.svg','/manifest.webmanifest','/assets/app.css','/assets/design.css','/assets/app.js','/assets/navigation.js','/assets/dashboard.js','/assets/guide.js','/assets/experience.js','/assets/focus.js','/assets/reliability.js','/assets/alerts.js'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL.map(url=>new Request(url,{cache:'reload'})))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))),self.clients.claim()]));
});
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 // A complete, versioned shell opens without waiting for a sleeping server.
 // Transit API responses and map tiles are never substituted with cached data.
 if(req.mode==='navigate'||SHELL.includes(url.pathname)){
  event.respondWith((async()=>{
   const cache=await caches.open(CACHE);
   const saved=await cache.match(req.mode==='navigate'?'/index.html':url.pathname);
   if(saved)return saved;
   return fetch(req);
  })());
 }
});
