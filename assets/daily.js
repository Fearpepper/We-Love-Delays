/* Daily tools: bounded, on-demand departure requests and explicit recovery. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const minute=60000;
 function node(tag,text,cls){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;}
 function button(text,action){const b=node('button',text,'btn alt');b.type='button';b.onclick=action;return b;}
 function age(stamp){const mins=Math.max(0,Math.floor((Date.now()-stamp)/minute));return mins<1?'just now':mins+' min ago';}
 function clock(stamp){return new Date(stamp).toLocaleString([],{weekday:'short',hour:'numeric',minute:'2-digit'});}
 function evidence(visit,now=Date.now()){
  const live=navigator.onLine?freshArrivalPrediction(visit,now):null;
  if(live&&live.expected>=now)return {kind:'Live prediction',at:live.expected,detail:'Vehicle reported '+age(live.recorded)};
  const aimed=Date.parse(visit?.aimed);
  if(navigator.onLine&&Number.isFinite(aimed)&&aimed>=now&&aimed<=now+4*3600000)return {kind:'Published schedule',at:aimed,detail:'No fresh vehicle prediction'};
  return {kind:'Unavailable',at:null,detail:navigator.onLine?'No current arrival evidence':'Offline · check again when connected'};
 }
 window.wldArrivalEvidence=evidence;
 window.addEventListener('DOMContentLoaded',()=>{
  const near=node('details',undefined,'daily-tools focus-fold');near.id='nearbyDepartures';near.append(node('summary','Buses near your starting point'));
  near.append(node('p','Choose a starting point or use your location, then check up to three served stops within 1 km. Distances are straight-line; check walking access.','hint'));
  const actions=node('div',undefined,'actions'),nearStatus=node('p','Departures load when you ask.','hint'),list=node('div');nearStatus.id='nearbyStatus';nearStatus.setAttribute('role','status');list.id='nearbyResults';
  const refresh=button('Check nearby departures',()=>loadNearby());refresh.id='nearbyRefresh';actions.append(refresh);near.append(actions,nearStatus,list);$('originSearch').closest('.field').after(near);
  let indexed=null,served=[],cache=new Map(),inflight=new Map(),version=0,rows=[];
  function indexStops(){if(indexed===network)return;indexed=network;const ids=new Set();for(const p of network?.patterns||[])for(const id of p.stops||[])ids.add(id);served=[...ids].map(id=>network.stops[id]).filter(s=>s?.code&&Number.isFinite(s.lat)&&Number.isFinite(s.lon));cache.clear();}
  async function departures(code){
   const saved=cache.get(code);if(saved&&Date.now()-saved.at<45000)return saved;
   if(inflight.has(code))return inflight.get(code);
   const task=api('/api/arrivals?code='+encodeURIComponent(code)).then(data=>{const result={at:Date.now(),visits:(data.arrivals||[]).slice(0,100)};cache.set(code,result);while(cache.size>8)cache.delete(cache.keys().next().value);return result;}).finally(()=>inflight.delete(code));inflight.set(code,task);return task;
  }
  function renderNearby(){
   if(!near.open||document.hidden||(innerWidth>790?document.body.dataset.desktopView:document.body.dataset.view)!=='routes')return;
   list.replaceChildren();
   for(const row of rows){
    const card=node('section',undefined,'nearby-stop');card.append(node('h3',row.stop.name),node('p','Stop '+row.stop.code+' · '+Math.round(row.meters)+' m straight-line','hint'));
    if(row.error)card.append(node('p','Arrivals unavailable. Retry or check the agency.','hint'));
    else{
     const visits=(row.data?.visits||[]).map(v=>({v,e:evidence(v)})).filter(x=>x.e.at!==null).sort((a,b)=>a.e.at-b.e.at).slice(0,5);
     if(!visits.length)card.append(node('p',navigator.onLine?'No current arrivals returned. This does not mean service has stopped.':'Offline · arrival times unavailable.','hint'));
     for(const {v,e} of visits){const line=node('div',undefined,'nearby-visit');line.append(node('strong','Bus '+v.route+' → '+(v.destination||'Direction not reported')),node('span',e.kind+' · '+Math.max(0,Math.ceil((e.at-Date.now())/minute))+' min · '+clock(e.at)),node('small',e.detail+' · checked '+age(row.data.at)));card.append(line);}
    }
    const choose=button('Start from this stop',()=>window.wldPlanFromMapStop(row.stop.id,'originSearch'));card.append(choose);list.append(card);
   }
  }
  async function loadNearby(){
   if(refresh.disabled)return;near.open=true;const request=++version;rows=[];list.replaceChildren();
   if(!navigator.onLine){nearStatus.textContent='Offline. Connect to check fresh departures.';return;}
   if(!network){nearStatus.textContent='Transit stops have not loaded. Retry loading transit data first.';return;}
   const origin=walkingEndpoint('originSearch');
   if(!origin||![origin.lat,origin.lon].every(Number.isFinite)){nearStatus.textContent='Choose your starting point or tap Use my location first.';return;}
   indexStops();const stops=served.map(stop=>({stop,meters:distance(origin.lat,origin.lon,stop.lat,stop.lon)*1000})).filter(s=>s.meters<=1000).sort((a,b)=>a.meters-b.meters).slice(0,3);
   if(!stops.length){nearStatus.textContent='No served stops within 1 km of your starting point. Choose another point or explore Map.';return;}
   refresh.disabled=true;nearStatus.textContent='Checking nearby stops…';let cursor=0;
   async function worker(){while(cursor<stops.length){const row=stops[cursor++];try{row.data=await departures(row.stop.code);}catch{row.error=true;}if(request!==version)return;}}
   try{await Promise.all([worker(),worker()]);if(request!==version)return;rows=stops;nearStatus.textContent='Departures near '+(origin.name||'your selected starting point')+'. Checked '+new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})+'. Tap Check again for updates.';renderNearby();}finally{refresh.disabled=false;}
  }
  near.addEventListener('toggle',renderNearby);
  for(const id of ['originSearch'])$(id).addEventListener('input',()=>{version++;rows=[];list.replaceChildren();nearStatus.textContent='Starting point changed. Check nearby departures again.';});
  const confidence=node('p',undefined,'notice arrival-confidence');confidence.id='arrivalConfidence';confidence.setAttribute('role','status');$('guideTripControls').before(confidence);
  function confidenceText(kind,text){if(confidence.dataset.confidence!==kind)confidence.dataset.confidence=kind;if(confidence.textContent!==text)confidence.textContent=text;}
  function renderConfidence(){
   const nav=activeNavigation;if(!nav){confidence.hidden=true;return;}confidence.hidden=false;
   if(journey&&!journey.demo&&isFreshJourneyPrediction(journey)&&navigator.onLine){const e=evidence({aimed:journey.aimed,expected:journey.expected,recorded:new Date(journey.recorded).toISOString()});if(e.kind==='Live prediction'){confidenceText('live','Final bus stop · Live prediction · '+clock(e.at)+' · '+e.detail+'. Walking after the bus is additional.');return;}}
   const connection=nav.connection,arrival=connection?.arrival;
   if(navigator.onLine&&Number.isFinite(arrival)&&arrival>=Date.now()){confidenceText('scheduled','Destination · Published schedule · '+clock(arrival)+' · includes estimated final walking. No fresh live destination prediction; service may change.');}
   else{confidenceText('unavailable','Arrival unavailable · '+(navigator.onLine?'No current prediction or feasible published schedule. Check departures before boarding.':'Offline. Saved directions remain available; reconnect for arrivals.'));}
  }
  new MutationObserver(renderConfidence).observe($('navStatus'),{childList:true,subtree:true,characterData:true});
  new MutationObserver(renderConfidence).observe($('liveLastUpdate'),{childList:true,subtree:true,characterData:true});
  for(const name of ['wld:route-selected','wld:progress','wld:trip-started','wld:trip-finished','online','offline'])window.addEventListener(name,()=>{renderConfidence();renderNearby();});
  setInterval(()=>{if(document.hidden)return;renderConfidence();if(near.open&&rows.length)renderNearby();},15000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){renderConfidence();renderNearby();}});
  new MutationObserver(()=>{renderConfidence();renderNearby();}).observe(document.body,{attributes:true,attributeFilter:['data-view','data-desktop-view']});
  renderConfidence();

  const missed=button('Missed it?',recover);missed.id='missedBus';const recoveryStatus=node('p',undefined,'hint');recoveryStatus.id='missedBusStatus';recoveryStatus.setAttribute('role','status');$('guideTripControls').append(missed,recoveryStatus);
  const recovery=node('section',undefined,'notice');recovery.id='missedBusRecovery';recovery.hidden=true;recovery.append(node('h3','Next departures'));const recoveryResults=node('div');recoveryResults.id='missedBusResults';recovery.append(recoveryResults);$('navigationPanel').after(recovery);
  function syncRecovery(){const step=activeNavigation?.steps[activeNavigation.progress];missed.hidden=!step||!['walk-start','board','walk-transfer'].includes(step.kind);}
  for(const name of ['wld:route-selected','wld:progress','wld:trip-started','wld:trip-finished'])window.addEventListener(name,()=>{syncRecovery();if(name==='wld:route-selected'||name==='wld:trip-finished'){recovery.hidden=true;recoveryResults.replaceChildren();recoveryStatus.textContent='';}});syncRecovery();
  async function recover(){
   const nav=activeNavigation,step=nav?.steps[nav.progress];if(!nav||missed.disabled)return;
   if(!navigator.onLine){recoveryStatus.textContent='Offline. Reconnect to check the next bus. Your current trip is kept.';return;}
   if(findingTrip){recoveryStatus.textContent='A search is already running. Try again when it finishes.';return;}
   if(!step||!['walk-start','board','walk-transfer'].includes(step.kind)){window.wldPrepareRecovery?.('Choose your current starting point to recover.');return;}
   const legIndex=step.kind==='walk-transfer'?step.legIndex+1:step.legIndex??0,leg=nav.legs[legIndex];if(!leg)return;
   const board=network.stops[leg.p.stops[leg.start]],last=nav.legs[nav.legs.length-1],exit=network.stops[last.p.stops[last.end]];
   const captured=nav.search||window.wldCaptureSearch();
   const first=step.kind==='walk-start';
   const previous=nav.legs[legIndex-1];
   const origin=first?captured.places?.originSearch||network.stops[captured.stopIds?.originSearch]:step.kind==='walk-transfer'&&previous?network.stops[previous.p.stops[previous.end]]:board;
   if(!origin||!board||!exit){recoveryStatus.textContent='Choose a current starting point in Plan before searching. Your selected route is kept.';return;}
   const destination=captured.destination||exit.name;
   window.wldRestoreSearch({origin:origin.name||captured.origin||board.name,destination,stopIds:{originSearch:first?captured.stopIds?.originSearch:origin.id,place:captured.stopIds?.place||exit.id},places:{originSearch:first?captured.places?.originSearch:null,place:captured.places?.place||null}});
   const plan={...nav.plan,mode:'now',at:null};$('tripWhen').value='now';$('tripWhen').dispatchEvent(new Event('change'));
   recovery.hidden=false;missed.disabled=true;recoveryStatus.textContent='Finding another departure…';
   try{await findDirectTrips({target:recoveryResults,plan,nearby:true});if(activeNavigation!==nav)return;recoveryStatus.textContent='Results checked from '+(origin.name||board.name)+' to '+destination+'. Select an option to replace your trip. Predictions can change; confirm you can reach the stop.';}
   catch{recoveryStatus.textContent='Recovery search unavailable. Your current trip is kept; try the official planner.';}
   finally{missed.disabled=false;}
  }

  const feedback=node('details',undefined,'trip-inspector daily-feedback');feedback.id='tripFeedback';feedback.append(node('summary','Something wrong? Report a problem'));
  const categoryLabel=node('label','Problem type'),category=node('select');category.id='feedbackCategory';for(const [value,label] of [['route','Route or stop'],['arrival','Arrival time'],['search','Place search'],['walking','Walking directions'],['gps','Map or GPS'],['other','Other']]){const option=node('option',label);option.value=value;category.append(option);}categoryLabel.append(category);
  const textLabel=node('label','What happened?'),message=node('textarea');message.id='feedbackMessage';message.maxLength=1000;message.rows=3;textLabel.append(message);
  feedback.append(categoryLabel,textLabel,node('p','Saved on this device only. No GPS coordinates are attached. Review the report before opening a public GitHub issue; avoid personal information.','hint'));
  const feedbackStatus=node('p',undefined,'hint');feedbackStatus.id='feedbackStatus';feedbackStatus.setAttribute('role','status');const preview=node('pre');preview.id='feedbackPreview';preview.hidden=true;
  const issue=node('a','Review as GitHub issue ↗','btn alt');issue.id='feedbackIssue';issue.target='_blank';issue.rel='noopener noreferrer';issue.hidden=true;
  let report=null;const reportKey='wld-feedback-v1';
  function body(r){return 'Problem: '+r.category+'\nRecorded: '+r.created+'\nRoute IDs: '+r.routes.join(', ')+'\nStop codes: '+r.stops.join(', ')+'\n\n'+r.message+'\n\nNo GPS coordinates are attached. This is a rider report, not a verified transit event.';}
  function show(r){report=r;preview.hidden=false;preview.textContent=body(r);issue.hidden=false;issue.href='https://github.com/Fearpepper/We-Love-Delays/issues/new?'+new URLSearchParams({title:'Transit feedback: '+r.category,body:body(r)});copy.disabled=download.disabled=false;}
  const save=button('Save report on this device',()=>{
   if(!message.value.trim()){feedbackStatus.textContent='Describe what happened before saving.';return;}
   const legs=activeNavigation?.legs||[];const r={version:1,category:category.value,created:new Date().toISOString(),routes:[...new Set(legs.map(l=>l.p.route))],stops:[...new Set(legs.flatMap(l=>[network?.stops[l.p.stops[l.start]]?.code,network?.stops[l.p.stops[l.end]]?.code]).filter(Boolean))],message:message.value.trim().slice(0,1000)};show(r);
   try{let saved=[];try{saved=JSON.parse(localStorage.getItem(reportKey)||'[]');}catch{}localStorage.setItem(reportKey,JSON.stringify([r,...(Array.isArray(saved)?saved:[])].slice(0,10)));feedbackStatus.textContent='Saved on this device. Not sent. Copy, download, or review it as a GitHub issue.';}catch{feedbackStatus.textContent='Storage unavailable. The report is ready to copy or download, but will not survive a refresh.';}
  });save.id='saveFeedback';
  const copy=button('Copy report',async()=>{try{await navigator.clipboard.writeText(body(report));feedbackStatus.textContent='Report copied. Not sent.';}catch{feedbackStatus.textContent='Clipboard unavailable. Select the report text or download it.';}});copy.disabled=true;
  const download=button('Download report',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const link=node('a');link.href=url;link.download='we-love-delays-feedback.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});download.disabled=true;
  const feedbackActions=node('div',undefined,'actions');feedbackActions.append(save,copy,download,issue);feedback.append(feedbackActions,feedbackStatus,preview);$('guideContent').append(feedback);
  const planFeedback=button('Report a planning problem',()=>{window.wldSelectTab?.('guide');feedback.open=true;feedback.scrollIntoView({block:'center',behavior:'smooth'});});$('autoResults').after(planFeedback);
  // Feedback remains reachable before a route has been selected.
  $('guideScreen').append(feedback);
  try{const saved=JSON.parse(localStorage.getItem(reportKey)||'[]'),r=saved?.[0];if(r&&r.version===1&&typeof r.message==='string'&&r.message.length<=1000&&typeof r.created==='string'&&typeof r.category==='string'&&Array.isArray(r.routes)&&Array.isArray(r.stops)){show(r);feedbackStatus.textContent='Last report restored from this device. Not sent.';}}catch{}

  const phone=node('details',undefined,'trip-inspector phone-check');phone.id='phoneRideCheck';phone.append(node('summary','Before your first ride · phone check'));
  phone.append(node('p','Use this on your phone during a real ride. These checks are manual; browser tests cannot verify your phone reception or background behavior.','hint'));
  for(const text of ['Start a selected trip and confirm the blue dot matches where you are.','Confirm boarding manually and compare the bus direction with the stop sign.','Lock and reopen the phone: wait for a fresh GPS update before trusting the dot.','Approach your exit stop with the app open; confirm the reminder and the real stop yourself.','Finish the trip and check that completion and the points explanation make sense.']){const label=node('label');const check=node('input');check.type='checkbox';label.append(check,document.createTextNode(text));phone.append(label);}
  phone.append(node('p','If GPS is stale or permission is blocked, use written steps. Reminders are not guaranteed with the screen locked. Report problems using Something wrong above.','hint'));$('guideScreen').append(phone);
 });
})();
