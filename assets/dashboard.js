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
   window.wldRestoreSearch?.(item);
   $('savedStatus').textContent='Saved trip restored. Review the locations, then Find routes.';
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
   if(key===SAVED){const remove=document.createElement('button');remove.type='button';remove.className='saved-remove';remove.textContent='Remove';remove.setAttribute('aria-label','Remove '+item.label);remove.addEventListener('click',()=>{saved=saved.filter(x=>x.label!==item.label);write(SAVED,saved);refresh()});row.append(remove)}
   el.append(row);
  }
 }
 function refresh(){render(SAVED,saved,'savedDestinations');render(RECENT,recent,'recentTrips');renderShortcuts();}
 $('saveDestination').addEventListener('click',()=>{
  const destination=$('place').value.trim().slice(0,140),origin=$('originSearch').value.trim().slice(0,140);
  if(!destination){$('savedStatus').textContent='Enter a destination in the trip planner first.';openPlanner();return}
  saved=[{...window.wldCaptureSearch?.(),label:destination,origin,destination},...saved.filter(x=>x.label!==destination)].slice(0,6);
  $('savedStatus').textContent=write(SAVED,saved)?'Destination saved on this device.':'Browser storage unavailable; destination saved only until refresh.';
  refresh();
 });
 $('clearRecent').addEventListener('click',()=>{recent=[];write(RECENT,recent);refresh()});
 $('autoFind').addEventListener('click',()=>{
  const destination=$('place').value.trim().slice(0,140),origin=$('originSearch').value.trim().slice(0,140);
  if(!destination||!origin)return;
  recent=[{...window.wldCaptureSearch?.(),label:destination,origin,destination},...recent.filter(x=>x.origin!==origin||x.destination!==destination)].slice(0,6);
  write(RECENT,recent);refresh();
 });

 let shortcutHost=null;
 function renderShortcuts(){
  if(!shortcutHost)return;
  const row=shortcutHost.querySelector('.everyday-buttons');row.replaceChildren();
  for(const label of ['Home','School']){
   const button=document.createElement('button');button.type='button';button.className='everyday-place';const item=saved.find(x=>x.label===label);
   button.textContent=(item?'':'＋ ')+label;button.setAttribute('aria-label',(item?'Open ':'Save current trip as ')+label);
   button.onclick=()=>item?openPlanner(item):saveNamed(label);row.append(button);
  }
  const more=document.createElement('button');more.type='button';more.className='everyday-place';more.textContent='Save trip';more.onclick=()=>{shortcutHost.querySelector('form').hidden=false;shortcutHost.querySelector('input').focus();};row.append(more);
  const list=shortcutHost.querySelector('.everyday-recent');list.replaceChildren();
  for(const item of recent.slice(0,3)){const b=document.createElement('button');b.type='button';b.className='saved-open';b.textContent=item.origin+' → '+item.destination;b.onclick=()=>openPlanner(item);list.append(b);}
  for(const item of saved){const wrap=document.createElement('div');wrap.className='saved-row';const b=document.createElement('button');b.type='button';b.className='saved-open';b.textContent=item.label+' · '+item.destination;b.onclick=()=>openPlanner(item);const remove=document.createElement('button');remove.type='button';remove.className='saved-remove';remove.textContent='Remove';remove.setAttribute('aria-label','Remove saved trip '+item.label);remove.onclick=()=>{saved=saved.filter(x=>x!==item);write(SAVED,saved);refresh()};wrap.append(b,remove);list.append(wrap);}
 }
 function saveNamed(label){
  const item=window.wldCaptureSearch?.();const status=shortcutHost.querySelector('[role=status]');
  if(!item?.destination){status.textContent='Choose a destination in the planner before saving '+label+'.';$('place').focus();return;}
  saved=[{...item,label},...saved.filter(x=>x.label!==label)].slice(0,6);
  status.textContent=write(SAVED,saved)?label+' saved on this device.':label+' saved for this session only; browser storage is unavailable.';refresh();
 }
 window.addEventListener('DOMContentLoaded',()=>{
  shortcutHost=document.createElement('section');shortcutHost.className='everyday-trips';shortcutHost.setAttribute('aria-label','Everyday trips');
  shortcutHost.innerHTML='<div class="everyday-buttons"></div><form hidden><label>Name this trip<input maxlength="40" required placeholder="e.g. Work" aria-label="Saved trip name"></label><button class="btn alt" type="submit">Save</button><button class="btn alt" type="button" data-cancel-save>Cancel</button></form><p role="status" class="hint"></p><details><summary>Saved & recent trips</summary><div class="everyday-recent"></div></details>';
  setTimeout(()=>{$('autoFind').closest('.card').querySelector('.planner-intro')?.after(shortcutHost);},0);
  shortcutHost.querySelector('form').onsubmit=e=>{e.preventDefault();const input=shortcutHost.querySelector('input');saveNamed(input.value.trim()||'My trip');shortcutHost.querySelector('form').hidden=true;};
  shortcutHost.querySelector('[data-cancel-save]').onclick=()=>{shortcutHost.querySelector('form').hidden=true;};refresh();
 });
 window.addEventListener('wld:planning-idle',()=>{
  const item=window.wldCaptureSearch?.();if(!item?.origin||!item?.destination)return;
  recent=[{...item,label:item.destination},...recent.filter(x=>x.origin!==item.origin||x.destination!==item.destination)].slice(0,6);write(RECENT,recent);refresh();
 });
 refresh();
})();
