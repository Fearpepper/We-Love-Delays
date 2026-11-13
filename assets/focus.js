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
