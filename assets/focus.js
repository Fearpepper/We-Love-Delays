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
 const advanced=document.createElement('details');advanced.className='advanced-planner';
 const summary=document.createElement('summary');summary.textContent='Manual route tools';advanced.append(summary);
 const manual=$('manualRouteDetails'),preview=$('preview').closest('.actions');
 if(manual){manual.before(advanced);advanced.append(manual);}
 if(preview)advanced.append(preview);
 const legacyLocation=document.querySelector('.focus-location-tools')?.closest('.field');if(legacyLocation)advanced.append(legacyLocation);
 const arrivalCard=$('arrivals').closest('.card');
 if(arrivalCard&&arrivalCard!==card){const arrivalDetails=document.createElement('details');arrivalDetails.className='arrival-drawer';const title=document.createElement('summary');title.textContent='Boarding-stop arrivals & all service notices';arrivalDetails.append(title);arrivalCard.before(arrivalDetails);arrivalDetails.append(arrivalCard);}
 window.wldSyncGuideMap?.();
 if(ensureMap()){setTimeout(()=>{routeMap.invalidateSize();routeMap.zoomControl.setPosition('bottomright');},180);}
});
