
const $=id=>document.getElementById(id);
/* Native mobile scroll: Map tab jumps to the real map; Routes jumps to the planner. */
function scrollMobileView(view){
 if(window.innerWidth>790)return false;
 if(typeof window.wldSelectTab==='function'){window.wldSelectTab(view);return true}
 document.body.classList.remove('app-map-mode');
 const target=view==='map'?$('map'):view==='guide'?($('navigationPanel').classList.contains('hidden')?$('map'):$('navigationPanel')):$('originSearch');
 if(target)requestAnimationFrame(()=>target.scrollIntoView({behavior:'smooth',block:view==='map'?'center':'start'}));
 for(const [id,on] of [['appTrips',view==='routes'],['appMap',view==='map'],['appGuide',view==='guide']]){$(id).classList.toggle('active',on);$(id).setAttribute('aria-pressed',String(on))}
 return true;
}
function setAppView(view){
 if(view==='guide'&&typeof window.wldSelectTab==='function'){window.wldSelectTab('guide');return;}
 if(scrollMobileView(view))return;
 const map=view==='map'||view==='guide';
 document.body.classList.toggle('app-map-mode',map);
 for(const [id,active] of [['appTrips',!map],['appMap',view==='map'],['appGuide',view==='guide']]){
  const el=$(id);el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));
 }
 if(view==='guide'&&activeNavigation){
  $('appSheetTitle').textContent=$('navTitle').textContent;
  $('appSheetText').textContent=$('navNext').textContent+' · '+$('navStatus').textContent;
 }else if(view==='guide'){
  $('appSheetTitle').textContent='No route selected';$('appSheetText').textContent='Select a recommended route from Routes to see directions.';
 }else{
  $('appSheetTitle').textContent=activeNavigation?$('navTitle').textContent:'Explore the map';
  $('appSheetText').textContent=activeNavigation?$('navNext').textContent:'Choose a route to display its bus stops.';
 }
 if(routeMap)setTimeout(()=>routeMap.invalidateSize(),260);
}
$('appTrips').onclick=()=>setAppView('routes');
$('appMap').onclick=()=>setAppView('map');
$('appGuide').onclick=()=>setAppView('guide');
window.addEventListener('resize',()=>{if(routeMap)routeMap.invalidateSize()});
let network=null,patterns=[],selected=null,locationPoint=null,journey=null,delayDemo=0,demo=false,arrivalDelay=null;let demoPoints=0;let points=0;try{points=Number(localStorage.getItem('wld-berkeley-points')||0)||0}catch(e){}$('points').textContent=points;
const REWARD_HISTORY_KEY='wld-berkeley-reward-history';
let rewardHistory=[];try{const saved=JSON.parse(localStorage.getItem(REWARD_HISTORY_KEY)||'[]');if(Array.isArray(saved))rewardHistory=saved.filter(x=>x&&typeof x==='object').slice(0,20)}catch(e){}
function renderRewardHistory(){
 const el=$('rewardHistory');el.innerHTML='';
 if(!rewardHistory.length){el.textContent='No rewards collected yet. Your points stay saved on this browser.';return}
 for(const item of rewardHistory.slice(0,8)){
  const line=document.createElement('p');line.className='hint';line.style.margin='8px 0';
  line.textContent='+'+item.earned+' pts · '+item.minutes+' min · '+item.route+' · '+new Date(item.time).toLocaleDateString();
  el.append(line);
 }
}
// 511 provides both scheduled and predicted times. Never call a prediction live
// unless the vehicle's own report is recent and the expected time is plausible.
function freshArrivalPrediction(visit,now=Date.now()){
 const recorded=Date.parse(visit?.recorded||'');
 const expected=Date.parse(visit?.expected||'');
 const aimed=Date.parse(visit?.aimed||'');
 if(![recorded,expected,aimed].every(Number.isFinite))return null;
 if(recorded>now+60000||now-recorded>300000)return null;
 if(expected<now-120000||expected>now+14400000)return null;
 return {recorded,expected,aimed,delayMinutes:Math.max(0,Math.round((expected-aimed)/60000))};
}
function isFreshJourneyPrediction(j,now=Date.now()){
 return !!(j&&!j.demo&&Number.isFinite(j.delay)&&Number.isFinite(j.sampled)&&now-j.sampled<150000&&Number.isFinite(j.recorded)&&j.recorded<=now+60000&&now-j.recorded<=300000);
}
function updateLiveDashboard(){
 const active=!!journey;
 const fresh=isFreshJourneyPrediction(journey);
 const delay=active?(journey.demo?delayDemo:(fresh?journey.delay:null)):null;
 $('liveRouteText').textContent=active?journey.route+(journey.demo?' · Simulation':' · Destination prediction'):'Start a trip from Rewards to monitor delays.';
 $('liveTrackingState').textContent=!active?'No active trip':journey.demo?'Simulation active':fresh?'Live prediction received':'Waiting for fresh prediction';
 $('liveDelayValue').textContent=delay===null?'—':String(delay);
 $('livePointsValue').textContent=delay===null?'0':String(Math.max(0,delay)*10);
 $('liveProgressFill').style.width=delay===null?'0%':Math.min(100,Math.max(0,delay)*5)+'%';
 $('liveDataNote').textContent=!active?'No trip is being tracked.':journey.demo?'Demo minutes only. No transit data.':fresh?'Provisional delay based on a fresh 511 destination prediction.':'No fresh matching prediction. Points unavailable.';
 $('liveLastUpdate').textContent=journey?.sampled?'Last prediction: '+new Date(journey.sampled).toLocaleTimeString():'Updates require this page to remain open.';
 $('liveRefresh').disabled=!active||journey.demo;$('liveFinish').disabled=!active;
}
function updateDelayPreview(){
 const el=$('delayPreview');
 if(!journey){el.textContent='Start a selected trip to track delay rewards.';updateLiveDashboard();return}
 if(journey.demo){el.textContent='Simulation: '+delayDemo+' min · '+delayDemo*10+' fictional demo points.';updateLiveDashboard();return}
 el.textContent=!isFreshJourneyPrediction(journey)?'511 delay data is not confirmed for this trip. The prototype will not invent a delay or award unverified points.':'511 destination prediction: scheduled '+fmt(journey.aimed)+' · predicted '+fmt(journey.expected)+' · '+journey.delay+' min late · '+journey.delay*10+' provisional prototype points. Vehicle reported '+fmt(new Date(journey.recorded).toISOString())+'. Not an observed arrival.';updateLiveDashboard();
}
async function sampleJourneyDelay(){
 const j=journey;if(!j||j.demo||j.busy)return;j.busy=true;
 try{
  const response=await api('/api/arrivals?code='+encodeURIComponent(j.exitCode));
  if(j!==journey)return;
  const norm=x=>String(x||'').split(':').pop().replace(/[^a-z0-9]/gi,'').toLowerCase();
  const routeMatches=(response.arrivals||[]).filter(x=>norm(x.route)===norm(j.routeId));
  const fresh=routeMatches.filter(x=>freshArrivalPrediction(x));
  const visit=j.vehicle?fresh.find(x=>x.vehicle&&String(x.vehicle)===String(j.vehicle)):(fresh.length===1?fresh[0]:null);
  const prediction=freshArrivalPrediction(visit);
  if(!prediction){
   j.delay=null;j.sampled=null;j.recorded=null;j.aimed=null;j.expected=null;
   $('journeyStatus').textContent=routeMatches.length===0?'511 has no destination prediction for this route. No points can be verified.':fresh.length===0?'511 destination predictions are missing or stale. No points awarded.':fresh.length>1&&!j.vehicle?'511 reports multiple buses on this route; the prototype cannot identify your bus. No points awarded.':'No recent prediction for the previously matched vehicle. No points awarded.';
   return;
  }
  // A missing vehicle identifier cannot be safely carried over to another bus.
  if(!visit.vehicle){
   j.delay=null;j.sampled=null;j.recorded=null;
   $('journeyStatus').textContent='511 did not identify the vehicle. Trip delay cannot be attributed; no points awarded.';
   return;
  }
  j.vehicle=String(visit.vehicle);
  j.delay=prediction.delayMinutes;j.sampled=Date.now();j.recorded=prediction.recorded;
  j.aimed=visit.aimed;j.expected=visit.expected;
  $('journeyStatus').textContent='511 destination: scheduled '+fmt(visit.aimed)+', predicted '+fmt(visit.expected)+' ('+j.delay+' min late). Vehicle last reported '+fmt(visit.recorded)+'.';
 }catch(e){if(j===journey){j.delay=null;j.sampled=null;j.recorded=null;$('journeyStatus').textContent='Live tracking unavailable: '+e.message}}
 finally{j.busy=false;if(j===journey)updateDelayPreview()}
}
function stopDelayMonitor(){if(window.wldDelayTimer){clearInterval(window.wldDelayTimer);window.wldDelayTimer=null}}

renderRewardHistory();
$('exportRewards').onclick=()=>{
 const backup={app:'we-love-delays',version:1,exportedAt:new Date().toISOString(),points,rewardHistory};
 const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='we-love-delays-rewards.json';document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
 $('backupStatus').textContent='Rewards backup created. Keep the file somewhere safe.';
};
$('importRewards').onclick=()=>$('rewardsFile').click();
$('rewardsFile').onchange=async e=>{
 const file=e.target.files?.[0];if(!file)return;
 try{
  if(file.size>200000)throw Error('Backup file is too large.');
  const data=JSON.parse(await file.text());
  if(data?.app!=='we-love-delays'||data.version!==1||!Number.isSafeInteger(data.points)||data.points<0||!Array.isArray(data.rewardHistory))throw Error('Not a valid We Love Delays rewards backup.');
  if(data.rewardHistory.length>20)throw Error('Backup has too many history entries.');
  const history=data.rewardHistory.map(x=>{
   if(!x||!Number.isSafeInteger(x.earned)||x.earned<0||!Number.isSafeInteger(x.minutes)||x.minutes<0||typeof x.route!=='string'||x.route.length>150||typeof x.time!=='string'||!Number.isFinite(Date.parse(x.time)))throw Error('Backup contains invalid trip history.');
   return {earned:x.earned,minutes:x.minutes,route:x.route,time:x.time};
  });
  if(!window.confirm('Imported prototype points are unverified and cannot be redeemed. Replace your current '+points+' points and '+rewardHistory.length+' saved trips with '+data.points+' points and '+history.length+' trips from this backup?'))return;
  try{
   localStorage.setItem('wld-berkeley-points',String(data.points));
   localStorage.setItem(REWARD_HISTORY_KEY,JSON.stringify(history));
  }catch(err){throw Error('Browser storage is unavailable; import was not completed.')}
  points=data.points;rewardHistory=history;$('points').textContent=points;renderRewardHistory();
  $('backupStatus').textContent='✓ Rewards restored: '+points+' points and '+history.length+' saved trips.';
 }catch(err){$('backupStatus').textContent='Could not import rewards: '+err.message}
 finally{e.target.value=''}
};
function say(s){$('message').textContent=s}function option(sel,label,value){const o=document.createElement('option');o.value=value;o.textContent=label;sel.append(o)}function reset(sel,label){sel.innerHTML='';option(sel,label,'');sel.disabled=true}function fmt(x){if(!x)return '—';const d=new Date(x);return isNaN(d)?'—':d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}function distance(a,b,c,d){const r=Math.PI/180,x=(c-a)*r,y=(d-b)*r*Math.cos((a+c)/2*r);return Math.hypot(x,y)*6371}async function api(url){const r=await fetch(url);const data=await r.json();if(!r.ok)throw Error(data.error||'Request failed');return data}function show(){ $('welcome').classList.add('off');$('welcome').style.pointerEvents='none';$('welcome').style.visibility='hidden';window.scrollTo({top:0,behavior:'smooth'})} $('startNow').onclick=show;$('home').onclick=()=>{$('welcome').classList.remove('off');$('welcome').style.pointerEvents='auto';$('welcome').style.visibility='visible';};
async function load(){try{const st=await api('/api/status');$('feedStatus').textContent=st.configured?'● AC Transit · 511 connected':'● API token not configured';if(!st.configured){say('511 API token is missing in Render environment settings. Live routes cannot load. Demo is available only if you explicitly choose it.');$('feedStatus').textContent='● 511 token missing';return}say('Downloading AC Transit routes and stop patterns from 511. First load may take a moment…');network=await api('/api/network');demo=false;populateRoutes();populateStopSuggestions();if(locationPoint)applyStartingCoordinates(locationPoint.lat,locationPoint.lon,'Your location');say('AC Transit data loaded. Enter two stops to find direct or one-transfer bus options.')}catch(e){say('Live data unavailable: '+e.message+' · The app will not substitute simulated routes. You may choose demo mode manually.');$('feedStatus').textContent='● Live data unavailable';reset($('route'),'Live routes unavailable');reset($('pattern'),'Select a route first');reset($('board'),'Select a direction first');reset($('exit'),'Select a boarding stop first')}}
function populateRoutes(){const r=$('route'),filter=$('routeFilter').value.trim().toLowerCase(),previous=r.value;reset(r,'Select an AC Transit bus route');const routes=(network.routes||[]).filter(x=>(x.name+' '+(x.description||'')).toLowerCase().includes(filter));routes.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true})).forEach(x=>option(r,x.name+(x.description?' · '+x.description:''),x.id));r.disabled=!routes.length;if(routes.some(x=>x.id===previous))r.value=previous;else {reset($('pattern'),'Select a route first');reset($('board'),'Select a direction first');reset($('exit'),'Select a boarding stop first');$('preview').disabled=true;$('startJourney').disabled=true}if(!routes.length)say('No routes match this filter. Clear the filter or try a different route number.')} $('routeFilter').oninput=()=>{if(network)populateRoutes()};

function populateStopSuggestions(){
 // Refresh text entered while the route network was still loading.
 for(const id of ['originSearch','place']){
  if($(id).value.trim()&&!selectedStopIds[id]&&!selectedPlaces[id])$(id).dispatchEvent(new Event('input',{bubbles:true}));
 }
}
function matchStops(q){q=(q||'').trim().toLowerCase();if(!q||!network)return [];const all=Object.values(network.stops);const exact=all.filter(s=>s.name.toLowerCase()===q||String(s.code||'').toLowerCase()===q);return (exact.length?exact:q.length>=3?all.filter(s=>s.name.toLowerCase().includes(q)):[]).slice(0,100)}
const selectedPlaces={originSearch:null,place:null};const selectedStopIds={originSearch:null,place:null};
function attachAutocomplete(inputId,listId){
 const field=$(inputId),list=$(listId);let request=0,timer=null;
 field.addEventListener('input',()=>{
  selectedPlaces[inputId]=null;selectedStopIds[inputId]=null;const current=++request;clearTimeout(timer);list.innerHTML='';
  const q=field.value.trim().toLowerCase();if(q.length<2)return;
  const seen=new Set(),matches=[];
  for(const stop of Object.values(network?.stops||{})){const name=stop.name||'';if(name.toLowerCase().includes(q)&&!seen.has(name)){seen.add(name);matches.push({name,type:'stop',id:stop.id})}}
  matches.sort((a,b)=>(a.name.toLowerCase().startsWith(q)?0:1)-(b.name.toLowerCase().startsWith(q)?0:1)||a.name.localeCompare(b.name));
  const draw=(places=[])=>{if(current!==request)return;list.innerHTML='';
   const choices=[...matches.slice(0,5),...places.slice(0,5).map(p=>({...p,type:'place'}))];
   for(const item of choices){const btn=document.createElement('button');btn.type='button';btn.textContent=(item.type==='place'?'📍 ':'🚌 ')+item.name+(item.detail?' · '+item.detail:'');btn.onclick=()=>{field.value=item.name;selectedPlaces[inputId]=item.type==='place'?item:null;selectedStopIds[inputId]=item.type==='stop'?item.id:null;list.innerHTML='';field.focus();if(item.type==='place'&&ensureMap()){if(placeMarker)routeMap.removeLayer(placeMarker);placeMarker=L.marker([item.lat,item.lon]).bindPopup(item.name).addTo(routeMap);routeMap.setView([item.lat,item.lon],15);$('mapText').textContent='Pin: '+item.name+'. Nearby transit stops will be used for route search.'}};list.append(btn)}
  };
  draw();if(q.length>=3){timer=setTimeout(async()=>{try{const data=await api('/api/places?q='+encodeURIComponent(q));if(current!==request)return;draw(data.places||[]);if(!(data.places||[]).length&&!matches.length){list.textContent='No nearby places found. Try a more specific name.'}}catch(e){if(current===request){const note=document.createElement('div');note.className='hint';note.style.padding='10px';note.textContent='Business suggestions unavailable: '+e.message;list.append(note)}}},650)}
 });
 field.addEventListener('keydown',e=>{if(e.key==='Escape')list.innerHTML='';if(e.key==='ArrowDown'&&list.firstElementChild){e.preventDefault();list.firstElementChild.focus()}});
 list.addEventListener('keydown',e=>{if(e.key==='ArrowDown'&&document.activeElement.nextElementSibling){e.preventDefault();document.activeElement.nextElementSibling.focus()}if(e.key==='Escape'){list.innerHTML='';field.focus()}});
 document.addEventListener('click',e=>{if(e.target!==field&&!list.contains(e.target))list.innerHTML=''});
}
function stopsForInput(id){
 if(selectedStopIds[id]&&network.stops[selectedStopIds[id]])return [network.stops[selectedStopIds[id]]];
 const place=selectedPlaces[id];if(!place)return matchStops($(id).value);
 const candidates=Object.values(network.stops).filter(s=>Number.isFinite(s.lat)&&Number.isFinite(s.lon))
  .map(s=>({s,d:distance(Number(place.lat),Number(place.lon),s.lat,s.lon)}))
  .filter(x=>Number.isFinite(x.d)).sort((a,b)=>a.d-b.d);
 // Search up to a 1.2 km walk-radius for stops. Keep the closest 25 candidates
 // so a nearby but unserved stop doesn't hide a usable bus corridor.
 return candidates.filter(x=>x.d<=1.2).slice(0,25).map(x=>x.s);
}
attachAutocomplete('originSearch','originSuggestions');attachAutocomplete('place','destinationSuggestions');
function routeName(p){return network.routes.find(r=>r.id===p.route)?.name||p.route}
function showTransferMap(first,second){
 if(!ensureMap()){$('mapText').textContent='Interactive map unavailable. See the transfer instructions above.';return}
 if(routeLayer)routeMap.removeLayer(routeLayer);
 routeLayer=L.featureGroup().addTo(routeMap);
 const bounds=[];
 for(const [leg,color] of [[first,'#d93838'],[second,'#2463b6']]){
  const points=leg.p.stops.slice(leg.start,leg.end+1).map(id=>network.stops[id]).filter(x=>x&&Number.isFinite(x.lat)&&Number.isFinite(x.lon)).map(x=>[x.lat,x.lon]);
  if(points.length>=2){L.polyline(points,{color,weight:5,opacity:.9}).addTo(routeLayer);bounds.push(...points)}
 }
 const stopA=network.stops[first.p.stops[first.start]],stopX=network.stops[first.p.stops[first.end]],stopY=network.stops[second.p.stops[second.start]],stopB=network.stops[second.p.stops[second.end]];
 for(const [stop,label,color] of [[stopA,'Board','#16803b'],[stopX,'Get off to transfer','#d93838'],[stopY,'Board second bus','#2463b6'],[stopB,'Destination','#16803b']]){
  if(stop&&Number.isFinite(stop.lat)&&Number.isFinite(stop.lon)){L.circleMarker([stop.lat,stop.lon],{radius:8,color,fillColor:'#fff',fillOpacity:1,weight:3}).bindPopup(label+': '+stop.name).addTo(routeLayer);bounds.push([stop.lat,stop.lon])}
 }
 
 if(bounds.length)routeMap.fitBounds(L.latLngBounds(bounds).pad(.18),{maxZoom:15});
 setTimeout(()=>routeMap.invalidateSize(),100);
 $('mapText').textContent='Red: first bus. Blue: second bus. Orange dashed: pedestrian paths where available. Bus lines connect published stop coordinates, not road geometry. Check crossings, accessibility and schedules.';
}
let activeNavigation=null,gpsWatchId=null;
// Fit only the stops on the selected journey. A stale GPS point must not
// force a Berkeley trip into a world-scale view.
function focusSelectedTripMap(){
 if(typeof L==='undefined'||!routeMap||!activeNavigation?.legs?.length)return false;
 const mapElement=$('map'),rect=mapElement?.getBoundingClientRect();
 if(!rect||rect.width<100||rect.height<100)return false;
 const points=[];
 for(const leg of activeNavigation.legs){
  for(const id of leg.p.stops.slice(leg.start,leg.end+1)){
   const stop=network?.stops?.[id];
   if(stop&&Number.isFinite(stop.lat)&&Number.isFinite(stop.lon))points.push([stop.lat,stop.lon]);
  }
 }
 if(!points.length)return false;
 routeMap.invalidateSize({pan:false});
 routeMap.fitBounds(L.latLngBounds(points),{padding:[32,32],maxZoom:16,animate:false});
 return true;
}
window.wldFocusSelectedTripMap=focusSelectedTripMap;
function navStopTracking(){
 if(gpsWatchId!==null&&navigator.geolocation){navigator.geolocation.clearWatch(gpsWatchId);gpsWatchId=null}
 $('navStart').disabled=false;$('navStop').disabled=true;
}
function setNavigation(legs){
 navStopTracking();
 const timing=estimateTripTiming(legs),steps=[];
 const walk=(a,b)=>a&&b&&Number.isFinite(a.lat)&&Number.isFinite(a.lon)&&Number.isFinite(b.lat)&&Number.isFinite(b.lon)?Math.ceil(distance(a.lat,a.lon,b.lat,b.lon)*1000/75):null;
 const firstStop=network.stops[legs[0].p.stops[legs[0].start]];
 if(timing.walkStart!==null&&timing.walkStart>0)steps.push({stop:firstStop,kind:'walk-start',label:'Walk to '+(firstStop?.name||'first bus stop'),estimate:'Checking pedestrian walking route…'});
 else steps.push({stop:firstStop,kind:'walk-start',label:'Reach '+(firstStop?.name||'first bus stop'),estimate:timing.walkStart===0?'At or very near the stop':'Walking route unavailable until a starting place or GPS location is provided'});
 for(let k=0;k<legs.length;k++){
  const leg=legs[k],from=network.stops[leg.p.stops[leg.start]],to=network.stops[leg.p.stops[leg.end]];
  const count=Math.max(1,leg.end-leg.start),low=Math.max(2,Math.round(count*1.5)),high=Math.max(low+2,Math.round(count*3));
  steps.push({stop:from,kind:'board',legIndex:k,label:'Wait for and board Bus '+routeName(leg.p)+' at '+(from?.name||'boarding stop'),estimate:'Scheduled departure loading below · waiting time depends on actual service'});
  steps.push({stop:to,kind:'ride',legIndex:k,label:'Ride Bus '+routeName(leg.p)+' and get off at '+(to?.name||'destination stop'),estimate:'Scheduled riding time loading below · '+count+' stops'});
  if(k<legs.length-1){
   const next=network.stops[legs[k+1].p.stops[legs[k+1].start]];
   if(next?.id!==to?.id){const minutes=walk(to,next);steps.push({stop:next,kind:'walk-transfer',legIndex:k,label:'Walk to '+(next?.name||'next boarding stop')+' for the transfer',estimate:'Checking pedestrian transfer route…'});}
  }
 }
 const last=network.stops[legs[legs.length-1].p.stops[legs[legs.length-1].end]];
 if(timing.walkEnd!==null&&timing.walkEnd>0)steps.push({stop:selectedPlaces.place||null,kind:'walk-end',label:'Walk from '+(last?.name||'last stop')+' to your destination',estimate:'Checking pedestrian walking route…'});
 else if(timing.walkEnd===null)steps.push({stop:null,label:'Continue from the last stop to your destination',estimate:'Walking route unavailable until a destination place is provided'});
 activeNavigation={legs,steps,progress:0};
 // Guide moves the Leaflet element into its own container after route selection.
 // Refit only once that container has measured dimensions.
 const currentTrip=activeNavigation;
 setTimeout(()=>{if(activeNavigation===currentTrip)focusSelectedTripMap()},250);
 $('navigationPanel').classList.remove('hidden');
 $('navTitle').textContent=legs.length===1?'Direct bus directions':'Transfer directions';
 $('navStatus').textContent='Checking real walking paths against published AC Transit departures. GPS is not street-by-street navigation.';
 renderNavigation();
 const current=activeNavigation;
 Promise.all([applyPedestrianTimes(legs,steps),getPublishedLegTimes(legs),getWalkingJourney(legs)]).then(([,schedules,walks])=>{
  if(activeNavigation!==current)return;
  const match=chooseScheduledConnection(schedules,walks,null);
  for(let k=0;k<legs.length;k++){
   const trip=match&&!Array.isArray(match)?match.chain[k]:null;
   const boardStep=current.steps.find(x=>x.legIndex===k&&x.kind==='board');
   const rideStep=current.steps.find(x=>x.legIndex===k&&x.kind==='ride');
   if(boardStep)boardStep.estimate=trip?'Catchable published departure: '+new Date(trip.departure).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'No catchable published departure verified';
   if(rideStep)rideStep.estimate=trip?'Published ride: '+trip.ride_minutes+' min · scheduled arrival '+new Date(trip.arrival).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'Scheduled ride time unavailable';
  }
  $('navStatus').textContent=match&&!Array.isArray(match)?'Published schedule connection checked with real pedestrian routes and walking buffers. Leave by '+new Date(match.leave).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})+'. Not live bus predictions.':'No catchable connection verified with available walking routes and published schedules. Check another route or time.';
  renderNavigation();
 }).catch(e=>{if(activeNavigation===current){$('navStatus').textContent='Journey timing unavailable: '+e.message+'. No catchable connection verified.';renderNavigation()}});

}
function renderNavigation(){
 if(!activeNavigation)return;
 const list=$('navSteps');list.innerHTML='';
 activeNavigation.steps.forEach((step,i)=>{
  const el=document.createElement('div');el.className='nav-step'+(i===activeNavigation.progress?' active':i<activeNavigation.progress?' done':'');
  const label=document.createElement('strong');label.textContent=(i+1)+'. '+step.label;
  const estimate=document.createElement('small');estimate.textContent=step.estimate||'';
  estimate.style.display='block';estimate.style.marginTop='4px';
  const symbol=document.createElement('span');symbol.className='nav-step-symbol';symbol.setAttribute('aria-hidden','true');symbol.textContent=step.kind==='board'?'▣':step.kind==='ride'?'➜':step.kind?.startsWith('walk')?'↗':'●';
  el.prepend(symbol);el.append(label,estimate);list.append(el)
 });
 const step=activeNavigation.steps[activeNavigation.progress];
 $('navNext').textContent=step?'Next: '+step.label+(step.estimate?' · '+step.estimate:''):'All listed steps completed';
}
$('navAdvance').onclick=()=>{
 if(!activeNavigation)return;
 if(activeNavigation.progress<activeNavigation.steps.length)activeNavigation.progress++;
 renderNavigation();
 $('navStatus').textContent='Step marked complete manually. Confirm boarding, alighting and pedestrian access yourself; GPS cannot verify these actions.';
};
function updateNavigationPosition(lat,lon,accuracy){
 locationPoint={lat,lon};showLocationOnMap();
 if(!activeNavigation)return;
 const steps=activeNavigation.steps;
 // Only advance sequentially when physically near the next waypoint.
 while(activeNavigation.progress<steps.length){
  const step=steps[activeNavigation.progress],p=step.stop;
  if(step.kind==='board'||step.kind==='ride'||!p||!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||!Number.isFinite(accuracy)||accuracy>60||distance(lat,lon,p.lat,p.lon)>0.06)break;
  activeNavigation.progress++;
 }
 renderNavigation();
 const next=steps[activeNavigation.progress],p=next?.stop;
 const km=p&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)?distance(lat,lon,p.lat,p.lon):null;
 $('navStatus').textContent=next?(km===null?'GPS active · Next stop location unavailable':'GPS active · '+Math.round(km*1000)+' m straight-line to next listed stop · accuracy ±'+Math.round(accuracy||0)+' m'):'You are near the final listed stop. Confirm your destination yourself.';
 if(routeMap&&locationMarker){locationMarker.bringToFront();routeMap.panTo([lat,lon],{animate:true})}
}
$('navStart').onclick=()=>{
 if(!activeNavigation)return;
 if(!window.isSecureContext||!navigator.geolocation){$('navStatus').textContent='Live tracking requires HTTPS and a browser with location access.';return}
 navStopTracking();
 $('navStatus').textContent='Requesting GPS permission… Keep this page open while following your journey.';
 $('navStart').disabled=true;$('navStop').disabled=false;
 gpsWatchId=navigator.geolocation.watchPosition(
  p=>updateNavigationPosition(p.coords.latitude,p.coords.longitude,p.coords.accuracy),
  e=>{navStopTracking();$('navStatus').textContent='Location tracking stopped: '+(e.message||'check browser location permissions')+'. You can still follow the written directions.'},
  {enableHighAccuracy:true,maximumAge:5000,timeout:20000}
 );
};
$('navStop').onclick=()=>{navStopTracking();$('navStatus').textContent='GPS following paused. Directions remain available.'};
window.addEventListener('pagehide',navStopTracking);
function routeChoice(out,title,detail,choose){
 const btn=document.createElement('button');btn.type='button';btn.className='route-choice route-result-card';btn.setAttribute('aria-pressed','false');
 const badge=document.createElement('span');badge.className='route-result-badge';badge.textContent=/transfer|→/i.test(title)?'1 transfer':'Direct bus';btn.append(badge);
 const label=document.createElement('strong');label.textContent=title;btn.append(label);
 const sub=document.createElement('small');sub.textContent=detail+' · Tap to select';btn.append(sub);
 const foot=document.createElement('span');foot.className='route-result-foot';foot.textContent='View directions  ↗';btn.append(foot);
 btn.onclick=()=>{
  out.querySelectorAll('.route-choice').forEach(x=>{x.setAttribute('aria-pressed','false');x.querySelector('small').textContent=x.querySelector('small').textContent.replace(' · Selected','')});
  btn.setAttribute('aria-pressed','true');sub.textContent=detail+' · Selected';
  choose();
 };
 out.append(btn);return btn;
}
function estimateTripTiming(legs){
 const first=network.stops[legs[0].p.stops[legs[0].start]],last=network.stops[legs[legs.length-1].p.stops[legs[legs.length-1].end]];
 const origin=walkingEndpoint('originSearch'),destination=walkingEndpoint('place');
 const walk=(a,b)=>a&&b&&Number.isFinite(a.lat)&&Number.isFinite(a.lon)&&Number.isFinite(b.lat)&&Number.isFinite(b.lon)?Math.ceil(distance(a.lat,a.lon,b.lat,b.lon)*1000/75):null;
 const walkStart=walk(origin,first),walkEnd=walk(last,destination);
 let walkTransfer=0,transferKnown=true;
 for(let i=0;i<legs.length-1;i++){const a=network.stops[legs[i].p.stops[legs[i].end]],b=network.stops[legs[i+1].p.stops[legs[i+1].start]],v=walk(a,b);if(v===null)transferKnown=false;else walkTransfer+=v}
 return {walkStart,walkEnd,walkTransfer:transferKnown?walkTransfer:null};
}
// A deliberate place/stop selection always wins over a previously acquired GPS point.
function walkingEndpoint(inputId){
 const stopId=selectedStopIds[inputId];
 return selectedPlaces[inputId]
  ||(stopId&&network?.stops?.[stopId])
  ||stopsForInput(inputId)[0]
  ||(inputId==='originSearch'?locationPoint:null);
}
async function getPedestrianLeg(a,b){
 if(!a||!b||![a.lat,a.lon,b.lat,b.lon].every(Number.isFinite))return null;
 if((a.id&&b.id&&a.id===b.id)||(Math.abs(a.lat-b.lat)<0.00001&&Math.abs(a.lon-b.lon)<0.00001))
  return {available:true,minutes:0,meters:0,geometry:null,source:'Same stop'};
 const params=new URLSearchParams({from_lat:String(a.lat),from_lon:String(a.lon),to_lat:String(b.lat),to_lon:String(b.lon)});
 const data=await api('/api/walk-route?'+params.toString());
 if(!data.available||!Number.isFinite(data.minutes)||!Number.isFinite(data.meters)||data.minutes<0||data.meters<0)return null;
 return data;
}
async function applyPedestrianTimes(legs,steps){
 const tasks=[];
 const first=network.stops[legs[0].p.stops[legs[0].start]];
 const last=network.stops[legs[legs.length-1].p.stops[legs[legs.length-1].end]];
 tasks.push({step:steps.find(x=>x.kind==='walk-start'),a:walkingEndpoint('originSearch'),b:first});
 for(let k=0;k<legs.length-1;k++){
  tasks.push({step:steps.find(x=>x.kind==='walk-transfer'&&x.legIndex===k),a:network.stops[legs[k].p.stops[legs[k].end]],b:network.stops[legs[k+1].p.stops[legs[k+1].start]]});
 }
 tasks.push({step:steps.find(x=>x.kind==='walk-end'),a:last,b:walkingEndpoint('place')});
 await Promise.all(tasks.filter(x=>x.step).map(async x=>{
  try{const data=await getPedestrianLeg(x.a,x.b);x.step.estimate=data?(data.source==='Same stop'?'Already at this stop · no walk required':'Pedestrian route: '+data.minutes+' min · '+data.meters+' m (OpenRouteService; accessibility not verified)'):'Walking route unavailable · distance and duration not verified'}
  catch(e){x.step.estimate='Walking route unavailable · '+e.message}
 }));
}
async function getPublishedLegTimes(legs){
 const results=[];
 for(const leg of legs){
  const query=new URLSearchParams({trip:leg.p.sample_trip,board:String(leg.start),exit:String(leg.end)});
  const response=await api('/api/scheduled-journey?'+query.toString());
  results.push(response.trips||[]);
 }
 return results;
}
async function getWalkingJourney(legs){
 const first=network.stops[legs[0].p.stops[legs[0].start]];
 const last=network.stops[legs[legs.length-1].p.stops[legs[legs.length-1].end]];
 const origin=walkingEndpoint('originSearch'),destination=walkingEndpoint('place');
 const tasks=[
  {a:origin,b:first},
  ...legs.slice(0,-1).map((leg,k)=>({a:network.stops[leg.p.stops[leg.end]],b:network.stops[legs[k+1].p.stops[legs[k+1].start]]})),
  {a:last,b:destination}
 ];
 return Promise.all(tasks.map(async ({a,b})=>{
  if(!a||!b)return null;
  if((a.id&&b.id&&a.id===b.id)||(a.lat===b.lat&&a.lon===b.lon))return {available:true,minutes:0,meters:0,geometry:null,source:'Same stop'};
  try{return await getPedestrianLeg(a,b)}catch(e){return {error:String(e.message||e).slice(0,180)}}
 }));
}
async function drawPedestrianPaths(legs){
 if(!routeMap||!routeLayer||typeof L==='undefined')return;
 const layer=routeLayer;
 const first=network.stops[legs[0].p.stops[legs[0].start]],last=network.stops[legs[legs.length-1].p.stops[legs[legs.length-1].end]];
 const origin=walkingEndpoint('originSearch'),destination=walkingEndpoint('place');
 const pairs=[{a:origin,b:first},...legs.slice(0,-1).map((leg,k)=>({a:network.stops[leg.p.stops[leg.end]],b:network.stops[legs[k+1].p.stops[legs[k+1].start]]})),{a:last,b:destination}];
 await Promise.all(pairs.map(async ({a,b})=>{
  if(!a||!b||(a.lat===b.lat&&a.lon===b.lon))return;
  try{
   const data=await getPedestrianLeg(a,b);
   if(layer!==routeLayer||!data||data.geometry?.type!=='LineString')return;
   const points=(data.geometry.coordinates||[]).filter(p=>Array.isArray(p)&&p.length>=2&&p.every(Number.isFinite)).map(p=>[p[1],p[0]]);
   if(points.length<2)return;
   L.polyline(points,{color:'#e49a16',weight:5,dashArray:'7 7',opacity:.95}).bindPopup('Pedestrian path: '+data.minutes+' min · '+data.meters+' m. Accessibility not verified.').addTo(layer);
  }catch(e){/* Leave the bus map visible if pedestrian routing fails. */}
 }));
}
function chooseScheduledConnection(schedules,walks,arrivalDeadline){
 const now=Date.now(),buffer=5*60000,connectionBuffer=3*60000;
 if(!walks||walks.some(x=>!x||!Number.isFinite(x.minutes)))return null;
 const valid=schedules.map(list=>(list||[]).filter(t=>Number.isFinite(Date.parse(t.departure))&&Number.isFinite(Date.parse(t.arrival))&&Date.parse(t.arrival)>=Date.parse(t.departure)).sort((a,b)=>Date.parse(a.departure)-Date.parse(b.departure)));
 if(valid.some(list=>!list.length))return [];
 const candidates=[];
 for(const first of valid[0]){
  const leave=Date.parse(first.departure)-(walks[0].minutes+5)*60000;
  if(leave<now)continue;
  let paths=[{chain:[first],arrival:Date.parse(first.arrival)}];
  for(let k=1;k<valid.length;k++){
   const nextPaths=[];
   for(const path of paths){
    for(const trip of valid[k]){
     if(Date.parse(trip.departure)<path.arrival+walks[k].minutes*60000+connectionBuffer)continue;
     nextPaths.push({chain:[...path.chain,trip],arrival:Date.parse(trip.arrival)});
    }
   }
   paths=nextPaths.sort((a,b)=>a.arrival-b.arrival).slice(0,100);
   if(!paths.length)break;
  }
  for(const path of paths){
   if(path.chain.length!==valid.length)continue;
   const arrival=path.arrival+walks[walks.length-1].minutes*60000;
   if(arrivalDeadline!==null&&arrival>arrivalDeadline)continue;
   candidates.push({chain:path.chain,leave,arrival});
  }
 }
 if(!candidates.length)return [];
 candidates.sort((a,b)=>a.leave-b.leave||a.arrival-b.arrival);
 return arrivalDeadline===null?candidates[0]:candidates[candidates.length-1];
}
function appendTripTiming(panel,legs){
 if(!legs?.length)return;
 const block=document.createElement('div');block.className='notice';
 const heading=document.createElement('strong');heading.textContent='Journey timing · published schedules + pedestrian routes';block.append(heading);
 const status=document.createElement('p');status.textContent='Checking published bus times and pedestrian paths…';block.append(status);
 const line=document.createElement('p');line.textContent='Calculating actual walking routes…';block.append(line);
 const label=document.createElement('label');label.textContent='When do you need to arrive? ';const input=document.createElement('input');input.type='time';input.setAttribute('aria-label','Desired arrival time');label.append(input);block.append(label);
 const result=document.createElement('p');result.className='hint';block.append(result);panel.append(block);
 let schedules=null,walks=null;
 const format=ms=>new Date(ms).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
 const render=()=>{
  if(!schedules||!walks)return;
  if(walks.some(x=>!x||!Number.isFinite(x.minutes))){
   result.textContent='A pedestrian leg could not be verified. Departure feasibility and leave-by time are unavailable; choose both locations and retry.';return;
  }
  let deadline=null;
  if(input.value){const [h,m]=input.value.split(':').map(Number);const target=new Date();target.setHours(h,m,0,0);if(target.getTime()<Date.now())target.setDate(target.getDate()+1);deadline=target.getTime()}
  const match=chooseScheduledConnection(schedules,walks,deadline);
  if(!match){result.textContent='Unable to verify walking time for this trip.';return}
  if(Array.isArray(match)){result.textContent='No catchable scheduled journey was found in the returned departure window'+(deadline?' for that arrival time':'')+'. Try a different route or time. This is not a live bus prediction.';return}
  const legsText=match.chain.map((trip,i)=>'Bus '+(i+1)+': '+format(Date.parse(trip.departure))+'–'+format(Date.parse(trip.arrival))).join(' · ');
  result.textContent='Leave by approximately '+format(match.leave)+' (5-minute boarding buffer). '+legsText+'. Reach destination around '+format(match.arrival)+'. Transfers include real pedestrian walking time and a 3-minute connection buffer. Published schedules only; actual delays may change feasibility.';
 };
 input.onchange=render;
 Promise.all([getPublishedLegTimes(legs),getWalkingJourney(legs)]).then(([s,w])=>{
  if(!block.isConnected)return;
  schedules=s;walks=w;
  const descriptions=w.map((x,i)=>i===0?'First walk: ':i===w.length-1?'Final walk: ':'Transfer '+i+': ');
  line.textContent=w.map((x,i)=>descriptions[i]+(Number.isFinite(x?.minutes)&&Number.isFinite(x?.meters)?x.minutes+' min / '+x.meters+' m': 'unavailable')).join(' · ')+'. Walking times use ORS where a walk is required; accessibility not independently verified.';
  status.textContent='Published 511 AC Transit schedules checked; connections require reaching each stop before departure.';
  render();
 }).catch(e=>{if(block.isConnected)status.textContent='Journey schedule unavailable: '+e.message+'. No leave-by time will be estimated.'});
}
function showSelectedRoute(out,title,steps,legs){
 let panel=$('selectedRoutePanel');
 if(!panel){panel=document.createElement('div');panel.id='selectedRoutePanel';panel.className='selected-route';out.insertBefore(panel,out.children[1]||null)}
 panel.innerHTML='';
 const heading=document.createElement('strong');heading.textContent='✓ Selected route: '+title;panel.append(heading);
 for(const step of steps){const p=document.createElement('p');p.textContent=step;panel.append(p)}
 appendTripTiming(panel,legs);
 const note=document.createElement('p');note.className='hint';note.textContent='Candidate stop-order route. The timing panel checks published schedules and pedestrian paths; it does not verify live arrivals, accessibility, or on-time operation.';panel.append(note);
 const mapBtn=document.createElement('button');mapBtn.type='button';mapBtn.className='btn';mapBtn.textContent='View selected route on map';mapBtn.onclick=()=>{if(window.innerWidth<=790&&typeof window.wldSelectTab==='function')window.wldSelectTab('map');else $('map').scrollIntoView({behavior:'smooth',block:'center'});if(routeMap)setTimeout(()=>routeMap.invalidateSize(),150)};panel.append(mapBtn);
}
async function resolveTypedLocation(id){
 const value=$(id).value.trim();
 if(!value||selectedStopIds[id]||selectedPlaces[id])return;
 if(matchStops(value).length)return;
 try{
  const data=await api('/api/places?q='+encodeURIComponent(value));
  const places=(data.places||[]).filter(p=>Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lon)));
  const exact=places.find(p=>p.name?.trim().toLowerCase()===value.toLowerCase());
  // A typed address or business name may have several nearby search hits.
  // Prefer a close textual match, but never silently choose an unrelated result.
  const normalize=x=>String(x||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const needle=normalize(value);
  const ranked=places.map(p=>({p,name:normalize(p.name),detail:normalize(p.detail)}))
   .filter(x=>x.name===needle||x.name.includes(needle)||needle.includes(x.name)&&x.name.length>=5||x.detail.includes(needle))
   .sort((a,b)=>Number(b.name===needle)-Number(a.name===needle));
  const place=exact||ranked[0]?.p||(places.length===1?places[0]:null);
  if(place&&$(id).value.trim()===value)selectedPlaces[id]=place;
 }catch(e){console.warn('Place lookup unavailable:',e)}
}
let findingTrip=false;
async function findDirectTrips(){
 if(findingTrip)return;
 findingTrip=true;const button=$('autoFind');button.disabled=true;
 const out=$('autoResults');out.textContent='Finding nearby stops and bus routes…';
 try{
 if(!network){out.textContent='Routes have not loaded yet. Check the live-data status.';return}
 await Promise.all([resolveTypedLocation('originSearch'),resolveTypedLocation('place')]);
 const a=stopsForInput('originSearch'),b=stopsForInput('place');
 if(!a.length||!b.length){
  const missing=[!a.length?'starting location':null,!b.length?'destination':null].filter(Boolean).join(' and ');
  out.textContent='Could not match your '+missing+' to an AC Transit stop or nearby place. Choose a stop suggestion, pick a destination on the map, or use Choose a bus route below.';
  return
 }
 out.innerHTML='';
 const from=new Set(a.map(s=>s.id)),to=new Set(b.map(s=>s.id));
 const direct=[],firstLegs=[],lastLegs=[],seen=new Set();
 const patternsWithStops=network.patterns.filter(p=>p.stops?.length>1);
 for(const p of patternsWithStops){
  let start=-1;
  for(let i=0;i<p.stops.length;i++){
   if(start<0&&from.has(p.stops[i]))start=i;
   if(start>=0&&i>start&&to.has(p.stops[i])){const key=p.route+'|'+p.stops[start]+'|'+p.stops[i];if(!seen.has(key)){seen.add(key);direct.push({p,start,end:i})}break}
  }
  if(start>=0)firstLegs.push({p,start});
  let end=-1;for(let i=p.stops.length-1;i>=0;i--){if(to.has(p.stops[i])){end=i;break}}
  if(end>0)lastLegs.push({p,end});
 }
 // Rank candidate direct routes by practical convenience, not just stop count.
// Distances here are straight-line approximations, not verified walking paths.
const tripOrigin=selectedPlaces.originSearch||locationPoint||(selectedStopIds.originSearch?network.stops[selectedStopIds.originSearch]:null);
const tripDestination=selectedPlaces.place||(selectedStopIds.place?network.stops[selectedStopIds.place]:null);
const safeWalk=(point,stop)=>point&&stop&&Number.isFinite(Number(point.lat))&&Number.isFinite(Number(point.lon))&&Number.isFinite(Number(stop.lat))&&Number.isFinite(Number(stop.lon))?distance(Number(point.lat),Number(point.lon),Number(stop.lat),Number(stop.lon))*1000:null;
function directRank(x){
 const first=network.stops[x.p.stops[x.start]],last=network.stops[x.p.stops[x.end]];
 const startMeters=safeWalk(tripOrigin,first),endMeters=safeWalk(tripDestination,last);
 const stops=x.end-x.start;
 // A modest penalty per stop is a convenience heuristic, NOT a time estimate.
 return {startMeters,endMeters,stops,score:stops*95+(startMeters??0)+(endMeters??0)};
}
direct.sort((x,y)=>directRank(x).score-directRank(y).score||directRank(x).stops-directRank(y).stops);
 const heading=document.createElement('p');heading.className='notice';
 if(direct.length){
  heading.textContent='Recommended direct buses · ranked by estimated walking convenience and number of stops. Not verified fastest arrivals.';out.append(heading);
  const candidateCards=[];
  for(const x of direct.slice(0,8)){
   const ranking=directRank(x);const walking=[ranking.startMeters===null?null:'~'+Math.round(ranking.startMeters)+' m to board',ranking.endMeters===null?null:'~'+Math.round(ranking.endMeters)+' m after exit'].filter(Boolean).join(' · ');
   const card=routeChoice(out,'Bus '+routeName(x.p)+' · Direct', (x.p.headsign||'Bus direction')+' · '+ranking.stops+' stops'+(walking?' · '+walking+' (straight-line)':''),()=>{
    $('routeFilter').value='';populateRoutes();$('route').value=x.p.route;$('route').onchange();
    const index=patterns.indexOf(x.p);if(index<0)return;
    $('stopFilter').value='';$('pattern').value=String(index);$('pattern').onchange();
    $('board').value=String(x.start);boardChanged();$('exit').value=String(x.end);$('exit').onchange();$('preview').click();
    const fromStop=network.stops[x.p.stops[x.start]],toStop=network.stops[x.p.stops[x.end]];
    drawPedestrianPaths([x]);setNavigation([x]);setAppView('guide');
    showSelectedRoute(out,'Bus '+routeName(x.p),['Board at '+(fromStop?.name||'starting stop'),'Get off at '+(toStop?.name||'destination stop')],[x]);
   });
   candidateCards.push({x,card,ranking});
  }
  // ORS walking time + 511 published schedules determine feasible door-to-door arrival.
  // Leave unsupported candidates visible, but never label them as verified fastest.
  const rankingNotice=document.createElement('p');rankingNotice.className='hint';
  rankingNotice.textContent='Checking real pedestrian walking routes and published bus departures…';
  heading.after(rankingNotice);
  const results=await Promise.all(candidateCards.map(async item=>{
   try{
    const [walks,schedules]=await Promise.all([getWalkingJourney([item.x]),getPublishedLegTimes([item.x])]);
    if(!walks||walks.some(w=>!w||!Number.isFinite(w.minutes)))return {...item,reason:walks?.find(w=>w?.error)?.error||'Pedestrian route unavailable for this pair of stops'};
    const valid=(schedules[0]||[]).filter(t=>Number.isFinite(Date.parse(t.departure))&&Number.isFinite(Date.parse(t.arrival)));
    const feasible=valid.map(t=>{
     const leave=Date.parse(t.departure)-(walks[0].minutes+5)*60000;
     return {leave,arrival:Date.parse(t.arrival)+walks[1].minutes*60000,trip:t};
    }).filter(t=>t.leave>=Date.now()).sort((a,b)=>a.arrival-b.arrival);
    if(!feasible.length)return {...item,reason:'No catchable scheduled departure'};
    return {...item,arrival:feasible[0].arrival,leave:feasible[0].leave,walks};
   }catch(e){return {...item,reason:String(e.message||e).slice(0,130)}}
  }));
  // Search may have been replaced by a newer query while remote services responded.
  if(!rankingNotice.isConnected||!heading.isConnected)return;
  results.sort((a,b)=>(a.arrival??Infinity)-(b.arrival??Infinity)||a.ranking.score-b.ranking.score);
  const verified=results.filter(r=>Number.isFinite(r.arrival)).length;
  heading.textContent=verified?'Recommended buses · earliest feasible scheduled arrival first':'Direct bus options · estimated convenience order';
  rankingNotice.textContent=verified?verified+' of '+results.length+' options have a feasible 511 schedule and ORS walking route. Scheduled times are not live predictions.':'Could not confirm a catchable scheduled journey for these options. You can still explore each route; check the details for walking and departure availability.';
  const fmt=ms=>new Date(ms).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
  for(const r of results){
   if(!r.card.isConnected)continue;
   const extra=document.createElement('span');extra.className='route-result-timing';
   extra.textContent=Number.isFinite(r.arrival)?'Scheduled arrival ~'+fmt(r.arrival)+' · Leave by ~'+fmt(r.leave)+' · Walk '+Math.round(r.walks.reduce((n,w)=>n+w.minutes,0))+' min (ORS)':'Time unverified · '+r.reason;
   r.card.append(extra);
   out.append(r.card);
  }
  return;
 }
 heading.textContent='No direct bus found. Checking routes with one transfer…';out.append(heading);
 const transfers=[],transferSeen=new Set();
 // Match stops served by the two legs; limit candidates to keep large GTFS feeds responsive.
 const lastByStop=new Map();
 for(const leg of lastLegs)for(let j=0;j<leg.end;j++){const id=leg.p.stops[j];if(!lastByStop.has(id))lastByStop.set(id,[]);const list=lastByStop.get(id);if(list.length<12)list.push({p:leg.p,start:j,end:leg.end})}
 for(const first of firstLegs){
  for(let i=first.start+1;i<first.p.stops.length;i++){
   const transferId=first.p.stops[i],secondLegs=lastByStop.get(transferId)||[];
   for(const second of secondLegs){
    if(first.p.route===second.p.route)continue;
    const key=first.p.route+'|'+second.p.route+'|'+transferId;
    if(transferSeen.has(key))continue;transferSeen.add(key);
    transfers.push({first:{p:first.p,start:first.start,end:i},second,transferId,score:(i-first.start)+(second.end-second.start)});
   }
  }
 }
 transfers.sort((x,y)=>x.score-y.score);
 if(!transfers.length){
  heading.textContent='No same-stop transfer found. Looking for nearby walking transfers…';
  const nearby=[],nearbySeen=new Set(),maxWalkKm=0.35;
  const candidateLast=new Map();
  for(const leg of lastLegs)for(let j=0;j<leg.end;j++){
   const id=leg.p.stops[j],stop=network.stops[id];
   if(!stop||!Number.isFinite(stop.lat)||!Number.isFinite(stop.lon))continue;
   if(!candidateLast.has(id))candidateLast.set(id,[]);
   if(candidateLast.get(id).length<8)candidateLast.get(id).push({p:leg.p,start:j,end:leg.end});
  }
  const transferStops=[...candidateLast.keys()].map(id=>({id,s:network.stops[id]}));
  for(const first of firstLegs.slice(0,250)){
   for(let i=first.start+1;i<first.p.stops.length;i++){
    const fromId=first.p.stops[i],fromStop=network.stops[fromId];
    if(!fromStop||!Number.isFinite(fromStop.lat)||!Number.isFinite(fromStop.lon))continue;
    for(const dest of transferStops){
     if(dest.id===fromId)continue;
     const km=distance(fromStop.lat,fromStop.lon,dest.s.lat,dest.s.lon);
     if(km>maxWalkKm)continue;
     for(const second of candidateLast.get(dest.id)){
      if(first.p.route===second.p.route)continue;
      const key=first.p.route+'|'+second.p.route+'|'+fromId+'|'+dest.id;
      if(nearbySeen.has(key))continue;nearbySeen.add(key);
      nearby.push({first:{p:first.p,start:first.start,end:i},second,walkKm:km,score:(i-first.start)+(second.end-second.start)+km*50});
     }
    }
   }
  }
  nearby.sort((a,b)=>a.score-b.score);
  if(nearby.length){
   heading.textContent='Possible connections with a short walk (up to 350 m straight-line). These are NOT verified walking paths or timed transfers. Check accessibility, crossings, and live service before traveling.';
   for(const t of nearby.slice(0,5)){
    const aStop=network.stops[t.first.p.stops[t.first.end]],bStop=network.stops[t.second.p.stops[t.second.start]];
    const start=network.stops[t.first.p.stops[t.first.start]],end=network.stops[t.second.p.stops[t.second.end]];
    routeChoice(out,'Bus '+routeName(t.first.p)+' → walk → Bus '+routeName(t.second.p),
     'Walk about '+Math.round(t.walkKm*1000)+' m straight-line between '+aStop.name+' and '+bStop.name,()=>{
      showTransferMap(t.first,t.second);setNavigation([t.first,t.second]);setAppView('guide');
      showSelectedRoute(out,'Bus '+routeName(t.first.p)+' → walk → Bus '+routeName(t.second.p),[
       '1. Board at '+(start?.name||'starting stop'),
       '2. Get off at '+aStop.name,
       '3. Walk to '+bStop.name+' (about '+Math.round(t.walkKm*1000)+' m straight-line; actual walking distance may be longer)',
       '4. Board Bus '+routeName(t.second.p)+' and get off at '+(end?.name||'destination')
      ],[t.first,t.second]);
      $('message').textContent='Walking transfer is an unverified possibility. Check pedestrian access, safety and bus schedules.';
      $('startJourney').disabled=true;
     });
   }
  }else{
   heading.textContent='We could not verify a connection from these stops in the available AC Transit data. Try the full transit planner below for walking transfers and other agencies.';
  }
  const firstStop=a[0],lastStop=b[0];
  if(Number.isFinite(firstStop?.lat)&&Number.isFinite(firstStop?.lon)&&Number.isFinite(lastStop?.lat)&&Number.isFinite(lastStop?.lon)){
   const link=document.createElement('a');link.className='btn alt';link.style.display='inline-block';link.style.marginTop='12px';
   link.textContent='Explore more transit options in Google Maps ↗';
   const params=new URLSearchParams({api:'1',origin:firstStop.lat+','+firstStop.lon,destination:lastStop.lat+','+lastStop.lon,travelmode:'transit'});
   link.href='https://www.google.com/maps/dir/?'+params.toString();link.target='_blank';link.rel='noopener noreferrer';out.append(link);
   const note=document.createElement('p');note.className='hint';note.textContent='External directions open with the first candidate origin and destination stops. Confirm the stops before traveling.';out.append(note);
  }
  return;
 }
 heading.textContent='Possible one-transfer routes ('+transfers.length+' found). These are stop-order connections only: schedules, transfer wait, and arrival deadlines have NOT been checked.';
 for(const t of transfers.slice(0,6)){
  const transfer=network.stops[t.transferId],start=network.stops[t.first.p.stops[t.first.start]],end=network.stops[t.second.p.stops[t.second.end]];
  routeChoice(out,'Bus '+routeName(t.first.p)+' → Bus '+routeName(t.second.p),'Transfer at '+(transfer?.name||'stop'),()=>{
   showTransferMap(t.first,t.second);
   setNavigation([t.first,t.second]);setAppView('guide');
   showSelectedRoute(out,'Bus '+routeName(t.first.p)+' → Bus '+routeName(t.second.p),[
    '1. Board Bus '+routeName(t.first.p)+' at '+(start?.name||'starting stop'),
    '2. Transfer at '+(transfer?.name||'transfer stop'),
    '3. Board Bus '+routeName(t.second.p)+' toward '+(t.second.p.headsign||'its destination'),
    '4. Get off at '+(end?.name||'destination stop')
   ],[t.first,t.second]);
   $('message').textContent='Transfer route selected. Review the instructions and map above. Check actual bus times before traveling.';
   $('arrivals').textContent='Transfer selected. Live predictions for both legs are not yet available.';
   $('scheduled').textContent=$('predicted').textContent=$('delay').textContent='—';
   $('startJourney').disabled=true;
  })
 }
 }finally{findingTrip=false;button.disabled=false}
}
$('autoFind').onclick=findDirectTrips;
function setDemo(){demo=true;network={routes:[{id:'51B',name:'51B',description:'Demo: Berkeley corridor'},{id:'6',name:'6',description:'Demo: Telegraph Avenue'}],stops:{a:{id:'a',name:'Downtown Berkeley BART',code:'',lat:37.8695,lon:-122.2686},b:{id:'b',name:'UC Berkeley / Bancroft Way',code:'',lat:37.8688,lon:-122.2586},c:{id:'c',name:'College Ave / Ashby Ave',code:'',lat:37.8564,lon:-122.2534},d:{id:'d',name:'Rockridge BART',code:'',lat:37.8447,lon:-122.2514}},patterns:[{route:'51B',direction:'0',headsign:'Rockridge (simulated)',stops:['a','b','c','d']},{route:'51B',direction:'1',headsign:'Downtown Berkeley (simulated)',stops:['d','c','b','a']},{route:'6',direction:'0',headsign:'Telegraph Avenue (simulated)',stops:['a','b','c']}]};$('feedStatus').textContent='● Berkeley demonstration';populateRoutes();populateStopSuggestions();say('Demo mode is simulated. Routes, stop sequences, and delays shown here are illustrative, not live service.');$('arrivals').textContent='Demo mode: no real-time arrivals.';$('scheduled').textContent=$('predicted').textContent=$('delay').textContent='—'}
$('route').onchange=()=>{reset($('pattern'),'Choose direction / pattern');reset($('board'),'Choose a direction first');reset($('exit'),'Choose a boarding stop first');selected=null;$('preview').disabled=true;const route=$('route').value;if(!route)return;patterns=network.patterns.filter(p=>p.route===route);patterns.sort((a,b)=>a.direction.localeCompare(b.direction)||b.stops.length-a.stops.length);patterns.forEach((p,i)=>option($('pattern'),(p.headsign||'Direction '+p.direction)+' · '+p.stops.length+' stops'+(i?' · variant '+(i+1):''),String(i)));$('pattern').disabled=!patterns.length;say(patterns.length?'Choose a direction. Some routes have multiple stop patterns.':'No ordered trip patterns available for this route.')};
$('pattern').onchange=()=>{reset($('board'),'Choose a boarding stop');reset($('exit'),'Choose a boarding stop first');selected=$('pattern').value===''?null:patterns[Number($('pattern').value)];if(!selected)return;populateBoarding();nearest()};
function populateBoarding(){reset($('board'),'Choose a boarding stop');reset($('exit'),'Choose a boarding stop first');$('preview').disabled=true;$('startJourney').disabled=true;if(!selected)return;const filter=$('stopFilter').value.trim().toLowerCase();selected.stops.forEach((id,i)=>{const s=network.stops[id];if(s&&(s.name+' '+s.code).toLowerCase().includes(filter))option($('board'),s.name+' · stop '+(s.code||s.id),String(i))});$('board').disabled=$('board').options.length===1} $('stopFilter').oninput=()=>{populateBoarding();nearest()};function nearest(){if(!locationPoint||!selected)return;const choices=selected.stops.map((id,i)=>({i,s:network.stops[id]})).filter(x=>x.s&&x.s.lat!=null&&x.s.lon!=null&&Array.from($('board').options).some(o=>o.value===String(x.i)));choices.sort((a,b)=>distance(locationPoint.lat,locationPoint.lon,a.s.lat,a.s.lon)-distance(locationPoint.lat,locationPoint.lon,b.s.lat,b.s.lon));if(choices.length){$('board').value=String(choices[0].i);$('locationText').textContent='Nearest stop on this pattern: '+choices[0].s.name+' ('+distance(locationPoint.lat,locationPoint.lon,choices[0].s.lat,choices[0].s.lon).toFixed(2)+' km straight-line). Confirm it is safe to reach.';boardChanged()}}
function boardChanged(){reset($('exit'),'Choose your destination stop');$('preview').disabled=true;$('startJourney').disabled=true;if(!selected||$('board').value==='')return;const from=Number($('board').value);selected.stops.forEach((id,i)=>{if(i<=from)return;const s=network.stops[id];if(s)option($('exit'),s.name+' · stop '+(s.code||s.id),String(i))});$('exit').disabled=false;refreshArrivals()};$('board').onchange=boardChanged;$('exit').onchange=()=>{$('preview').disabled=!$('exit').value;$('startJourney').disabled=!$('exit').value};
function applyStartingCoordinates(lat,lon,source){
 locationPoint={lat,lon};showLocationOnMap();
 if(!network?.stops){$('locationText').textContent=source+' found. Waiting for AC Transit stop data to load; your location is saved and will be applied automatically.';return}
 let nearestStop=null,best=Infinity;
 for(const stop of Object.values(network.stops)){if(!Number.isFinite(stop.lat)||!Number.isFinite(stop.lon))continue;const km=distance(lat,lon,stop.lat,stop.lon);if(km<best){best=km;nearestStop=stop}}
 if(!nearestStop){$('locationText').textContent=source+' shown on map. No bus stop coordinates available.';return}
 $('originSearch').value=nearestStop.name;selectedPlaces.originSearch=null;selectedStopIds.originSearch=nearestStop.id;$('originSuggestions').innerHTML='';
 $('locationText').textContent='✓ Starting bus stop automatically selected: '+nearestStop.name+' ('+Math.round(best*1000)+' m straight-line from '+source.toLowerCase()+'). You can change it before finding a route.';
 if($('place').value.trim())findDirectTrips();
}
$('chooseMap').onclick=()=>{
 if(window.innerWidth<=790&&typeof window.wldSelectTab==='function')window.wldSelectTab('map');
 if(!ensureMap()){$('locationText').textContent='Interactive map did not load. Please type a starting stop instead.';return}
 $('locationText').textContent='Click your starting point on the map. No GPS permission needed.';
 routeMap.invalidateSize();
 routeMap.once('click',e=>applyStartingCoordinates(e.latlng.lat,e.latlng.lng,'Map-selected location'));
 $('map').scrollIntoView({behavior:'smooth',block:'center'});
};
let locationRequestId=0;
$('locate').onclick=()=>{
 if(!window.isSecureContext){$('locationText').textContent='Location requires HTTPS. Open the secure website.';return}
 if(!navigator.geolocation){$('locationText').textContent='Location is unavailable in this browser. Enter a starting stop manually.';return}
 const id=++locationRequestId;
 $('locate').disabled=true;
 $('locate').textContent='Locating…';
 $('locationText').textContent='Finding your location and selecting the nearest bus stop. This can take a moment on the first try.';
 // Show the last position immediately while obtaining a fresher GPS fix.
 if(locationPoint&&network?.stops)applyStartingCoordinates(locationPoint.lat,locationPoint.lon,'Last known location');
 let done=false;
 const finish=()=>{
  if(done||id!==locationRequestId)return false;
  done=true;clearTimeout(watchdog);$('locate').disabled=false;$('locate').textContent='◎ Use my current location';return true
 };
 const watchdog=setTimeout(()=>{
  if(!finish())return;
  $('locationText').textContent=locationPoint?'Showing last known location; a fresh GPS fix timed out. Tap again to retry.':'GPS is taking too long. Check location permissions and try again, or choose your position on the map.';
 },30000);
 try{
  navigator.geolocation.getCurrentPosition(p=>{
   if(!finish())return;
   applyStartingCoordinates(p.coords.latitude,p.coords.longitude,'Device location');
  },e=>{
   if(!finish())return;
   $('locationText').textContent=e.code===1?'Location permission denied. Allow location access in your browser and device settings.':e.code===2?'Device location unavailable. Check location services or choose your location on the map.':'GPS timed out. Try again or choose your location on the map.';
  },{timeout:25000,maximumAge:15000,enableHighAccuracy:true});
 }catch(e){if(finish())$('locationText').textContent='Could not start location request: '+e.message}
};$('clearLoc').onclick=()=>{locationPoint=null;if(routeMap&&locationMarker){routeMap.removeLayer(locationMarker);locationMarker=null}$('locationText').textContent='Location cleared. Choose your boarding stop manually.'};
function chosenStops(){if(!selected||$('board').value===''||$('exit').value==='')return null;const ai=Number($('board').value),bi=Number($('exit').value);if(bi<=ai)return null;return [network.stops[selected.stops[ai]],network.stops[selected.stops[bi]]]}let routeMap=null,routeLayer=null,locationMarker=null,placeMarker=null;
function ensureMap(){if(typeof L==='undefined')return false;if(!routeMap){$('map').innerHTML='';routeMap=L.map('map',{scrollWheelZoom:false});L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(routeMap);routeMap.setView([37.8715,-122.2585],13)}return true}
function showLocationOnMap(){if(!locationPoint)return;if(!ensureMap()){const lat=locationPoint.lat,lon=locationPoint.lon;const d=.005;$('map').innerHTML='<iframe title="Your current location on OpenStreetMap" src="https://www.openstreetmap.org/export/embed.html?bbox='+encodeURIComponent([lon-d,lat-d,lon+d,lat+d].join(','))+'&layer=mapnik&marker='+encodeURIComponent(lat+','+lon)+'"></iframe>';$('mapText').textContent='Map pin: device-reported location. Interactive map library unavailable; showing OpenStreetMap fallback.';return}if(locationMarker)routeMap.removeLayer(locationMarker);locationMarker=L.circleMarker([locationPoint.lat,locationPoint.lon],{radius:10,color:'#176ad1',fillColor:'#176ad1',fillOpacity:.45,weight:3}).bindPopup('Your device-reported location').addTo(routeMap);routeMap.setView([locationPoint.lat,locationPoint.lon],16);setTimeout(()=>routeMap.invalidateSize(),100);$('mapText').textContent='Blue dot: your device-reported location. GPS accuracy may vary.'}
function drawRoute(){
 const stops=chosenStops();if(!stops||!selected)return;
 const ai=Number($('board').value),bi=Number($('exit').value);
 const segment=selected.stops.slice(ai,bi+1).map(id=>network.stops[id]).filter(p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lon));
 if(segment.length<2){$('mapText').textContent='Map unavailable: fewer than two stops have valid coordinates.';return}
 if(typeof L==='undefined'){$('mapText').textContent='Interactive map could not load. Check your internet connection and refresh.';return}
 if(!routeMap){$('map').innerHTML='';routeMap=L.map('map',{scrollWheelZoom:false});L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(routeMap)}
 if(routeLayer)routeMap.removeLayer(routeLayer);
 routeLayer=L.featureGroup().addTo(routeMap);
 const points=segment.map(p=>[p.lat,p.lon]);
 L.polyline(points,{color:'#d93838',weight:5,opacity:.9}).addTo(routeLayer);
 segment.forEach((p,i)=>{if(i===0||i===segment.length-1){L.circleMarker([p.lat,p.lon],{radius:9,color:i===0?'#16803b':'#d93838',fillColor:'#fff',fillOpacity:1,weight:3}).bindPopup((i===0?'Board: ':'Exit: ')+p.name).addTo(routeLayer)}});
 routeMap.fitBounds(L.latLngBounds(points),{padding:[32,32],maxZoom:16,animate:false});
 setTimeout(()=>routeMap.invalidateSize(),100);
 $('mapText').textContent='Showing '+segment.length+' ordered stops: '+stops[0].name+' → '+stops[1].name+'. Red line connects published stop coordinates; it is NOT the actual road geometry or a live vehicle position.';
}
$('preview').onclick=()=>{const stops=chosenStops();if(!stops){say('Choose a destination after your boarding stop.');return}drawRoute();say((demo?'Simulated':'Published')+' stop order shown on map. The line connects stops, not exact streets. This does not guarantee a departure at your chosen time.');$('startJourney').disabled=false;refreshArrivals()};
async function refreshArrivals(){
 if(demo){$('arrivals').textContent='Demo mode: no real-time arrivals.';return}
 if(!selected||$('board').value==='')return;
 const stop=network.stops[selected.stops[Number($('board').value)]];
 if(!stop?.code){$('arrivals').textContent='No stop code available for live monitoring at this stop.';return}
 const currentRoute=$('route').value,currentStop=stop.id;
 $('arrivals').textContent='Checking 511 arrivals…';$('refresh').disabled=true;
 try{
  const result=await api('/api/arrivals?code='+encodeURIComponent(stop.code));
  if(currentRoute!==$('route').value||currentStop!==selected.stops[Number($('board').value)])return;
  const routeLabel=network.routes.find(x=>x.id===currentRoute)?.name||'';
  const norm=x=>String(x||'').split(':').pop().replace(/[^a-z0-9]/gi,'').toLowerCase();
  const now=Date.now();
  const entries=(result.arrivals||[])
   .filter(x=>norm(x.route)===norm(currentRoute)||norm(x.route)===norm(routeLabel))
   .map(x=>{
    const live=freshArrivalPrediction(x,now);
    const aimed=Date.parse(x.aimed||'');
    const scheduled=Number.isFinite(aimed)&&aimed>=now-120000&&aimed<=now+14400000?aimed:null;
    return {x,live,scheduled,arrival:live?.expected??scheduled};
   })
   .filter(x=>Number.isFinite(x.arrival))
   .sort((a,b)=>a.arrival-b.arrival);
  $('arrivals').innerHTML='';
  if(!entries.length){
   $('arrivals').textContent='No upcoming scheduled or recent predicted arrivals matched this route. This does not mean the bus is on time.';
   arrivalDelay=null;$('scheduled').textContent=$('predicted').textContent=$('delay').textContent='—';
   $('arrivalUpdated').textContent='Checked 511 at '+new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})+'.';
   return;
  }
  entries.slice(0,5).forEach(({x,live,scheduled,arrival})=>{
   const div=document.createElement('div');div.className='stoprow';
   const title=document.createElement('strong');
   const minutes=Math.max(0,Math.ceil((arrival-now)/60000));
   title.textContent=(live?'Predicted ':'Scheduled ')+(minutes===0?'due now':minutes+' min')+' · '+(x.destination||'AC Transit');
   const small=document.createElement('small');
   small.textContent=live?'Scheduled '+fmt(x.aimed)+' · predicted '+fmt(x.expected)+' · vehicle reported '+fmt(x.recorded):'Scheduled '+fmt(x.aimed)+' · live prediction unavailable or stale';
   div.append(title,small);$('arrivals').append(div);
  });
  const first=entries.find(x=>x.live);
  $('scheduled').textContent=fmt(first?.x.aimed);
  $('predicted').textContent=fmt(first?.x.expected);
  arrivalDelay=first?first.live.delayMinutes:null;
  $('delay').textContent=arrivalDelay===null?'Unknown':arrivalDelay+' min';
  $('arrivalUpdated').textContent='511 checked at '+new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})+(first?' · vehicle last reported '+fmt(first.x.recorded):' · schedule only; no fresh vehicle report')+'.';
 }catch(e){
  $('arrivals').textContent='511 arrivals unavailable: '+e.message;
  arrivalDelay=null;$('scheduled').textContent=$('predicted').textContent=$('delay').textContent='—';
 }finally{$('refresh').disabled=false}
}
$('refresh').onclick=refreshArrivals;
$('startJourney').onclick=()=>{
 const stops=chosenStops();if(!stops)return;
 stopDelayMonitor();delayDemo=0;
 const exit=network.stops[selected.stops[Number($('exit').value)]],route=$('route').selectedOptions[0].textContent;
 if(!demo&&!exit?.code){$('journeyStatus').textContent='Destination stop has no live 511 stop code; delay cannot be tracked.';return}
 journey={demo,route,routeId:$('route').value,exitCode:exit?.code||'',vehicle:null,delay:null,sampled:null,recorded:null,aimed:null,expected:null,busy:false};
 $('finishJourney').disabled=false;updateDelayPreview();
 if(demo){$('journeyStatus').textContent='Simulation started. Demo points only.'}
 else{$('journeyStatus').textContent='Checking destination predictions for a unique bus…';sampleJourneyDelay();window.wldDelayTimer=setInterval(sampleJourneyDelay,70000)}
};
$('finishJourney').onclick=()=>{
 if(!journey)return;
 if(!journey.demo&&!isFreshJourneyPrediction(journey)){
  $('journeyStatus').textContent='Trip finished. No points awarded because 511 did not provide a verified matching delay prediction.';
  stopDelayMonitor();journey=null;updateDelayPreview();$('finishJourney').disabled=true;
  window.dispatchEvent(new CustomEvent('wld:trip-finished',{detail:{earned:0,verified:false}}));
  return;
 }
 const demo=Boolean(journey.demo),delay=demo?delayDemo:journey.delay,earned=Math.max(0,Math.round(delay))*10;
 if(journey.demo){
  demoPoints+=earned;
  $('journeyStatus').textContent='Simulation completed: +'+earned+' demo-only points ('+demoPoints+' this session). Your saved prototype balance was not changed.';
 }else{
  points+=earned;
  rewardHistory.unshift({earned,minutes:delay,route:journey.route+' (511 prediction)',time:new Date().toISOString(),basis:'destination_prediction'});
  rewardHistory=rewardHistory.slice(0,20);
  try{localStorage.setItem('wld-berkeley-points',String(points));localStorage.setItem(REWARD_HISTORY_KEY,JSON.stringify(rewardHistory))}catch(e){}
  $('points').textContent=points;renderRewardHistory();
  $('journeyStatus').textContent='Trip completed: +'+earned+' prototype points from a '+delay+'-minute 511 destination prediction. Actual arrival delay is not verified.';
 }
 stopDelayMonitor();journey=null;updateDelayPreview();$('finishJourney').disabled=true;
 window.dispatchEvent(new CustomEvent('wld:trip-finished',{detail:{earned,verified:!demo,demo}}));
};
$('liveRefresh').onclick=()=>{if(journey&&!journey.demo)sampleJourneyDelay()};
$('liveFinish').onclick=()=>{if(!journey)return;$('finishJourney').click();$('liveActionStatus').textContent=$('journeyStatus').textContent;updateLiveDashboard()};
$('liveGoTrips').onclick=()=>document.getElementById('appTrips').click();
updateLiveDashboard();
load();

/* Always-available alternatives to third-party business geocoding. */
(function(){
 const manual=$('manualRoutePicker'),details=$('manualRouteDetails');
 if(manual&&details)manual.addEventListener('click',()=>{
  if(typeof window.wldSelectTab==='function')window.wldSelectTab('routes');
  details.open=true;
  details.scrollIntoView({behavior:'smooth',block:'start'});
  if(network)$('routeFilter').focus({preventScroll:true});
 });
 const picker=$('destinationMapPicker');
 if(picker)picker.addEventListener('click',()=>{
  if(!network){$('autoResults').textContent='Bus stops are still loading. Please try again shortly.';return}
  if(typeof window.wldSelectTab==='function')window.wldSelectTab('map');
  if(!ensureMap()){$('autoResults').textContent='Map unavailable. Choose a destination bus stop by name or select a route manually.';return}
  $('autoResults').textContent='Tap your destination on the map. We will use nearby AC Transit stops.';
  routeMap.invalidateSize();
  routeMap.once('click',e=>{
   const lat=e.latlng.lat,lon=e.latlng.lng;
   if(!Number.isFinite(lat)||!Number.isFinite(lon))return;
   const nearest=Object.values(network.stops).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon))
    .map(p=>({p,d:distance(lat,lon,p.lat,p.lon)})).sort((a,b)=>a.d-b.d)[0];
   if(!nearest||nearest.d>1.2){
    $('autoResults').textContent='No AC Transit stop within 1.2 km of that point. Choose somewhere closer to a bus stop.';
    if(typeof window.wldSelectTab==='function')window.wldSelectTab('routes');
    return;
   }
   selectedStopIds.place=null;
   selectedPlaces.place={name:'Map-selected destination',lat,lon};
   $('place').value='📍 Map-selected destination near '+nearest.p.name;
   $('destinationSuggestions').innerHTML='';
   $('autoResults').textContent='Destination selected near '+nearest.p.name+'. Tap Find my bus route to compare options.';
   if(typeof window.wldSelectTab==='function')window.wldSelectTab('routes');
  });
 });
})();
