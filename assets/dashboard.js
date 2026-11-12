/* Dashboard conveniences only: route search remains owned by app.js. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const SAVED='wld-saved-destinations-v1',RECENT='wld-recent-searches-v1';
 const read=key=>{try{const data=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(data)?data.filter(x=>x&&typeof x.label==='string'&&typeof x.origin==='string'&&typeof x.destination==='string').slice(0,6):[]}catch{return []}};
 const write=(key,items)=>{try{localStorage.setItem(key,JSON.stringify(items));return true}catch{return false}};
 let saved=read(SAVED),recent=read(RECENT);
 function activate(view){if(typeof window.wldSelectTab==='function')window.wldSelectTab(view)}
 function openPlanner(item){
  activate('routes');
  if(item){
   $('originSearch').value=item.origin;
   $('place').value=item.destination;
   $('savedStatus').textContent='Restored search fields. Select the matching stop suggestions before finding a route.';
  }
  $('originSearch').focus({preventScroll:true});
  $('originSearch').scrollIntoView({behavior:'smooth',block:'center'});
 }
 $('quickPlan').addEventListener('click',()=>openPlanner());
 $('quickMap').addEventListener('click',()=>activate('map'));
 $('quickRewards').addEventListener('click',()=>activate('rewards'));
 function render(key,items,container){
  const el=$(container);el.replaceChildren();
  if(!items.length){const p=document.createElement('p');p.className='hint';p.textContent=key===SAVED?'No saved destinations yet.':'Your recent searches will appear here.';el.append(p);return}
  for(const item of items){
   const row=document.createElement('div');row.className='saved-row';
   const open=document.createElement('button');open.type='button';open.className='saved-open';
   const label=document.createElement('strong');label.textContent=item.label;
   const detail=document.createElement('small');detail.textContent=item.origin?'From '+item.origin:'Choose a starting stop';
   open.append(label,detail);open.addEventListener('click',()=>openPlanner(item));row.append(open);
   if(key===SAVED){const remove=document.createElement('button');remove.type='button';remove.className='saved-remove';remove.textContent='Remove';remove.setAttribute('aria-label','Remove '+item.label);remove.addEventListener('click',()=>{saved=saved.filter(x=>x.label!==item.label);write(SAVED,saved);render(SAVED,saved,'savedDestinations')});row.append(remove)}
   el.append(row);
  }
 }
 function refresh(){render(SAVED,saved,'savedDestinations');render(RECENT,recent,'recentTrips')}
 $('saveDestination').addEventListener('click',()=>{
  const destination=$('place').value.trim().slice(0,140),origin=$('originSearch').value.trim().slice(0,140);
  if(!destination){$('savedStatus').textContent='Enter a destination in the trip planner first.';openPlanner();return}
  saved=[{label:destination,origin,destination},...saved.filter(x=>x.label!==destination)].slice(0,6);
  $('savedStatus').textContent=write(SAVED,saved)?'Destination saved on this device.':'Browser storage unavailable; destination saved only until refresh.';
  refresh();
 });
 $('clearRecent').addEventListener('click',()=>{recent=[];write(RECENT,recent);refresh()});
 $('autoFind').addEventListener('click',()=>{
  const destination=$('place').value.trim().slice(0,140),origin=$('originSearch').value.trim().slice(0,140);
  if(!destination||!origin)return;
  recent=[{label:destination,origin,destination},...recent.filter(x=>x.origin!==origin||x.destination!==destination)].slice(0,6);
  write(RECENT,recent);refresh();
 });
 refresh();
})();
