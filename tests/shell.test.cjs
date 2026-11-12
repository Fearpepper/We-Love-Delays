const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const handlers={},saved={body:'saved app'},network={body:'network'},calls=[];
 let cacheHit=true;
 const ctx={URL,Request,self:{location:{origin:'https://app.test'},addEventListener:(name,fn)=>handlers[name]=fn},caches:{open:async()=>({match:async key=>cacheHit?saved:undefined})},fetch:async req=>{calls.push(req.url);return network}};
 vm.runInNewContext(fs.readFileSync('sw.js','utf8'),ctx);
 function request(path,mode='navigate'){let response;handlers.fetch({request:{url:'https://app.test'+path,method:'GET',mode},respondWith:p=>response=p});return response}
 assert.equal(await request('/'),saved);assert.equal(calls.length,0,'saved shell must not wait for sleeping server');
 assert.equal(await request('/assets/app.js','same-origin'),saved);assert.equal(calls.length,0);
 assert.equal(request('/api/arrivals?code=a','same-origin'),undefined,'never cache transit API responses');
 cacheHit=false;assert.equal(await request('/'),network);assert.equal(calls.length,1,'first visit needs server');
 console.log('Saved shell and uncached transit API checks passed');
})().catch(e=>{console.error(e);process.exitCode=1});
