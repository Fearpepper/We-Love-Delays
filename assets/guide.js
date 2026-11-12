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
  empty.hidden=active||Boolean($('tripComplete')&&!$('tripComplete').hidden);content.hidden=!active;
  if(active&&$('tripComplete'))$('tripComplete').hidden=true;
  syncMap();
 }
 window.wldUpdateGuide=update;
 window.wldSyncGuideMap=syncMap;
 $('guidePlanTrip')?.addEventListener('click',()=>{
  window.wldSelectTab?.('routes');
  $('originSearch')?.focus({preventScroll:true});
 });
 const start=$('guideStartTrip'),finish=$('guideFinishTrip'),feedback=$('guideTripFeedback');
 const complete=$('tripComplete'),summary=$('tripCompleteSummary');
 function setTracking(active){if(start)start.hidden=active;if(finish)finish.hidden=!active;}
 start?.addEventListener('click',()=>{
  const original=$('startJourney');
  if(!original||original.disabled){feedback.textContent='Select a bus route first to begin tracking.';return}
  original.click();
  const message=$('journeyStatus')?.textContent||'Trip tracking requested.';
  feedback.textContent=message;
  // The original start action enables Finish when tracking actually begins.
  setTracking(Boolean($('finishJourney')&&!$('finishJourney').disabled));
 });
 finish?.addEventListener('click',()=>{
  const original=$('finishJourney');
  if(!original||original.disabled){feedback.textContent='No active trip to finish.';return}
  original.click();
  feedback.textContent=$('journeyStatus')?.textContent||'Trip finished.';
 });
 window.addEventListener('wld:trip-finished',event=>{
  setTracking(false);
  panel.classList.add('hidden');
  update();
  if(complete){
   complete.hidden=false;
   const earned=event.detail?.earned||0;
   summary.textContent=earned>0?'You earned '+earned+' prototype points. Ready for your next ride?':'Your trip is complete. No points were awarded without a matching 511 delay prediction.';
   complete.scrollIntoView({behavior:'smooth',block:'start'});
  }
  window.wldSelectTab?.('guide');
 });
 $('tripPlanAgain')?.addEventListener('click',()=>{
  if(complete)complete.hidden=true;
  window.wldSelectTab?.('routes');
  $('originSearch')?.focus({preventScroll:true});
 });
 $('tripViewRewards')?.addEventListener('click',()=>window.wldSelectTab?.('rewards'));
 const observer=new MutationObserver(update);
 observer.observe(panel,{attributes:true,attributeFilter:['class']});
 update();
})();
