
/* Isolated mobile navigation: preserve the existing trip-planning handlers and native scroll. */
(function(){
 const tabs={routes:'appTrips',map:'appMap',rewards:'appRewards',guide:'appGuide'};
 function selectTab(view){
  if(view==='live'){view='guide';}
  const guide=document.getElementById('guideScreen');
  if(guide)guide.hidden=view!=='guide';
  if(view==='guide'&&typeof window.wldUpdateGuide==='function')window.wldUpdateGuide();
  if(window.innerWidth>790){
   document.body.dataset.desktopView=view;
   document.body.classList.toggle('desktop-guide',view==='guide');
   for(const [name,id] of Object.entries(tabs)){const tab=document.getElementById(id);tab.classList.toggle('active',name===view);tab.setAttribute('aria-pressed',String(name===view))}
   if(view==='map'&&typeof routeMap!=='undefined'&&routeMap)setTimeout(()=>routeMap.invalidateSize(),120);
   window.scrollTo({top:0,behavior:'instant'});
   requestAnimationFrame(()=>window.wldSyncGuideMap?.());
   return;
  }
  document.body.classList.add('wld-tabs');
  document.body.classList.remove('desktop-guide');
  document.body.dataset.view=view;
  document.body.classList.remove('app-map-mode');
  for(const [name,id] of Object.entries(tabs)){
   const b=document.getElementById(id);if(!b)continue;
   b.classList.toggle('active',name===view);
   b.setAttribute('aria-pressed',String(name===view));
  }
  window.scrollTo({top:0,behavior:'instant'});
  requestAnimationFrame(()=>window.wldSyncGuideMap?.());
  if(view==='map'&&typeof routeMap!=='undefined'&&routeMap)setTimeout(()=>routeMap.invalidateSize(),100);
 }
 window.wldSelectTab=selectTab;
 for(const [view,id] of Object.entries(tabs)){
  const b=document.getElementById(id);if(!b)continue;
  b.addEventListener('click',e=>{e.stopImmediatePropagation();selectTab(view)},true);
 }
 selectTab('routes');
 window.addEventListener('resize',()=>{const view=document.body.classList.contains('wld-tabs')?(document.body.dataset.view||'routes'):(document.body.dataset.desktopView||'routes');if(window.innerWidth<=790&&!document.body.classList.contains('wld-tabs'))selectTab(view);else if(window.innerWidth>790&&document.body.classList.contains('wld-tabs')){document.body.classList.remove('wld-tabs');selectTab(view)}if(typeof routeMap!=='undefined'&&routeMap)setTimeout(()=>routeMap.invalidateSize(),120)});
})();


(function(){
 if(!('serviceWorker' in navigator)||!window.isSecureContext)return;
 window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(err=>console.warn('Offline installation unavailable:',err)));
 let installPrompt=null;
 window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();installPrompt=event;
  const button=document.getElementById('wldInstall');
  if(button)button.hidden=false;
 });
 window.addEventListener('appinstalled',()=>{installPrompt=null;const button=document.getElementById('wldInstall');if(button)button.hidden=true});
 const button=document.createElement('button');
 button.id='wldInstall';button.type='button';button.className='btn alt';button.textContent='Install app';button.hidden=true;
 button.addEventListener('click',async()=>{
  if(!installPrompt)return;
  const prompt=installPrompt;installPrompt=null;button.hidden=true;
  try{await prompt.prompt()}catch(e){console.warn('Installation prompt unavailable',e)}
 });
 const top=document.querySelector('.top');
 if(top)top.append(button);
})();

/* Glass segmented navigation. Existing view handlers own all trip state. */
window.addEventListener('DOMContentLoaded',()=>{
 const nav=document.querySelector('.app-controls');if(!nav)return;
 document.body.classList.add('glass-app');
 const header=document.querySelector('.top');if(header){header.classList.add('app-header');nav.after(header);}
 const backdrop=document.createElement('div');backdrop.id='appMapBackdrop';backdrop.setAttribute('aria-hidden','true');document.body.prepend(backdrop);
 window.wldSyncGuideMap?.();
 const ids=['appTrips','appMap','appRewards','appGuide'],views=['routes','map','rewards','guide'];
 const buttons=ids.map(id=>document.getElementById(id));
 const paths=[
  '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16"/>',
  '<rect x="3" y="5" width="18" height="15" rx="4"/><path d="M3 9h18m-5 5h2M7 5V3h10"/>',
  '<path d="m12 3 8 18-8-4-8 4 8-18Zm0 0v14"/>'
 ];
 buttons.forEach((button,i)=>{const icon=button?.querySelector('.tab-icon');if(icon)icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[i]+'</svg>';});
 let selected=0,drag=null,suppressUntil=0;
 const sync=()=>{selected=Math.max(0,buttons.findIndex(b=>b?.getAttribute('aria-pressed')==='true'));if(!drag)nav.style.setProperty('--segment',selected);};
 new MutationObserver(sync).observe(nav,{subtree:true,attributes:true,attributeFilter:['aria-pressed']});sync();
 const indexAt=x=>{const box=nav.getBoundingClientRect();return Math.max(0,Math.min(3,Math.floor((x-box.left-6)/((box.width-12)/4))));};
 nav.addEventListener('keydown',event=>{
  if(!buttons.includes(event.target)||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();const index=event.key==='Home'?0:event.key==='End'?3:(selected+(event.key==='ArrowRight'?1:3))%4;
  window.wldSelectTab(views[index]);buttons[index].focus();
 });
 nav.addEventListener('pointerdown',event=>{if(event.button!==0)return;drag={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false};});
 nav.addEventListener('pointermove',event=>{
  if(!drag||drag.id!==event.pointerId)return;
  const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
  if(!drag.moved&&Math.abs(dy)>Math.abs(dx)&&Math.abs(dy)>8){drag=null;sync();return;}
  if(!drag.moved&&Math.abs(dx)>10){drag.moved=true;nav.setPointerCapture(event.pointerId);nav.classList.add('is-sliding');}
  if(drag.moved){event.preventDefault();nav.style.setProperty('--segment',indexAt(event.clientX));}
 });
 const finish=(event,cancelled=false)=>{
  if(!drag||event.pointerId!==drag.id)return;
  const moved=drag.moved;drag=null;nav.classList.remove('is-sliding');
  if(moved){suppressUntil=Date.now()+350;if(!cancelled)window.wldSelectTab(views[indexAt(event.clientX)]);if(nav.hasPointerCapture(event.pointerId))nav.releasePointerCapture(event.pointerId);}
  sync();
 };
 nav.addEventListener('pointerup',event=>finish(event));
 nav.addEventListener('pointercancel',event=>finish(event,true));
 nav.addEventListener('lostpointercapture',()=>{drag=null;nav.classList.remove('is-sliding');sync();});
 nav.addEventListener('click',event=>{if(Date.now()<suppressUntil){event.preventDefault();event.stopImmediatePropagation();}},true);
});
