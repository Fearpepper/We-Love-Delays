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
