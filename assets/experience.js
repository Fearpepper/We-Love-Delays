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
  {icon:'①',title:'Track your route',text:'Choose a route. Tap Start trip.'},
  {icon:'②',title:'Earn delay points',text:'Bus delays can earn prototype points.'},
  {icon:'③',title:'Explore rewards',text:'Try Demo rewards. No real spending.'}
 ];
 let index=0;
 const modal=document.createElement('div');modal.className='onboarding-overlay';modal.hidden=true;
 modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','How We Love Delays works');
 const panel=document.createElement('div');panel.className='onboarding-panel';
 const count=document.createElement('p');count.className='eyebrow';
 const title=document.createElement('h2'),desc=document.createElement('p'),icon=document.createElement('span');icon.className='onboarding-icon';icon.setAttribute('aria-hidden','true');
 const actions=document.createElement('div');actions.className='actions';
 const skip=document.createElement('button');skip.className='btn alt';skip.type='button';skip.textContent='Close';
 const next=document.createElement('button');next.className='btn';next.type='button';
 actions.append(skip,next);panel.append(count,icon,title,desc,actions);modal.append(panel);document.body.append(modal);
 const render=()=>{count.textContent='HOW IT WORKS · '+(index+1)+' OF '+steps.length;icon.textContent=steps[index].icon;title.textContent=steps[index].title;desc.textContent=steps[index].text;next.textContent=index===steps.length-1?'Get started':'Next →'};
 let previousFocus=null;
 const close=()=>{try{localStorage.setItem('wld-onboarded','1')}catch{}modal.hidden=true;if(previousFocus?.focus)previousFocus.focus()};
 const open=()=>{previousFocus=document.activeElement;index=0;render();modal.hidden=false;next.focus()};
 skip.addEventListener('click',close);
 next.addEventListener('click',()=>{if(index===steps.length-1){close();try{localStorage.setItem('wld-onboarded','1')}catch{}}else{index++;render()}});
 modal.addEventListener('click',e=>{if(e.target===modal)close()});
 modal.addEventListener('keydown',e=>{if(e.key==='Escape')close();if(e.key==='Tab'){const target=e.shiftKey?next:skip;if(e.shiftKey&&document.activeElement===skip){e.preventDefault();next.focus()}else if(!e.shiftKey&&document.activeElement===next){e.preventDefault();skip.focus()}}});
 $('showOnboarding')?.addEventListener('click',open);
 window.addEventListener('DOMContentLoaded',()=>{let seen=false;try{seen=localStorage.getItem('wld-onboarded')==='1';}catch{}if(!seen)open();});
})();
/* Ask once, after the introduction. The browser permission request follows a tap. */
window.addEventListener('DOMContentLoaded',()=>{
 let seen=false;try{seen=localStorage.getItem('wld-location-welcome')==='1'}catch{}
 if(!navigator.geolocation)return;
 if(seen){
  // Refresh the area on return visits only when permission is already granted.
  try{navigator.permissions?.query({name:'geolocation'}).then(permission=>{if(permission.state==='granted'&&!document.getElementById('originSearch')?.value.trim()&&(typeof journey==='undefined'||!journey))document.getElementById('locate')?.click()}).catch(()=>{})}catch{}
  return;
 }
 const card=document.createElement('section');card.id='locationWelcome';card.className='location-welcome';card.hidden=true;card.setAttribute('aria-label','Use your area');
 card.innerHTML='<h2>Find your next ride nearby</h2><p>Use your location for the map and your starting point.</p><div class="actions"><button type="button" class="btn" id="welcomeUseLocation">Use my location</button><button type="button" class="btn alt" id="welcomeSkipLocation">Not now</button></div>';
 document.body.append(card);
 const dismiss=()=>{card.remove();try{localStorage.setItem('wld-location-welcome','1')}catch{}};
 card.querySelector('#welcomeUseLocation').onclick=()=>{dismiss();document.getElementById('locate')?.click()};
 card.querySelector('#welcomeSkipLocation').onclick=dismiss;
 const onboarding=document.querySelector('.onboarding-overlay');
 const show=()=>{if(!onboarding||onboarding.hidden)card.hidden=false};
 if(onboarding){const observer=new MutationObserver(()=>{if(onboarding.hidden){show();observer.disconnect()}});observer.observe(onboarding,{attributes:true,attributeFilter:['hidden']})}
 show();
 window.addEventListener('wld:location-set',dismiss,{once:true});
});
