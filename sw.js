const CACHE='wld-shell-v11';
const SHELL=['/','/index.html','/icon.svg','/manifest.webmanifest','/assets/app.css','/assets/design.css','/assets/app.js','/assets/navigation.js','/assets/dashboard.js','/assets/guide.js','/assets/experience.js'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))),self.clients.claim()]));
});
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;
 const url=new URL(req.url);
 if(url.pathname.startsWith('/api/'))return; // Transit data must never be silently served stale.
 if(req.mode==='navigate'){
  event.respondWith(fetch(req).catch(()=>caches.match('/index.html')));
  return;
 }
 if(SHELL.includes(url.pathname)){
  event.respondWith(fetch(req).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(req,copy));}return response}).catch(()=>caches.match(req)));
 }
});
