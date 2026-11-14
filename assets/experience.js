/* Lightweight onboarding and local accessibility preferences. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const key='wld-experience-v1';
 let prefs={};try{prefs=JSON.parse(localStorage.getItem(key)||'{}')||{}}catch{}
 const apply=()=>{document.body.classList.toggle('wld-large-text',!!prefs.largeText);document.body.classList.toggle('wld-high-contrast',!!prefs.highContrast)};
 const save=()=>{try{localStorage.setItem(key,JSON.stringify(prefs))}catch{}};
 for(const [id,prop] of [['largeText','largeText'],['highContrast','highContrast']]){
  const input=$(id);if(!input)continue;input.checked=!!prefs[prop];
  input.addEventListener('change',()=>{prefs[prop]=input.checked;apply();save()});
 }
 apply();
 const steps=[
  {title:'Plan your ride',text:'Enter your starting point and destination. Select a bus option to see the published stop sequence.'},
  {title:'Follow your route',text:'Open Guide for boarding, riding and transfer steps. Live predictions may be unavailable, and GPS is optional.'},
  {title:'Understand rewards',text:'The wallet shows fictional points based on qualifying destination delay predictions. These are not verified actual delays or redeemable rewards.'}
 ];
 let index=0;
 const modal=document.createElement('div');modal.className='onboarding-overlay';modal.hidden=true;
 modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','How We Love Delays works');
 const panel=document.createElement('div');panel.className='onboarding-panel';
 const count=document.createElement('p');count.className='eyebrow';
 const title=document.createElement('h2'),desc=document.createElement('p');
 const actions=document.createElement('div');actions.className='actions';
 const skip=document.createElement('button');skip.className='btn alt';skip.type='button';skip.textContent='Close';
 const next=document.createElement('button');next.className='btn';next.type='button';
 actions.append(skip,next);panel.append(count,title,desc,actions);modal.append(panel);document.body.append(modal);
 const render=()=>{count.textContent='HOW IT WORKS · '+(index+1)+' OF '+steps.length;title.textContent=steps[index].title;desc.textContent=steps[index].text;next.textContent=index===steps.length-1?'Get started':'Next →'};
 let previousFocus=null;
 const close=()=>{modal.hidden=true;if(previousFocus?.focus)previousFocus.focus()};
 const open=()=>{previousFocus=document.activeElement;index=0;render();modal.hidden=false;next.focus()};
 skip.addEventListener('click',close);
 next.addEventListener('click',()=>{if(index===steps.length-1){close();try{localStorage.setItem('wld-onboarded','1')}catch{}}else{index++;render()}});
 modal.addEventListener('click',e=>{if(e.target===modal)close()});
 modal.addEventListener('keydown',e=>{if(e.key==='Escape')close();if(e.key==='Tab'){const target=e.shiftKey?next:skip;if(e.shiftKey&&document.activeElement===skip){e.preventDefault();next.focus()}else if(!e.shiftKey&&document.activeElement===next){e.preventDefault();skip.focus()}}});
 $('showOnboarding')?.addEventListener('click',open);
})();