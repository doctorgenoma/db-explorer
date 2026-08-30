const CACHE="db-explorer-v1";
const APP=["./","./index.html","./styles.css","./app.js","./manifest.json","./icon.svg"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(APP))));
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET") return;
  const u=new URL(e.request.url);
  if(u.origin===location.origin) e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(x=>{
    const copy=x.clone(); caches.open(CACHE).then(c=>c.put(e.request,copy)); return x;
  })));
});
