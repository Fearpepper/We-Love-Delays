/* Transit v4 plans are fetched through our server; credentials never enter the browser. */
(function(){
 'use strict';
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const time=seconds=>new Date(seconds*1000).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
 window.wldTransitPlanner=async(out,origin,destination,plan)=>{
  if(!window.wldTransitConfigured||!origin||!destination)return false;
  const searchState=(a,b,p)=>JSON.stringify([document.getElementById('originSearch').value,document.getElementById('place').value,a?.lat,a?.lon,b?.lat,b?.lon,p]);
  const snapshot=searchState(origin,destination,plan);
  out.textContent='Finding buses…';
  const q=new URLSearchParams({from_lat:origin.lat,from_lon:origin.lon,to_lat:destination.lat,to_lon:destination.lon,max_walk:plan.maxWalk,step_free:plan.stepFree,mode:plan.mode});
  if(plan.at)q.set('at',Math.floor(plan.at/1000));
  let data;try{const r=await fetch('/api/transit-plan?'+q);if(!r.ok)throw Error();data=await r.json();}catch{data={available:false,reason:'Transit could not be reached.'};}
  let latestPlan;try{latestPlan=readTripPlan();}catch{out.textContent='Travel preferences changed. Choose a valid travel time and search again.';return true;}
  if(snapshot!==searchState(walkingEndpoint('originSearch'),walkingEndpoint('place'),latestPlan)){out.textContent='Start or destination changed. Updating…';return true;}
  let moreWalking=false;
  if(data.available&&Array.isArray(data.results)&&!data.results.length&&data.empty_reason==='walking_limit'&&Array.isArray(data.walking_options)&&data.walking_options.length){moreWalking=true;data.results=data.walking_options.filter(item=>Number.isFinite(item.walk_minutes)&&item.walk_minutes<=30);}
  if(!data.available||!Array.isArray(data.results)||!data.results.length){
   const messages={walking_limit:'No bus within your walking limit.',accessibility:'No confirmed step-free trip.',unusable_plan:'We couldn’t confirm these directions.',no_departures:'No bus found at this time.'};
   window.wldTransitFallbackNote=data.available?(messages[data.empty_reason]||'No bus found with these settings.'):(data.reason||'Transit is unavailable.');
   out.textContent=window.wldTransitFallbackNote;return false;
  }
  out.replaceChildren();const heading=el('p',moreWalking?'More walking · above your '+plan.maxWalk+' min limit':'Bus journeys · planned by Transit');heading.className='notice';heading.dataset.routeHeading='true';out.append(heading);
  const note=el('p','Times checked '+time(data.fetched)+'. Live estimates are marked per bus; other times are scheduled. Start a trip to follow these directions.');note.className='hint';out.append(note);
  let choices=out;if(moreWalking){const details=el('details');details.className='long-walk-option';details.id='extraWalkingOptions';details.append(el('summary','Show bus options with more walking'));details.append(el('p','Your walking limit stays the same. Choose an option only if the extra walking works for you.'));out.append(details);choices=details;}
  for(const item of data.results){
   const buses=item.legs.filter(l=>l.mode==='bus');if(!buses.length)continue;
   const names=buses.map(l=>l.route).join(' → '),button=el('button');button.type='button';button.className='route-choice transit-route-choice';button.dataset.arrival=String(item.end_time*1000);
   button.setAttribute('aria-pressed','false');button.append(el('strong','Bus '+names+' · '+(buses.length===1?'Direct':(buses.length-1)+' transfer'+(buses.length>2?'s':''))));
   button.append(el('small',Math.ceil(item.duration/60)+' min · Walk '+item.walk_minutes+' min · '+time(item.start_time)+'–'+time(item.end_time)+' · '+(buses.every(b=>b.realtime)?'Live estimates':'Scheduled times')));
   const details=el('span');details.className='transit-route-summary';for(const leg of item.legs){const p=el('span',leg.mode==='walk'?'Walk '+Math.ceil(leg.duration/60)+' min ('+Math.round(leg.distance)+' m)':'Bus '+leg.route+' toward '+leg.headsign+' · '+leg.stops[0].name+' → '+leg.stops.at(-1).name);details.append(p);}button.append(details);
   if(moreWalking)button.append(el('small','Walk '+item.walk_minutes+' min · above your '+plan.maxWalk+' min limit'));
   button.onclick=()=>{
    for(const b of out.querySelectorAll('.route-choice'))b.setAttribute('aria-pressed','false');button.setAttribute('aria-pressed','true');
    if(journey)window.wldCancelTrip?.();window.wldUseTransitPlan(item);
   };choices.append(button);
  }
  const fallback=el('button','Compare 511 alternatives');fallback.type='button';fallback.className='btn alt';fallback.onclick=()=>findDirectTrips({skipTransit:true,target:out});out.append(fallback);
  const attribution=el('p');attribution.className='hint';attribution.append('Trip planning by ');const link=el('a','Transit');link.href='https://transitapp.com';link.target='_blank';link.rel='noopener noreferrer';attribution.append(link,'. No affiliation or reward partnership implied.');out.append(attribution);
  return true;
 };
})();
