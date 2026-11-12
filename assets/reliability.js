/* Trip recovery stores published bus stops only, never device GPS coordinates. */
(function(){
 'use strict';
 const key='wld-active-trip-v1',maxAge=12*60*60*1000;
 let restoring=false,startedAt=null,lastPoll=0,recoveredNetwork=null;
 const recovery=document.createElement('p');recovery.id='tripRecoveryStatus';recovery.className='hint';recovery.setAttribute('role','status');
 const cancel=document.createElement('button');cancel.type='button';cancel.className='btn alt';cancel.textContent='Cancel trip';cancel.id='cancelTrip';cancel.hidden=true;
 cancel.addEventListener('click',()=>window.wldCancelTrip?.());
 document.getElementById('guideTripControls')?.append(cancel,recovery);
 const status=document.createElement('p');
 status.id='connectionStatus';status.setAttribute('role','status');status.className='hint';
 status.style.cssText='max-width:1100px;margin:10px auto;padding:0 14px';
 document.querySelector('.app-controls')?.after(status);
 const alternatives=document.createElement('div');alternatives.className='actions';
 const planner=document.createElement('a');planner.className='btn alt';planner.textContent='Check trip in Google Maps';planner.target='_blank';planner.rel='noopener noreferrer';
 const alerts=document.createElement('a');alerts.className='btn alt';alerts.textContent='Official service alerts';alerts.href='https://www.actransit.org/alert';alerts.target='_blank';alerts.rel='noopener noreferrer';
 alternatives.append(planner,alerts);document.getElementById('guideTripControls')?.after(alternatives);
 function clear(){try{localStorage.removeItem(key)}catch{}startedAt=null;recovery.textContent='';cancel.hidden=true;}
 function save(){
  if(restoring||!journey||journey.demo||!activeNavigation?.legs?.length)return;
  startedAt=startedAt||Date.now();
  const legs=activeNavigation.legs,stops={};
  for(const leg of legs)for(const id of leg.p.stops){
   const s=network.stops[id];if(s)stops[id]={id:s.id,name:s.name,code:s.code,lat:s.lat,lon:s.lon};
  }
  const routes=network.routes.filter(r=>legs.some(l=>l.p.route===r.id)).map(r=>({id:r.id,name:r.name}));
  const data={version:1,startedAt,legs,stops,routes,progress:activeNavigation.progress,vehicle:journey.vehicle};
  try{localStorage.setItem(key,JSON.stringify(data));recovery.textContent='Active bus trip saved on this device. Reopening restores bus directions, not GPS following or old predictions.';cancel.hidden=false;}
  catch{cancel.hidden=false;recovery.textContent='Browser storage is unavailable. Keep this page open; the trip cannot recover after a refresh.';}
 }
 function updateAlternatives(){
  const legs=activeNavigation?.legs;if(!legs?.length)return;
  const first=network.stops[legs[0].p.stops[legs[0].start]],lastLeg=legs[legs.length-1],last=network.stops[lastLeg.p.stops[lastLeg.end]];
  if(!first||!last)return;
  const params=new URLSearchParams({api:'1',origin:first.lat+','+first.lon,destination:last.lat+','+last.lon,travelmode:'transit'});
  planner.href='https://www.google.com/maps/dir/?'+params.toString();
 }
 function restore(){
  if(journey||restoring)return;
  let saved;
  try{
   const raw=localStorage.getItem(key);if(!raw)return;
   if(raw.length>500000)throw Error('Oversize saved trip');
   saved=JSON.parse(raw);
   if(saved.version!==1||!Number.isFinite(saved.startedAt)||Date.now()-saved.startedAt>maxAge||saved.startedAt>Date.now()+60000||!Array.isArray(saved.legs)||!saved.legs.length||saved.legs.length>2||!Array.isArray(saved.routes)||!saved.stops)throw Error('Invalid saved trip');
   for(const leg of saved.legs){
    if(!leg.p||typeof leg.p.route!=='string'||!Array.isArray(leg.p.stops)||leg.p.stops.length>1000||!Number.isInteger(leg.start)||!Number.isInteger(leg.end)||leg.start<0||leg.end<=leg.start||leg.end>=leg.p.stops.length)throw Error('Invalid saved route');
    for(const id of leg.p.stops){const s=saved.stops[id];if(!s||typeof s.name!=='string'||s.name.length>300||!Number.isFinite(s.lat)||!Number.isFinite(s.lon)||Math.abs(s.lat)>90||Math.abs(s.lon)>180)throw Error('Invalid saved stop');}
   }
   if(!Number.isInteger(saved.progress)||saved.progress<0)throw Error('Invalid saved progress');
  }catch{clear();return;}
  const offline=!network;
  restoring=true;
  try{
   if(!network){network={stops:saved.stops,routes:saved.routes,patterns:saved.legs.map(l=>l.p)};recoveredNetwork=network;document.getElementById('feedStatus').textContent='Saved trip only · live routes unavailable';}
   else{
    for(const [id,s] of Object.entries(saved.stops))if(!network.stops[id])network.stops[id]=s;
    for(const r of saved.routes)if(!network.routes.some(x=>x.id===r.id))network.routes.push(r);
   }
   demo=false;startedAt=saved.startedAt;
   const first=saved.legs[0],last=saved.legs[saved.legs.length-1];
   selectedPlaces.originSearch=selectedPlaces.place=null;
   selectedStopIds.originSearch=first.p.stops[first.start];selectedStopIds.place=last.p.stops[last.end];
   document.getElementById('originSearch').value=network.stops[selectedStopIds.originSearch].name;
   document.getElementById('place').value=network.stops[selectedStopIds.place].name;
   populateRoutes();document.getElementById('route').value=first.p.route;
   selected=first.p;populateBoarding();document.getElementById('board').value=String(first.start);boardChanged();
   document.getElementById('exit').value=String(first.end);document.getElementById('exit').onchange();
   if(saved.legs.length===2)showTransferMap(first,last);else drawRoute();
   setNavigation(saved.legs);
   activeNavigation.progress=Math.min(saved.progress,activeNavigation.steps.length-1);renderNavigation();
   document.getElementById('startJourney').click();
   if(journey){journey.vehicle=typeof saved.vehicle==='string'?saved.vehicle:null;}
   setAppView('guide');updateAlternatives();
   document.getElementById('guideTripFeedback').textContent='Active bus trip restored. Recheck walking directions and current service. GPS following is off; old delay predictions were discarded.';
   if(offline){status.hidden=false;status.textContent='Saved bus directions restored. Live transit data is unavailable; use official sources before boarding.';}
  }catch{clear();}
  finally{restoring=false;}
  save();
 }
 function connection(){
  status.hidden=navigator.onLine;
  status.textContent=navigator.onLine?'':'Offline: saved directions remain available. Live arrivals and walking routes cannot update.';
  if(!navigator.onLine&&journey){journey.delay=null;journey.sampled=null;journey.recorded=null;updateDelayPreview();}
 }
 function tick(){
  if(document.hidden)return;
  if(journey)updateDelayPreview();
  const rows=[...document.querySelectorAll('#arrivals .stoprow[data-visit]')];
  let first=null,visible=0;
  for(const row of rows){
   let x;try{x=JSON.parse(row.dataset.visit)}catch{continue;}
   const live=navigator.onLine?freshArrivalPrediction(x):null,aimed=Date.parse(x.aimed||'');
   const arrival=live?.expected??(Number.isFinite(aimed)?aimed:null);
   row.hidden=arrival===null||arrival<Date.now()-120000;
   if(row.hidden)continue;
   visible++;
   const min=Math.max(0,Math.ceil((arrival-Date.now())/60000));
   row.querySelector('strong').textContent=(live?'Predicted ':'Scheduled ')+(min===0?'due now':min+' min')+' · '+(x.destination||'AC Transit');
   row.querySelector('small').textContent=live?'Scheduled '+fmt(x.aimed)+' · predicted '+fmt(x.expected)+' · vehicle reported '+fmt(x.recorded):'Scheduled '+fmt(x.aimed)+' · live prediction unavailable or stale';
   if(live&&!first)first={x,live};
  }
  if(rows.length){
   if(!visible)document.getElementById('arrivals').textContent='Displayed arrivals have passed. Refresh for current service.';
   document.getElementById('scheduled').textContent=fmt(first?.x.aimed);
   document.getElementById('predicted').textContent=fmt(first?.x.expected);
   document.getElementById('delay').textContent=first?first.live.delayMinutes+' min':'Unknown';
  }
  if(navigator.onLine&&Date.now()-lastPoll>=70000){
   lastPoll=Date.now();
   if(selected&&document.getElementById('board').value!==''&&!document.getElementById('refresh').disabled)refreshArrivals();
   if(journey)sampleJourneyDelay();
  }
 }
 window.addEventListener('wld:trip-started',()=>{cancel.hidden=false;save();});
 window.addEventListener('wld:progress',save);
 window.addEventListener('wld:trip-finished',clear);
 window.addEventListener('wld:route-selected',()=>{if(!restoring)clear();updateAlternatives();});
 window.addEventListener('wld:network-ready',()=>{
  if(journey&&recoveredNetwork){
   if(network!==recoveredNetwork){recoveredNetwork=null;connection();}
   else{document.getElementById('feedStatus').textContent='Saved trip only · live routes unavailable';status.hidden=false;status.textContent='Saved bus directions restored. Live transit data is unavailable; use official sources before boarding.';}
  }else restore();
 });
 window.addEventListener('pagehide',save);
 window.addEventListener('offline',connection);
 window.addEventListener('online',()=>{connection();lastPoll=0;if(!network||network===recoveredNetwork)load();tick();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){lastPoll=0;connection();tick();}});
 setInterval(tick,15000);
 connection();restore();
})();
