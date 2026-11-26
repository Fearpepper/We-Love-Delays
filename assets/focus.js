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
   const summary=document.createElement('summary');summary.textContent='Saved & recent';details.append(summary);
   dashboard.append(details);sections.forEach(n=>details.append(n));
  }
 }
 const locate=$('locate'),choose=$('chooseMap'),clear=$('clearLoc');
 if(locate){
  const actions=locate.closest('.actions');
  const field=actions?.closest('.field');
  if(field&&actions){
   const hint=$('locationText');
   const d=fold('More location options',[actions,hint]);
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
   const d=fold('Back up points',[exportActions,backup]);
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
 const steps=disclosure(byId('navSteps'),'All steps');
 const notices=disclosure(byId('guideServiceAlerts'),'Service alerts');
 const alternatives=disclosure(byId('replanPanel'),'Other routes');
 if(alternatives){const sync=()=>{alternatives.details.hidden=byId('replanPanel').hidden;};new MutationObserver(sync).observe(byId('replanPanel'),{attributes:true,attributeFilter:['hidden']});new MutationObserver(()=>{if(byId('replanResults').textContent.trim())alternatives.details.open=true;}).observe(byId('replanResults'),{childList:true,subtree:true,characterData:true});sync();}
 if(notices){const sync=()=>{const count=byId('guideServiceAlerts').querySelectorAll('.service-alert-item').length;const text=byId('guideServiceAlerts').textContent;notices.summary.textContent='Service alerts'+(count?' · '+count+' notice'+(count===1?'':'s'):'')+(/unavailable|outdated/i.test(text)?' · check updates':'');};new MutationObserver(sync).observe(byId('guideServiceAlerts'),{childList:true,subtree:true,characterData:true});sync();}
 function hierarchy(event){
  const hero=document.querySelector('.guide-hero'),heading=hero?.querySelector('h1'),caption=hero?.querySelector('p'),eyebrow=hero?.querySelector('.eyebrow');
  byId('navAdvance')?.classList.toggle('is-next-action',Boolean(journey));
  nextEstimate.textContent=activeNavigation?.steps[activeNavigation.progress]?.estimate||'';
  if(!heading)return;
  if(activeNavigation?.legs?.length){
   const legs=activeNavigation.legs,last=legs[legs.length-1];
   heading.textContent=legs.map(l=>l.p.transportMode&&l.p.transportMode!=='bus'?transportLabel(l.p):routeName(l.p)).join(' → ');
   if(eyebrow)eyebrow.textContent='Your trip';
   if(caption)caption.textContent='To '+(network?.stops[last.p.stops[last.end]]?.name||'your destination');
  }else{heading.textContent=event?.type==='wld:trip-finished'?'Trip complete.':'Your next ride.';if(caption)caption.textContent='Plan a trip to see directions.';if(eyebrow)eyebrow.textContent='We Love Delays';}
 }
 for(const name of ['wld:route-selected','wld:trip-started','wld:trip-finished','wld:progress'])window.addEventListener(name,hierarchy);
 hierarchy();
});

/* A map canvas with a floating search sheet, rather than stacked dashboard cards. */
window.addEventListener('DOMContentLoaded',()=>{
 const $=id=>document.getElementById(id),card=$('autoFind').closest('.card');
 document.body.classList.add('map-led-app');
 const workspace=document.createElement('section');workspace.id='plannerWorkspace';workspace.setAttribute('aria-label','Plan a trip');
 const mapHost=document.createElement('div');mapHost.id='planMapHost';mapHost.className='planner-map-host';
 const stageTitle=document.createElement('div');stageTitle.className='map-stage-title';stageTitle.setAttribute('aria-hidden','true');
 const eyebrow=document.createElement('span');eyebrow.textContent='TRIP PLANNER';
 const headline=document.createElement('strong');headline.textContent="Your next trip.";
 const subtitle=document.createElement('span');subtitle.textContent='Routes that get you there.';stageTitle.append(eyebrow,headline,subtitle);
 card.before(workspace);workspace.append(mapHost,stageTitle,card);
 card.querySelector('h2').textContent="Where to?";
 const intro=document.createElement('p');intro.className='planner-intro';intro.textContent='Enter your start and destination.';card.querySelector('h2').after(intro);
 for(const [id,label] of [['originSearch','From'],['place','To']]){
  const input=$(id),field=input.closest('.field'),fieldLabel=field.querySelector('label');
  if(fieldLabel)fieldLabel.textContent=label;
  input.placeholder=id==='originSearch'?'Starting point':'Place, address, or stop';
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
 if(arrivalCard&&arrivalCard!==card){const arrivalDetails=document.createElement('details');arrivalDetails.className='arrival-drawer';const title=document.createElement('summary');title.textContent='Arrivals & alerts';arrivalDetails.append(title);arrivalCard.before(arrivalDetails);arrivalDetails.append(arrivalCard);}
 window.wldSyncGuideMap?.();
 if(ensureMap()){setTimeout(()=>{routeMap.invalidateSize();routeMap.zoomControl.setPosition('bottomright');},180);}
});

window.addEventListener('DOMContentLoaded',()=>{
 const byId=id=>document.getElementById(id),panel=byId('navigationPanel');
 // The current instruction is the primary task; source/diagnostic detail stays expandable.
 const timing=document.createElement('details');timing.className='trip-inspector trip-timing-detail';const summary=document.createElement('summary');summary.textContent='Timing & location';timing.append(summary);byId('navStatus').before(timing);timing.append(byId('navStatus'));new MutationObserver(()=>{if(/stopped|unavailable|outdated|blocked|denied/i.test(byId('navStatus').textContent))timing.open=true;}).observe(byId('navStatus'),{childList:true,characterData:true,subtree:true});
 const eta=document.createElement('p');eta.id='guideArrivalSummary';eta.className='guide-arrival-summary';eta.setAttribute('role','status');byId('guidePrediction')?.querySelector('.guide-prediction-header')?.after(eta);
 const gpsActions=document.createElement('div');gpsActions.className='actions';gpsActions.append(byId('navStart'),byId('navStop'));timing.append(gpsActions);if(byId('gpsDiagnostics'))timing.append(byId('gpsDiagnostics'));
 const nextCard=document.createElement('section');nextCard.className='guide-next-preview';nextCard.setAttribute('aria-label','Current trip instruction');document.querySelector('.guide-navigation-layout').before(nextCard);
 const moveNext=()=>{if(innerWidth<=790){nextCard.append(byId('navNext'),byId('navNextEstimate'));nextCard.hidden=false;}else{byId('navTitle').after(byId('navNext'),byId('navNextEstimate'));nextCard.hidden=true;}};
 moveNext();window.addEventListener('resize',moveNext);
 const prediction=byId('guidePrediction'),values=prediction?.querySelector('.guide-prediction-values');
 if(values){const detail=document.createElement('details');detail.className='trip-inspector';const s=document.createElement('summary');s.textContent='Delay & prototype points';detail.append(s);values.before(detail);for(const node of [byId('liveRouteText'),values,byId('liveDataNote'),byId('liveLastUpdate')])if(node)detail.append(node);}
 const recovery=document.createElement('details');recovery.className='trip-inspector recovery-actions';recovery.id='tripRecoveryActions';
 const title=document.createElement('summary');title.textContent='Find another way';recovery.append(title);
 const text=document.createElement('p');text.textContent='Find a new route from your location.';recovery.append(text);
 for(const reason of ['I missed my bus','I missed my transfer','Service changed']){const b=document.createElement('button');b.type='button';b.className='btn alt';b.textContent=reason;b.onclick=()=>window.wldPrepareRecovery?.(reason+'.');recovery.append(b);}
 panel.after(recovery);
});

/* Map is an exploration tool: discover served stops and plan from either end. */
window.addEventListener('DOMContentLoaded',()=>{
 const $=id=>document.getElementById(id),card=$('mapText').closest('.card'),title=card.querySelector('h2'),oldTitle=title.textContent;
 const controls=document.createElement('section');controls.id='mapExplorer';controls.className='map-explorer';controls.hidden=true;
 const heading=document.createElement('h2');heading.textContent='Explore nearby';
 const area=document.createElement('p');area.id='mapAreaName';area.textContent='Your map area';
 const actions=document.createElement('div');actions.className='actions';
 const search=document.createElement('button');search.type='button';search.className='btn';search.id='searchMapArea';search.textContent='Search this area';
 const locate=document.createElement('button');locate.type='button';locate.className='btn alt';locate.textContent='Use my location';
 const filters=document.createElement('div');filters.className='explore-filters';filters.setAttribute('aria-label','Nearby categories');
 let category='all';
 for(const [key,label] of [['all','All'],['transit','Transit'],['cafe','Food & coffee'],['shopping','Shopping'],['places','Things to do']]){
  const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.category=key;b.setAttribute('aria-pressed',String(key===category));
  b.onclick=()=>{category=key;for(const x of filters.children)x.setAttribute('aria-pressed',String(x===b));render()};filters.append(b);
 }
 const confirm=document.createElement('button');confirm.type='button';confirm.className='btn';confirm.id='mapUseLastPoint';confirm.textContent='Use this point';confirm.hidden=true;confirm.onclick=()=>document.getElementById('locationUseLast')?.click();
 window.addEventListener('wld:location-review',()=>{confirm.hidden=!document.getElementById('locationUseLast')||document.getElementById('locationUseLast').hidden});
 window.addEventListener('wld:location-set',()=>{confirm.hidden=true});
 actions.append(search,locate,confirm);controls.append(heading,area,actions,filters);title.after(controls);
 const status=document.createElement('p');status.id='mapExplorerStatus';status.className='hint';status.setAttribute('role','status');
 const list=document.createElement('div');list.id='mapStopList';list.className='map-stop-list';list.hidden=true;$('mapText').after(status,list);
 const credit=document.createElement('p');credit.id='mapExploreCredit';credit.className='hint';credit.textContent='Transit · © OpenStreetMap contributors. Distances are straight-line.';credit.hidden=true;list.after(credit);
 let layer=null,visible=false,initialized=false,exploreCamera=null,data=null,dataCenter=null,loadId=0,loading=false,moved=false;
 const cache=new Map(),mapView=()=>innerWidth>790?document.body.dataset.desktopView==='map':document.body.dataset.view==='map';
 function localStops(center){
  if(!network)return [];
  const served=new Map();for(const p of network.patterns||[])for(const id of p.stops||[]){if(!served.has(id))served.set(id,new Set());served.get(id).add(p.route)}
  return [...served].map(([id,ids])=>{const s=network.stops[id];return s&&{...s,local:true,routes:[...ids].map(id=>({name:network.routes.find(r=>r.id===id)?.name||id,agency:'AC Transit',mode:'Bus'}))}}).filter(s=>s&&Number.isFinite(s.lat)&&Number.isFinite(s.lon)&&distance(center.lat,center.lng,s.lat,s.lon)<=2).sort((a,b)=>distance(center.lat,center.lng,a.lat,a.lon)-distance(center.lat,center.lng,b.lat,b.lon)).slice(0,8);
 }
 function choose(item,target){const camera=exploreCamera;if(item.local)window.wldPlanFromMapStop(item.id,target);else window.wldPlanFromMapPlace(item,target);exploreCamera=camera}
 function entry(item,kind,center,popup=false){
  const row=document.createElement('section');row.className=kind==='transit'?'map-stop':'map-place';
  const h=document.createElement('h3');h.textContent=item.name;row.append(h);
  const p=document.createElement('p'),m=Math.round(distance(center.lat,center.lng,item.lat,item.lon)*1000);
  p.textContent=(kind==='transit'?'Stop':item.detail||'Place')+' · '+(m>=1000?(m/1000).toFixed(1)+' km':m+' m');row.append(p);
  if(item.routes?.length){const routes=document.createElement('div');routes.className='explore-routes';for(const r of item.routes.slice(0,8)){const chip=document.createElement('span');chip.textContent=r.mode+' '+r.name+(r.active===false?' · not running now':'');chip.title=r.agency;routes.append(chip)}row.append(routes)}
  const buttons=document.createElement('div');buttons.className='actions';
  for(const [target,label] of [['originSearch','Start here'],['place','Go here']]){const b=document.createElement('button');b.type='button';b.className='btn alt';b.textContent=label;b.setAttribute('aria-label',label+' · '+item.name);if(item.local){b.dataset.stopId=item.id;b.dataset.stopTarget=target}b.onclick=()=>choose(item,target);buttons.append(b)}row.append(buttons);
  if(!popup){const b=document.createElement('button');b.type='button';b.className='map-stop-center';b.textContent='Show on map';b.onclick=()=>{mapFollowing=false;updateMapFollowControl();routeMap.setView([item.lat,item.lon],17,{animate:false});L.popup().setLatLng([item.lat,item.lon]).setContent(entry(item,kind,center,true)).openOn(routeMap)};row.append(b)}return row;
 }
 function render(){
  if(!visible)return;list.hidden=false;list.replaceChildren();if(layer){layer.remove();layer=null}if(!ensureMap()){status.textContent='Map unavailable. Search in Plan.';return}
  const center=dataCenter||routeMap.getCenter(),local=localStops(center);
  // Real provider results replace local GTFS only when that provider succeeded.
  let stops=data?.transit_available?data.stops||[]:local.length?local:data?.stops||[];
  const places=(data?.places||[]).filter(p=>category==='all'||p.category===category);
  const shown=[];if(category==='all'||category==='transit')for(const s of stops.slice(0,category==='all'?8:16))shown.push([s,'transit']);
  if(category!=='transit')for(const p of places.slice(0,category==='all'?6:18))shown.push([p,'place']);
  layer=L.layerGroup().addTo(routeMap);
  for(const [item,kind] of shown){if(!Number.isFinite(item.lat)||!Number.isFinite(item.lon))continue;list.append(entry(item,kind,center));L.circleMarker([item.lat,item.lon],{radius:kind==='transit'?7:8,color:'#fff',weight:2,fillColor:kind==='transit'?'#0765d7':'#c44a77',fillOpacity:1}).bindPopup(entry(item,kind,center,true),{maxWidth:290}).addTo(layer)}
  area.textContent=data?.area||'Your map area';
  const failures=[];if(data&&!data.transit_available&&!stops.length)failures.push('Transit details unavailable');if(data&&!data.places_available&&category!=='transit')failures.push('Places unavailable');
  status.textContent=moved?'Map moved. Tap Search this area.':loading?'Finding nearby transit and places…':shown.length?shown.length+' nearby results'+(failures.length?' · '+failures.join(' · '):''):failures.length?failures.join(' · ')+'. Retry Search this area.':category==='transit'?'No nearby transit stops found. Try Plan for routes.':'No nearby places found. Move the map and search again.';
 }
 async function load(){
  if(!visible||!ensureMap())return;
  const center=routeMap.getCenter(),key=center.lat.toFixed(3)+','+center.lng.toFixed(3),id=++loadId;
  exploreCamera={center,zoom:routeMap.getZoom()};dataCenter=center;data=null;moved=false;loading=true;render();
  try{
   const fresh=hit=>hit&&Date.now()-hit.time<(hit.value.transit_available&&hit.value.places_available?900000:60000);
   let hit=cache.get(key);
   if(!fresh(hit))hit=[...cache.values()].find(h=>fresh(h)&&distance(center.lat,center.lng,h.center.lat,h.center.lng)<.15);
   const result=hit?hit.value:await api('/api/explore?'+new URLSearchParams({lat:center.lat.toFixed(3),lon:center.lng.toFixed(3)}));
   if(!hit&&result&&typeof result.area==='string'&&Array.isArray(result.stops)&&Array.isArray(result.places)){cache.set(key,{time:Date.now(),value:result,center});if(cache.size>20)cache.delete(cache.keys().next().value)}
   if(id!==loadId||!visible||distance(routeMap.getCenter().lat,routeMap.getCenter().lng,center.lat,center.lng)>.15)return;
   if(result&&typeof result.area==='string')data=result;
  }catch{if(id===loadId)data={area:'Your map area',stops:[],places:[],transit_available:false,places_available:false}}
  if(id===loadId){loading=false;render()}
 }
 search.onclick=()=>{mapFollowing=false;routeMap?.stop();updateMapFollowControl();load()};
 let locating=false;
 locate.onclick=()=>{locating=true;$('locate').click();status.textContent=$('locationText').textContent};
 new MutationObserver(()=>{if(visible&&locating){status.textContent=$('locationText').textContent;if(!$('locate').disabled)locating=false}}).observe($('locationText'),{childList:true,subtree:true,characterData:true});
 window.addEventListener('wld:location-set',e=>{locating=false;exploreCamera={center:{lat:e.detail.lat,lng:e.detail.lon},zoom:14};if(visible&&ensureMap()){routeMap.setView(exploreCamera.center,14,{animate:false});load()}});
 function sync(){
  const next=mapView();controls.hidden=!next;status.hidden=!next;list.hidden=!next;credit.hidden=!next;$('mapText').hidden=next;title.textContent=next?'Explore nearby':oldTitle;
  if(next&&!visible){visible=true;requestAnimationFrame(()=>{if(!visible)return;const tracked=mapFollowing&&lastNavigationFix&&Date.now()-lastNavigationFix.timestamp<=30000,origin=network?walkingEndpoint('originSearch'):null;
   const center=tracked?{lat:lastNavigationFix.lat,lng:lastNavigationFix.lon}:exploreCamera?.center||{lat:origin?.lat??routeMap?.getCenter().lat??37.8715,lng:origin?.lon??routeMap?.getCenter().lng??-122.2585};
   if(ensureMap()){routeMap.invalidateSize({pan:false});routeMap.setView(center,exploreCamera?.zoom||14,{animate:false});load()}
  })}else if(!next&&visible){visible=false;loadId++;loading=false;layer?.remove();layer=null;routeMap?.closePopup()}
  if(!initialized&&routeMap){initialized=true;routeMap.on('moveend',()=>{if(visible&&mapView()){const center=routeMap.getCenter();exploreCamera={center,zoom:routeMap.getZoom()};if(dataCenter&&distance(center.lat,center.lng,dataCenter.lat,dataCenter.lng)>.15){loadId++;loading=false;moved=true;status.textContent='Map moved. Tap Search this area.'}}})}
 }
 new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['data-view','data-desktop-view']});
 window.addEventListener('wld:network-ready',()=>{if(visible)render()});window.addEventListener('resize',sync);sync();
});

/* Commute preferences are set before searching and copied into the selected trip. */
window.addEventListener('DOMContentLoaded',()=>{
 const button=document.getElementById('autoFind');if(!button)return;
 const form=document.createElement('div');form.className='commute-options';
 form.innerHTML=`<label for="tripWhen">Travel time</label><select id="tripWhen"><option value="now">Leave now</option><option value="leave">Leave at</option><option value="arrive">Arrive by</option></select><label id="tripDateLabel" hidden>Travel date &amp; time<input id="tripDateTime" type="datetime-local"><small>Local time · up to 7 days ahead.</small></label><details class="focus-fold"><summary>Trip options</summary><label for="maxWalking">Walking limit</label><select id="maxWalking"><option value="5">5 minutes</option><option value="10">10 minutes</option><option value="15" selected>15 minutes</option><option value="20">20 minutes</option><option value="30">30 minutes</option></select><label><input id="stepFree" type="checkbox"> Step-free routes</label><p class="hint">Agency data. Confirm access before travel.</p><label><input id="getOffReminders" type="checkbox" checked> Get-off reminders</label><p class="hint">Keep the app open.</p></details>`;
 button.closest('.actions')?.before(form);
 const date=document.getElementById('tripDateTime'),when=document.getElementById('tripWhen');
 const d=new Date(Date.now()+30*60000);date.value=new Date(d-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
 when.onchange=()=>{document.getElementById('tripDateLabel').hidden=when.value==='now';};
 try{const prefs=JSON.parse(localStorage.getItem('wld-commute-prefs')||'{}');for(const id of ['maxWalking','stepFree','getOffReminders']){const el=document.getElementById(id);if(id==='maxWalking'){if(['5','10','15','20','30'].includes(String(prefs[id])))el.value=prefs[id];}else if(typeof prefs[id]==='boolean')el.checked=prefs[id];}}catch{}
 form.addEventListener('change',()=>{try{localStorage.setItem('wld-commute-prefs',JSON.stringify({maxWalking:document.getElementById('maxWalking').value,stepFree:document.getElementById('stepFree').checked,getOffReminders:document.getElementById('getOffReminders').checked}));}catch{}});
 const controls=document.getElementById('guideTripControls');
 if(controls){const leave=document.createElement('p');leave.id='commuteLeave';leave.className='notice';leave.setAttribute('role','status');const alert=document.createElement('p');alert.id='getOffAlert';alert.hidden=true;alert.className='notice get-off-alert';alert.setAttribute('role','alert');controls.before(leave,alert);}
});
