
/* Isolated mobile navigation: preserve the existing trip-planning handlers and native scroll. */
(function(){
 const tabs={routes:'appTrips',map:'appMap',rewards:'appRewards',guide:'appGuide',live:'appLive'};
 const visibleTabs={routes:'appTrips',guide:'appGuide',rewards:'appRewards'};
 function selectTab(view){
  if(view==='live'){view='guide';}
  const guide=document.getElementById('guideScreen');
  if(guide)guide.hidden=view!=='guide';
  if(view==='guide'&&typeof window.wldUpdateGuide==='function')window.wldUpdateGuide();
  if(window.innerWidth>790){
   document.body.dataset.desktopView=view;
   document.body.classList.toggle('desktop-live',view==='live');
   document.body.classList.toggle('desktop-guide',view==='guide');
   document.getElementById('liveTripScreen').hidden=view!=='live';
   for(const [name,id] of Object.entries(tabs)){const tab=document.getElementById(id);tab.classList.toggle('active',name===view);tab.setAttribute('aria-pressed',String(name===view))}
   if(view==='map'&&typeof routeMap!=='undefined'&&routeMap)setTimeout(()=>routeMap.invalidateSize(),120);
   window.scrollTo({top:0,behavior:'instant'});
   requestAnimationFrame(()=>window.wldSyncGuideMap?.());
   return;
  }
  document.body.classList.add('wld-tabs');
  document.body.dataset.view=view;
  document.getElementById('liveTripScreen').hidden=view!=='live';
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
