/* Single focused Guide: actual map and directions, no duplicate controls. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const panel=$('navigationPanel'),content=$('guideContent'),empty=$('guideEmpty');
 const map=$('map'),mapHost=$('guideMapHost'),directions=$('guideDirectionsHost');
 if(!panel||!content||!empty)return;
 const originalMapParent=map?.parentElement,originalMapNext=map?.nextSibling;
 (directions||content).appendChild(panel);
 function resize(){try{if(typeof routeMap!=='undefined'&&routeMap)setTimeout(()=>routeMap.invalidateSize(),180)}catch(e){}}
 function syncMap(){
  if(!map||!mapHost||!originalMapParent)return;
  const view=document.body.dataset.desktopView||document.body.dataset.view||'routes';
  const show=view==='guide'&&!panel.classList.contains('hidden');
  if(show&&map.parentElement!==mapHost){mapHost.appendChild(map);resize()}
  if(!show&&map.parentElement===mapHost){originalMapParent.insertBefore(map,originalMapNext);resize()}
 }
 function update(){
  const active=!panel.classList.contains('hidden');
  empty.hidden=active;content.hidden=!active;
  syncMap();
 }
 window.wldUpdateGuide=update;
 window.wldSyncGuideMap=syncMap;
 $('guidePlanTrip')?.addEventListener('click',()=>{
  window.wldSelectTab?.('routes');
  $('originSearch')?.focus({preventScroll:true});
 });
 const observer=new MutationObserver(update);
 observer.observe(panel,{attributes:true,attributeFilter:['class']});
 update();
})();
