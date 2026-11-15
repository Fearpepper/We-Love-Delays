/* Progressive disclosure: show one trip task at a time without removing features. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 function fold(label,nodes,open=false){
  const valid=nodes.filter(Boolean);if(!valid.length)return;
  const parent=valid[0].parentElement;
  if(!parent||valid.some(n=>n.parentElement!==parent))return;
  const details=document.createElement('details');details.className='focus-fold';details.open=open;
  const summary=document.createElement('summary');summary.textContent=label;details.append(summary);
  parent.insertBefore(details,valid[0]);valid.forEach(n=>details.append(n));
  return details;
 }
 const dashboard=document.querySelector('.dashboard');
 if(dashboard){
  // Saved places remain available, but do not interrupt the primary journey form.
  const saved=dashboard.querySelector('.dashboard-saved');
  const recent=dashboard.querySelector('.dashboard-recent');
  const sections=[saved,recent].filter(Boolean);
  if(sections.length){
   const details=document.createElement('details');details.className='focus-fold focus-dashboard-more';
   const summary=document.createElement('summary');summary.textContent='Saved places & recent trips';details.append(summary);
   dashboard.append(details);sections.forEach(n=>details.append(n));
  }
 }
 const locate=$('locate'),choose=$('chooseMap'),clear=$('clearLoc');
 if(locate){
  const actions=locate.closest('.actions');
  const field=actions?.closest('.field');
  if(field&&actions){
   const hint=$('locationText');
   const d=fold('More ways to choose your starting point',[actions,hint]);
   if(d)d.classList.add('focus-location-tools');
  }
 }
 const destinationHelp=$('place')?.closest('.field')?.querySelector('.hint');
 if(destinationHelp)destinationHelp.classList.add('focus-optional-hint');
 const manual=$('manualRouteDetails');
 if(manual){manual.open=false;manual.classList.add('focus-advanced');}
 const rewards=$('exportRewards')?.closest('.card');
 if(rewards){
  const exportActions=$('exportRewards')?.closest('.actions');
  const backup=$('backupStatus');
  if(exportActions&&backup){
   const d=fold('Backup and restore points',[exportActions,backup]);
   if(d)d.classList.add('focus-wallet-tools');
  }
  const milestones=rewards.querySelector('.reward-milestones');
  if(milestones)milestones.hidden=true;
 }
 // Primary journey tracking lives in Guide, not the wallet.
 const start=$('startJourney'),finish=$('finishJourney');
 if(start&&finish){
  const actions=start.closest('.actions');
  if(actions)actions.classList.add('focus-legacy-trip-actions');
 }
})();

/* Apply the reference's visual hierarchy after all controllers have mounted. */
window.addEventListener('DOMContentLoaded',()=>{
 const byId=id=>document.getElementById(id);
 const planner=byId('autoFind')?.closest('.card');
 if(planner){planner.classList.add('planner-card');const h=planner.querySelector('h2');if(h)h.textContent='Where to?';}
 byId('autoFind').textContent='Find routes';
 const host=byId('guideDirectionsHost'),controls=byId('guideTripControls');
 if(host&&controls){controls.after(host);const prediction=byId('guidePrediction');if(prediction)host.after(prediction);}
 function disclosure(node,label){
  if(!node)return null;
  const details=document.createElement('details');details.className='trip-inspector';
  const summary=document.createElement('summary');summary.textContent=label;details.append(summary);
  node.before(details);details.append(node);return {details,summary};
 }
 const nextEstimate=document.createElement('p');nextEstimate.id='navNextEstimate';byId('navNext').after(nextEstimate);
 const steps=disclosure(byId('navSteps'),'All trip steps');
 const notices=disclosure(byId('guideServiceAlerts'),'Service alerts');
 const alternatives=disclosure(byId('replanPanel'),'Alternative routes');
 if(alternatives){const sync=()=>{alternatives.details.hidden=byId('replanPanel').hidden;};new MutationObserver(sync).observe(byId('replanPanel'),{attributes:true,attributeFilter:['hidden']});new MutationObserver(()=>{if(byId('replanResults').textContent.trim())alternatives.details.open=true;}).observe(byId('replanResults'),{childList:true,subtree:true,characterData:true});sync();}
 if(notices){const sync=()=>{const count=byId('guideServiceAlerts').querySelectorAll('.service-alert-item').length;const text=byId('guideServiceAlerts').textContent;notices.summary.textContent='Service alerts'+(count?' · '+count+' notice'+(count===1?'':'s'):'')+(/unavailable|outdated/i.test(text)?' · check updates':'');};new MutationObserver(sync).observe(byId('guideServiceAlerts'),{childList:true,subtree:true,characterData:true});sync();}
 function hierarchy(event){
  const hero=document.querySelector('.guide-hero'),heading=hero?.querySelector('h1'),caption=hero?.querySelector('p'),eyebrow=hero?.querySelector('.eyebrow');
  byId('navAdvance')?.classList.toggle('is-next-action',Boolean(journey));
  nextEstimate.textContent=activeNavigation?.steps[activeNavigation.progress]?.estimate||'';
  if(!heading)return;
  if(activeNavigation?.legs?.length){
   const legs=activeNavigation.legs,last=legs[legs.length-1];
   heading.textContent=legs.map(l=>routeName(l.p)).join(' → ');
   if(eyebrow)eyebrow.textContent='Your bus trip';
   if(caption)caption.textContent='To '+(network?.stops[last.p.stops[last.end]]?.name||'your destination');
  }else{heading.textContent=event?.type==='wld:trip-finished'?'Trip complete.':'Your next ride.';if(caption)caption.textContent='Plan a route, then follow one step at a time.';if(eyebrow)eyebrow.textContent='We Love Delays';}
 }
 for(const name of ['wld:route-selected','wld:trip-started','wld:trip-finished','wld:progress'])window.addEventListener(name,hierarchy);
 hierarchy();
});

/* A map canvas with a floating search sheet, rather than stacked dashboard cards. */
window.addEventListener('DOMContentLoaded',()=>{
 const $=id=>document.getElementById(id),card=$('autoFind').closest('.card');
 document.body.classList.add('map-led-app');
 const workspace=document.createElement('section');workspace.id='plannerWorkspace';workspace.setAttribute('aria-label','Plan a trip on the East Bay map');
 const mapHost=document.createElement('div');mapHost.id='planMapHost';mapHost.className='planner-map-host';
 const stageTitle=document.createElement('div');stageTitle.className='map-stage-title';stageTitle.setAttribute('aria-hidden','true');
 const eyebrow=document.createElement('span');eyebrow.textContent='EAST BAY / AC TRANSIT';
 const headline=document.createElement('strong');headline.textContent="Make moves.";
 const subtitle=document.createElement('span');subtitle.textContent='Your next ride starts here.';stageTitle.append(eyebrow,headline,subtitle);
 card.before(workspace);workspace.append(mapHost,stageTitle,card);
 card.querySelector('h2').textContent="Let's go.";
 const intro=document.createElement('p');intro.className='planner-intro';intro.textContent='Places, addresses, or bus stops. Pick a location, then compare your ride.';card.querySelector('h2').after(intro);
 for(const [id,label] of [['originSearch','From'],['place','To']]){
  const input=$(id),field=input.closest('.field'),fieldLabel=field.querySelector('label');
  if(fieldLabel)fieldLabel.textContent=label;
  input.placeholder=id==='originSearch'?'Where are you starting?':'Business, address, or stop';
  input.setAttribute('aria-label',id==='originSearch'?'Starting place, address, or bus stop':'Destination business, address, or bus stop');
  const tools=document.createElement('div');tools.className='location-shortcuts';
  if(id==='originSearch'){
   const locate=document.createElement('button');locate.type='button';locate.className='location-shortcut';locate.textContent='Use my location';locate.onclick=()=>$('locate').click();tools.append(locate);
  }
  const pin=document.createElement('button');pin.type='button';pin.className='location-shortcut';pin.textContent='Choose on map';pin.id=id==='originSearch'?'originMapPicker':'destinationMapPicker';pin.onclick=()=>window.wldPickSearchLocation(id);tools.append(pin);field.append(tools);
 }
 $('chooseMap').onclick=()=>window.wldPickSearchLocation('originSearch');
 const status=document.createElement('p');status.className='location-status';status.setAttribute('role','status');$('originSearch').closest('.field').append(status);
 new MutationObserver(()=>{status.textContent=$('locationText').textContent;}).observe($('locationText'),{childList:true,subtree:true,characterData:true});
 const manual=$('manualRouteDetails'),preview=$('preview').closest('.actions');
 if(manual){manual.classList.add('advanced-planner');if(preview)manual.append(preview);}
 const legacyLocation=document.querySelector('.focus-location-tools')?.closest('.field');if(manual&&legacyLocation)manual.append(legacyLocation);
 const arrivalCard=$('arrivals').closest('.card');
 if(arrivalCard&&arrivalCard!==card){const arrivalDetails=document.createElement('details');arrivalDetails.className='arrival-drawer';const title=document.createElement('summary');title.textContent='Boarding-stop arrivals & all service notices';arrivalDetails.append(title);arrivalCard.before(arrivalDetails);arrivalDetails.append(arrivalCard);}
 window.wldSyncGuideMap?.();
 if(ensureMap()){setTimeout(()=>{routeMap.invalidateSize();routeMap.zoomControl.setPosition('bottomright');},180);}
});

window.addEventListener('DOMContentLoaded',()=>{
 const byId=id=>document.getElementById(id),panel=byId('navigationPanel');
 // The current instruction is the primary task; source/diagnostic detail stays expandable.
 const timing=document.createElement('details');timing.className='trip-inspector trip-timing-detail';const summary=document.createElement('summary');summary.textContent='Timing & GPS status';timing.append(summary);byId('navStatus').before(timing);timing.append(byId('navStatus'));new MutationObserver(()=>{if(/stopped|unavailable|outdated|blocked|denied/i.test(byId('navStatus').textContent))timing.open=true;}).observe(byId('navStatus'),{childList:true,characterData:true,subtree:true});
 const eta=document.createElement('p');eta.id='guideArrivalSummary';eta.className='guide-arrival-summary';eta.setAttribute('role','status');byId('guidePrediction')?.querySelector('.guide-prediction-header')?.after(eta);
 const gpsActions=document.createElement('div');gpsActions.className='actions';gpsActions.append(byId('navStart'),byId('navStop'));timing.append(gpsActions);if(byId('gpsDiagnostics'))timing.append(byId('gpsDiagnostics'));
 const nextCard=document.createElement('section');nextCard.className='guide-next-preview';nextCard.setAttribute('aria-label','Current trip instruction');document.querySelector('.guide-navigation-layout').before(nextCard);
 const moveNext=()=>{if(innerWidth<=790){nextCard.append(byId('navNext'),byId('navNextEstimate'));nextCard.hidden=false;}else{byId('navTitle').after(byId('navNext'),byId('navNextEstimate'));nextCard.hidden=true;}};
 moveNext();window.addEventListener('resize',moveNext);
 const prediction=byId('guidePrediction'),values=prediction?.querySelector('.guide-prediction-values');
 if(values){const detail=document.createElement('details');detail.className='trip-inspector';const s=document.createElement('summary');s.textContent='Delay estimate & prototype points';detail.append(s);values.before(detail);for(const node of [byId('liveRouteText'),values,byId('liveDataNote'),byId('liveLastUpdate')])if(node)detail.append(node);}
 const recovery=document.createElement('details');recovery.className='trip-inspector recovery-actions';recovery.id='tripRecoveryActions';
 const title=document.createElement('summary');title.textContent='Find another way';recovery.append(title);
 const text=document.createElement('p');text.textContent='Missed a bus, a transfer, or service changed? Search from where you are now.';recovery.append(text);
 for(const reason of ['I missed my bus','I missed my transfer','Service changed']){const b=document.createElement('button');b.type='button';b.className='btn alt';b.textContent=reason;b.onclick=()=>window.wldPrepareRecovery?.(reason+'.');recovery.append(b);}
 panel.after(recovery);
});

/* Map is an exploration tool: discover served stops and plan from either end. */
window.addEventListener('DOMContentLoaded',()=>{
 const $=id=>document.getElementById(id),card=$('mapText').closest('.card'),title=card.querySelector('h2'),oldTitle=title.textContent;
 const controls=document.createElement('section');controls.id='mapExplorer';controls.className='map-explorer';controls.hidden=true;
 const heading=document.createElement('h2');heading.textContent='Explore nearby stops';controls.append(heading);
 const intro=document.createElement('p');intro.textContent='Find stops near the map center. Pan the map, then search this area. Distances are straight-line, not walking routes.';
 const actions=document.createElement('div');actions.className='actions';
 const search=document.createElement('button');search.type='button';search.className='btn';search.id='searchMapArea';search.textContent='Search this area';
 const reset=document.createElement('button');reset.type='button';reset.className='btn alt';reset.textContent='Back to Berkeley';
 actions.append(search,reset);controls.append(intro,actions);title.after(controls);
 const status=document.createElement('p');status.id='mapExplorerStatus';status.className='hint';status.setAttribute('role','status');
 const list=document.createElement('div');list.id='mapStopList';list.className='map-stop-list';list.hidden=true;$('mapText').after(status,list);
 let stopLayer=null,cachedNetwork=null,served=new Map(),visible=false,initialized=false,exploreCamera=null;
 const mapView=()=>innerWidth>790?document.body.dataset.desktopView==='map':document.body.dataset.view==='map';
 function index(){if(cachedNetwork===network)return;cachedNetwork=network;served=new Map();for(const p of network?.patterns||[])for(const id of p.stops||[]){if(!served.has(id))served.set(id,new Set());served.get(id).add(p.route);}}
 function stopCard(stop,meters,popup=false){
  const row=document.createElement('section');row.className='map-stop';
  const h=document.createElement('h3');h.textContent=stop.name;row.append(h);
  const routes=[...served.get(stop.id)||[]].map(id=>network.routes.find(r=>r.id===id)?.name||id).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  const detail=document.createElement('p');detail.textContent='Stop '+(stop.code||stop.id)+' · '+Math.round(meters)+' m from searched center · Buses '+routes.slice(0,8).join(', ')+(routes.length>8?' + more':'');row.append(detail);
  const buttons=document.createElement('div');buttons.className='actions';
  for(const [target,label] of [['originSearch','Start here'],['place','Go here']]){const b=document.createElement('button');b.type='button';b.className='btn alt';b.textContent=label;b.setAttribute('aria-label',label+' · '+stop.name);b.dataset.stopId=stop.id;b.dataset.stopTarget=target;b.onclick=()=>window.wldPlanFromMapStop(stop.id,target);buttons.append(b);}
  row.append(buttons);if(!popup){const center=document.createElement('button');center.type='button';center.className='map-stop-center';center.textContent='Show stop on map';center.onclick=()=>{mapFollowing=false;updateMapFollowControl();routeMap.setView([stop.lat,stop.lon],17,{animate:false});};row.append(center);}return row;
 }
 function render(){
  if(!visible)return;list.hidden=false;list.replaceChildren();if(stopLayer){stopLayer.remove();stopLayer=null;}
  if(!network){status.textContent=window.wldNetworkReady?'Stop data is unavailable. Open Plan and retry loading transit data.':'Loading AC Transit stops… Nearby stops will appear when the feed is ready.';return;}
  if(!ensureMap()){status.textContent='Interactive map unavailable. Use Plan to search stop names.';return;}
  index();const center=routeMap.getCenter();
  const stops=[...served.keys()].map(id=>network.stops[id]).filter(s=>s&&Number.isFinite(s.lat)&&Number.isFinite(s.lon)).map(s=>({s,meters:distance(center.lat,center.lng,s.lat,s.lon)*1000})).filter(x=>x.meters<=2000).sort((a,b)=>a.meters-b.meters).slice(0,8);
  exploreCamera={center:routeMap.getCenter(),zoom:routeMap.getZoom()};stopLayer=L.layerGroup().addTo(routeMap);
  status.textContent=stops.length?'Showing '+stops.length+' served AC Transit stops within 2 km of the searched center. Select a stop to plan a trip.':'No served AC Transit stops found within 2 km. Move the map or return to Berkeley.';
  for(const {s,meters} of stops){list.append(stopCard(s,meters));L.circleMarker([s.lat,s.lon],{radius:7,color:'#153d2d',weight:2,fillColor:'#d4f67c',fillOpacity:1}).bindPopup(stopCard(s,meters,true),{maxWidth:290}).addTo(stopLayer);}
 }
 search.onclick=()=>{mapFollowing=false;if(routeMap)routeMap.stop();updateMapFollowControl();render();};
 reset.onclick=()=>{mapFollowing=false;updateMapFollowControl();if(ensureMap()){routeMap.setView([37.8715,-122.2585],14,{animate:false});render();}};
 function sync(){
  const next=mapView();controls.hidden=!next;status.hidden=!next;list.hidden=!next;title.textContent=next?'Explore bus stops':oldTitle;
  if(next&&!visible){visible=true;list.hidden=true;list.replaceChildren();requestAnimationFrame(()=>{if(!visible)return;const tracked=mapFollowing&&lastNavigationFix&&Date.now()-lastNavigationFix.timestamp<=30000;const origin=network?walkingEndpoint('originSearch'):null;const center=tracked?{lat:lastNavigationFix.lat,lng:lastNavigationFix.lon}:exploreCamera?.center||{lat:origin?.lat??37.8715,lng:origin?.lon??-122.2585},zoom=tracked?routeMap?.getZoom():exploreCamera?.zoom||14;if(routeMap&&center){routeMap.invalidateSize({pan:false});routeMap.setView(center,zoom,{animate:false});}render();});}else if(!next&&visible){visible=false;if(stopLayer){stopLayer.remove();stopLayer=null;}routeMap?.closePopup();}
  if(!initialized&&routeMap){initialized=true;routeMap.on('moveend',()=>{if(visible&&mapView()){exploreCamera={center:routeMap.getCenter(),zoom:routeMap.getZoom()};status.textContent='Map moved. Tap Search this area to refresh nearby stops.';}});}
 }
 new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['data-view','data-desktop-view']});
 window.addEventListener('wld:network-ready',()=>{if(visible)render();});window.addEventListener('resize',sync);sync();
});
