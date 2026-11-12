/* One agency feed shared by planner and Guide; no location sent to this API. */
(function(){
 'use strict';
 const planner=document.getElementById('serviceAlerts');
 const guide=document.createElement('section');guide.id='guideServiceAlerts';guide.className='notice';guide.setAttribute('aria-label','Service alerts for this journey');
 document.getElementById('guideTripControls').after(guide);
 let data=null,error='',pending=null,lastAttempt=0;
 function relevant(alert,legs){
  if(!legs?.length)return true;
  return !alert.selectors?.length||alert.selectors.some(s=>legs.some(leg=>{
   if(s.route&&s.route!==String(leg.p.route))return false;
   if(s.direction!==null&&s.direction!==undefined&&String(s.direction)!==String(leg.p.direction))return false;
   if(s.stop&&!leg.p.stops.slice(leg.start,leg.end+1).includes(s.stop))return false;
   // Patterns contain many scheduled trips. Trip-specific alerts may apply;
   // retain them rather than falsely report the journey unaffected.
   return true;
  }));
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
 function render(){renderPanel(planner,null);renderPanel(guide,typeof activeNavigation!=='undefined'?activeNavigation?.legs:null)}
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
