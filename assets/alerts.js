function alertAffectsLeg(alert,leg){
 return !alert.selectors?.length||alert.selectors.some(s=>
  (!s.route||s.route===String(leg.p.route))&&
  (s.direction===null||s.direction===undefined||String(s.direction)===String(leg.p.direction))&&
  (!s.stop||leg.p.stops.slice(leg.start,leg.end+1).includes(s.stop)));
}
function alertHasCurrentImpact(alert,now=Date.now()/1000){
 const periods=alert.impact_periods?.length?alert.impact_periods:alert.periods;
 return Boolean(periods?.length&&periods.some(p=>(!p.start||p.start<=now)&&(!p.end||p.end>now)));
}
/* One agency feed shared by planner and Guide; no location sent to this API. */
(function(){
 'use strict';
 const planner=document.getElementById('serviceAlerts');
 const guide=document.createElement('section');guide.id='guideServiceAlerts';guide.className='notice';guide.setAttribute('aria-label','Service alerts for this journey');
 document.getElementById('guideTripControls').after(guide);
 const replanner=document.createElement('section');replanner.className='notice';replanner.id='replanPanel';replanner.hidden=true;guide.after(replanner);
 const replanTitle=document.createElement('strong');replanTitle.textContent='Options around a disruption';
 const replanStatus=document.createElement('p');replanStatus.id='replanStatus';replanStatus.className='hint';
 const replanButton=document.createElement('button');replanButton.className='btn alt';replanButton.type='button';replanButton.textContent='Find alternatives avoiding these notices';
 const replanResults=document.createElement('div');replanResults.id='replanResults';
 replanner.append(replanTitle,replanStatus,replanButton,replanResults);
 let data=null,error='',pending=null,lastAttempt=0,replanKey='',replanning=false,waiting=false;
 const severe=new Set(['1','2','3','4','6','9','NO_SERVICE','REDUCED_SERVICE','SIGNIFICANT_DELAYS','DETOUR','STOP_MOVED','MODIFIED_SERVICE']);
 function affected(){const legs=activeNavigation?.legs;return !legs?.length?[]:(data?.alerts||[]).filter(a=>severe.has(a.effect)&&relevant(a,legs)&&(!a.periods?.length||a.periods.some(p=>(!p.start||p.start<=Date.now()/1000)&&(!p.end||p.end>Date.now()/1000))));}
 async function replan(){
  if(replanning||waiting||!navigator.onLine||!activeNavigation)return;
  if(findingTrip){
   waiting=true;const selectedTrip=activeNavigation;
   replanStatus.textContent='Waiting for the current route search to finish before checking alternatives…';
   window.addEventListener('wld:planning-idle',()=>{waiting=false;if(activeNavigation===selectedTrip)replan();},{once:true});return;
  }
  if(journey){replanStatus.textContent='You are traveling. Open Plan and choose your current starting stop before searching; your active trip stays saved.';setAppView('routes');return;}
  const notices=affected();if(!notices.length)return;
  replanning=true;replanButton.disabled=true;
  replanStatus.textContent='Searching from your selected origin, avoiding reported affected patterns. Review notice dates and new schedules. Your selected route stays available.';
  try{await findDirectTrips({target:replanResults,avoid:notices});replanStatus.textContent='Alternative search complete from your selected origin. Options avoid matching affected patterns; they are not a guarantee of normal service. Select a card to replace your route.';}
  catch(e){replanStatus.textContent='Alternative search unavailable. Check the official planner.';}
  finally{replanning=false;replanButton.disabled=false;}
 }
 replanButton.addEventListener('click',replan);
 function updateReplan(){
  const notices=affected();replanner.hidden=!notices.length;
  const key=JSON.stringify([activeNavigation?.legs.map(l=>[l.p.route,l.p.stops.slice(l.start,l.end+1)]),notices.map(a=>[a.id,a.effect,a.periods,a.impact_periods,a.selectors,alertHasCurrentImpact(a)])]);
  if(key!==replanKey){replanKey=key;replanResults.replaceChildren();replanStatus.textContent='A notice may affect this route. Notices without machine-readable impact times require checking the published dates. Your current route is kept.';
   if(!journey&&!error&&navigator.onLine&&data&&Date.now()/1000-data.fetched<900&&notices.some(a=>alertHasCurrentImpact(a)))queueMicrotask(replan);
  }
 }

 function relevant(alert,legs){
  if(!legs?.length)return true;
  return legs.some(leg=>alertAffectsLeg(alert,leg));
 }
 function renderPanel(panel,legs){
  panel.replaceChildren();
  const title=document.createElement('strong');title.textContent=legs?.length?'Service alerts for your route':'AC Transit service alerts';panel.append(title);
  const status=document.createElement('p');status.className='hint';panel.append(status);
  const now=Date.now()/1000;
  const stale=!navigator.onLine||error||!data||now-data.fetched>900;
  const alerts=(data?.alerts||[]).filter(a=>!a.periods?.length||a.periods.some(p=>(!p.start||p.start<=now)&&(!p.end||p.end>now))).filter(a=>relevant(a,legs));
  status.textContent=!data?(error?'Alerts unavailable. Check official updates before traveling.':'Checking service updates…'):(stale?'Updates may be outdated. ':'')+'511 / AC Transit · checked '+new Date(data.fetched*1000).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})+'. '+(alerts.length?'Published alerts may change your trip.':'No matching alerts reported. This does not guarantee normal service.');
  for(const alert of alerts.slice(0,20)){
   const details=document.createElement('details');details.className='service-alert-item';
   const summary=document.createElement('summary');summary.textContent=alert.title;details.append(summary);
   const description=document.createElement('p');description.textContent=alert.description||'Check the official notice for details.';details.append(description);
   if(alert.url){try{const url=new URL(alert.url);if(['https:','http:'].includes(url.protocol)){const link=document.createElement('a');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Read agency notice ↗';details.append(link)}}catch{}}
   panel.append(details);
  }
  if(alerts.length>20){const more=document.createElement('p');more.textContent='Showing 20 of '+alerts.length+' alerts. See the official list for all updates.';panel.append(more)}
  const official=document.createElement('a');official.href='https://www.actransit.org/alert';official.target='_blank';official.rel='noopener noreferrer';official.textContent='Check official AC Transit updates ↗';panel.append(official);
 }
 function render(){renderPanel(planner,null);renderPanel(guide,typeof activeNavigation!=='undefined'?activeNavigation?.legs:null);updateReplan()}
 async function refresh(){
  render();
  if(document.hidden||!navigator.onLine||pending||Date.now()-lastAttempt<600000)return;
  lastAttempt=Date.now();
  pending=api('/api/alerts');
  try{const result=await pending;if(!Array.isArray(result.alerts)||!Number.isFinite(result.fetched))throw Error('Invalid alert feed');data=result;error=''}catch(e){error=e.message||'Unavailable'}finally{pending=null;render()}
 }
 window.addEventListener('wld:network-ready',refresh);
 window.addEventListener('wld:route-selected',refresh);
 window.addEventListener('online',()=>{if(error)lastAttempt=0;refresh()});
 window.addEventListener('offline',render);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
 setInterval(refresh,600000);render();
 if(window.wldNetworkReady)refresh();
})();
