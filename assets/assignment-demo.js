/* Presentation-only simulation. No transit requests, GPS, live-trip state or wallet writes. */
(function(){
 'use strict';
 const paths={direct:[[80,280],[170,280],[170,210],[340,210],[340,100],[720,100]],transfer:[[80,280],[170,280],[170,210],[400,210],[400,100],[720,100]]};
 const stories={direct:[['walk',2,'Walk to your sample boarding stop'],['board',1,'Board the sample bus'],['ride',3,'Ride toward UC Berkeley'],['delay',5,'Sample delay · earn 10 demo points per minute'],['ride',3,'Continue to your destination'],['arrive',0,'Arrive at UC Berkeley']],transfer:[['walk',2,'Walk to your sample boarding stop'],['board',1,'Board the first sample bus'],['ride',3,'Ride to the sample transfer stop'],['delay',5,'Sample delay · earn 10 demo points per minute'],['transfer',2,'Get off and walk to the next boarding stop'],['board',1,'Board the second sample bus'],['ride',4,'Ride toward Rockridge'],['arrive',0,'Arrive at your sample destination']]};
 const create=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
 window.addEventListener('DOMContentLoaded',()=>{
  const trigger=create('button','Demo');trigger.id='assignmentDemo';trigger.type='button';trigger.className='assignment-demo-trigger';trigger.title='Open assignment ride simulation';trigger.setAttribute('aria-label','Assignment demo');document.querySelector('.shell .top')?.append(trigger);
  const dialog=create('dialog');dialog.id='assignmentDemoDialog';dialog.className='assignment-demo-dialog';dialog.setAttribute('aria-labelledby','demoTitle');
  dialog.innerHTML=`<header class="demo-heading"><div><p class="demo-label">Simulation · not live transit</p><h2 id="demoTitle">Try a sample ride.</h2></div><button type="button" id="demoClose" aria-label="Close assignment demo">Close ×</button></header><p class="hint">For assignment presentations. No GPS or live arrivals needed. Demo points never enter your regular wallet.</p><nav class="demo-tabs" aria-label="Demo sections"><button type="button" id="demoRideTab" aria-pressed="true" aria-controls="demoRidePanel">Ride</button><button type="button" id="demoRedeemTab" aria-pressed="false" aria-controls="demoRedeemPanel">Redeem points</button></nav><section id="demoRidePanel" aria-label="Sample ride"><div class="demo-settings"><label>Sample trip<select id="demoScenario"><option value="direct">Direct · Downtown Berkeley → UC Berkeley</option><option value="transfer">Transfer · Downtown Berkeley → Rockridge</option></select></label><label>Playback speed<select id="demoSpeed"><option value="1">1×</option><option value="4" selected>4×</option><option value="12">12×</option></select></label></div><p class="hint">Illustrative map and sample timings—not street navigation or actual bus service.</p><svg class="demo-map" viewBox="0 0 800 360" role="img" aria-label="Illustrative sample trip map"><rect width="800" height="360" rx="20" fill="#e6eedc"/><path d="M0 60H800M0 160H800M0 260H800M100 0V360M300 0V360M500 0V360M700 0V360" fill="none" stroke="#fffef6" stroke-width="28"/><rect x="570" y="20" width="190" height="130" rx="22" fill="#c8dfa9"/><path id="demoRouteLine" fill="none" stroke="#729552" stroke-width="12" stroke-linejoin="round"/><circle cx="80" cy="280" r="12" fill="#fff" stroke="#1e503c" stroke-width="5"/><circle id="demoTransferPin" cx="400" cy="210" r="12" fill="#f9d665" stroke="#1e503c" stroke-width="5"/><circle cx="720" cy="100" r="12" fill="#fff" stroke="#1e503c" stroke-width="5"/><text x="30" y="325" fill="#153d2d" font-size="20">Downtown Berkeley</text><text id="demoDestinationLabel" x="575" y="60" fill="#153d2d" font-size="20">UC Berkeley</text><g id="demoBus" transform="translate(80 280)"><circle r="24" fill="#003262" stroke="#fff" stroke-width="4"/><text text-anchor="middle" y="6" fill="#fff" font-size="14" font-weight="bold">BUS</text></g></svg><div class="demo-summary"><strong id="demoStep" role="status"></strong><span id="demoTime"></span><progress id="demoProgress" max="100" value="0" aria-label="Simulated ride progress"></progress><p id="demoNarration" class="hint"></p></div><div class="demo-actions"><button type="button" id="demoPlay" class="btn">Play simulation</button><button type="button" id="demoNext" class="btn alt">Next step</button><button type="button" id="demoDelay" class="btn alt">+5 min sample delay</button><button type="button" id="demoReset" class="btn alt">Reset demo</button></div><div class="demo-jump"><label>Jump to a moment<select id="demoJump"></select></label><button type="button" id="demoSkip" class="btn alt">Jump</button></div></section><section class="demo-wallet"><strong>Demo wallet · <span id="demoPoints">0</span> points</strong><p id="demoRewardNote">A 5-minute sample delay is included: 50 potential demo points.</p><button type="button" id="demoCollect" class="btn" disabled>Finish demo &amp; collect points</button><p id="demoCompletion" role="status"></p></section><section id="demoRedeemPanel" hidden aria-label="Demo redemption"><h3>Make your delay count.</h3><p>Spend your demo points on a café treat, a charity contribution, or a BART credit concept.</p><p class="demo-redemption-disclaimer">Simulation only. No café vouchers, donations, BART fares, or Clipper credit are issued. These are example rewards, not partner offers.</p><div id="demoRewardCatalog" class="demo-reward-catalog"></div><div id="demoRedeemConfirm" hidden><p id="demoRedeemPreview"></p><button type="button" id="demoConfirmRedeem" class="btn">Confirm demo redemption</button><button type="button" id="demoCancelRedeem" class="btn alt">Cancel</button></div><p id="demoRedeemStatus" role="status"></p><button type="button" id="demoLoadPoints" class="btn alt">Add 200 sample points</button><p class="hint">For presentations only. Reset demo or change the sample trip to clear this balance and history.</p><h4>Demo redemption history</h4><ul id="demoRedemptionHistory"></ul></section>`;
  document.body.append(dialog);const $=id=>dialog.querySelector('#'+id);
  const setText=(id,text)=>{if($(id).textContent!==String(text))$(id).textContent=text;};
  let demoSection='ride',pendingReward=null,redemptions=[];
  const rewards=[{id:'cafe',icon:'☕',title:'Café treat',description:'Example café reward',cost:50},{id:'charity',icon:'♥',title:'Charity contribution',description:'Example donation concept',cost:50},{id:'bart',icon:'↗',title:'BART credit',description:'Example transit credit concept',cost:100}];
  let scenario='direct',index=0,elapsed=0,extraDelay=0,balance=0,collected=false,playing=false,frame=null,lastTick=null;
  const story=()=>stories[scenario],duration=i=>story()[i][1]+(story()[i][0]==='delay'?extraDelay:0),total=()=>story().reduce((sum,_,i)=>sum+duration(i),0),spent=()=>story().reduce((sum,_,i)=>sum+(i<index?duration(i):i===index?elapsed:0),0);
  function pause(){playing=false;lastTick=null;if(frame!==null)cancelAnimationFrame(frame);frame=null;}
  function reset(){pause();pendingReward=null;redemptions=[];$('demoRedeemStatus').textContent='';$('demoRedeemConfirm').hidden=true;renderHistory();index=0;elapsed=0;extraDelay=0;balance=0;collected=false;
   $('demoJump').replaceChildren();for(let i=0;i<story().length;i++){const option=create('option',(i+1)+'. '+story()[i][2]);option.value=i;$('demoJump').append(option);}render();}
  function progressAlongRoute(){
   // Hold the bus at boarding, delay and transfer stages rather than sliding during a stop.
   const direct=[0,0,0,.45,.45,1],transfer=[0,0,0,.48,.48,.48,.48,1];const positions=scenario==='direct'?direct:transfer;
   const from=positions[index],to=positions[Math.min(index+1,positions.length-1)];return from+(to-from)*(duration(index)?elapsed/duration(index):1);
  }
  function moveBus(fraction){
   const points=paths[scenario],lengths=points.slice(1).map((p,i)=>Math.hypot(p[0]-points[i][0],p[1]-points[i][1]));let remaining=fraction*lengths.reduce((a,b)=>a+b,0);
   for(let i=0;i<lengths.length;i++){if(remaining<=lengths[i]||i===lengths.length-1){const f=Math.min(1,remaining/lengths[i]);$('demoBus').setAttribute('transform','translate('+(points[i][0]+(points[i+1][0]-points[i][0])*f)+' '+(points[i][1]+(points[i+1][1]-points[i][1])*f)+')');return;}remaining-=lengths[i];}
  }
  function render(){
   const current=story()[index],atEnd=current[0]==='arrive',time=spent();
   setText('demoStep','Step '+(index+1)+' of '+story().length+' · '+current[2]);
   setText('demoTime',Math.floor(time)+' / '+total()+' simulated minutes');$('demoProgress').value=atEnd?100:Math.min(100,time/total()*100);
   setText('demoNarration',current[0]==='delay'?'This '+(5+extraDelay)+'-minute delay is fictional. Demo reward: '+((5+extraDelay)*10)+' points.':current[0]==='transfer'?'Sample transfer: confirm getting off, walk to the next stop, then board the second bus.':atEnd?'Sample destination reached. Finish to collect demo points.':'Use Play, Next step, or Jump to present this part of the ride.');
   setText('demoPlay',playing?'Pause':'Play simulation');$('demoPlay').disabled=atEnd;$('demoNext').disabled=atEnd;$('demoDelay').disabled=atEnd||collected||extraDelay>=25;$('demoCollect').disabled=!atEnd||collected;
   setText('demoPoints',balance);setText('demoRewardNote',(5+extraDelay)+'-minute sample delay × 10 = '+((5+extraDelay)*10)+' demo points. Separate from regular rewards.');setText('demoCompletion',collected?'Demo trip complete · '+((5+extraDelay)*10)+' fictional points collected. Reset to replay.':'');
   $('demoTransferPin').style.display=scenario==='transfer'?'':'none';setText('demoDestinationLabel',scenario==='transfer'?'Rockridge':'UC Berkeley');$('demoRouteLine').setAttribute('d',paths[scenario].map((p,i)=>(i?'L':'M')+p.join(' ')).join(' '));moveBus(progressAlongRoute());renderRewards();
  }
  function selectSection(section){
   pause();demoSection=section;pendingReward=null;$('demoRedeemConfirm').hidden=true;
   $('demoRidePanel').hidden=section!=='ride';$('demoRedeemPanel').hidden=section!=='redeem';$('demoCollect').hidden=section!=='ride';
   $('demoRideTab').setAttribute('aria-pressed',String(section==='ride'));$('demoRedeemTab').setAttribute('aria-pressed',String(section==='redeem'));render();
  }
  function renderRewards(){
   for(const reward of rewards){const button=$('demoRedeem-'+reward.id);if(!button)continue;button.disabled=balance<reward.cost;button.textContent=balance<reward.cost?'Need '+(reward.cost-balance)+' more points':'Redeem · '+reward.cost+' points';}
  }
  function renderHistory(){
   $('demoRedemptionHistory').replaceChildren();
   if(!redemptions.length){$('demoRedemptionHistory').append(create('li','No demo redemptions yet.'));return;}
   for(const item of redemptions)$('demoRedemptionHistory').append(create('li',item.title+' · '+item.cost+' points spent · simulation only'));
  }
  for(const reward of rewards){
   const card=create('article');card.className='demo-reward-card demo-reward-'+reward.id;
   const icon=create('span',reward.icon);icon.className='demo-reward-icon';icon.setAttribute('aria-hidden','true');
   const title=create('h4',reward.title),description=create('p',reward.description+' · '+reward.cost+' demo points');
   const button=create('button');button.type='button';button.id='demoRedeem-'+reward.id;button.className='btn alt';button.setAttribute('aria-label','Redeem '+reward.title+' for '+reward.cost+' demo points');
   button.onclick=()=>{if(balance<reward.cost)return;pendingReward=reward;$('demoRedeemPreview').textContent='Spend '+reward.cost+' demo points on '+reward.title+'? This is a simulation; no real reward or payment is issued.';$('demoRedeemConfirm').hidden=false;$('demoConfirmRedeem').focus();};
   card.append(icon,title,description,button);$('demoRewardCatalog').append(card);
  }
  $('demoRideTab').onclick=()=>selectSection('ride');$('demoRedeemTab').onclick=()=>selectSection('redeem');
  $('demoCancelRedeem').onclick=()=>{const reward=pendingReward;pendingReward=null;$('demoRedeemConfirm').hidden=true;if(reward)$('demoRedeem-'+reward.id).focus();};
  $('demoConfirmRedeem').onclick=()=>{
   if(!pendingReward||balance<pendingReward.cost)return;
   const reward=pendingReward;pendingReward=null;balance-=reward.cost;redemptions.unshift(reward);$('demoRedeemConfirm').hidden=true;
   $('demoRedeemStatus').textContent='Demo redeemed: '+reward.title+' · '+reward.cost+' points spent. No real voucher, donation, or transit credit was issued.';renderHistory();render();$('demoRedeemStatus').setAttribute('tabindex','-1');$('demoRedeemStatus').focus();
  };
  $('demoLoadPoints').onclick=()=>{balance+=200;$('demoRedeemStatus').textContent='Added 200 fictional sample points for this presentation.';render();};
  function tick(now){
   frame=null;if(!playing||!dialog.open)return;if(lastTick===null)lastTick=now;let advance=Math.min(1000,now-lastTick)/2000*Number($('demoSpeed').value);lastTick=now;
   while(advance>0&&index<story().length-1){const remaining=duration(index)-elapsed;if(advance<remaining){elapsed+=advance;advance=0;}else{advance-=remaining;index++;elapsed=0;}}
   if(index===story().length-1)pause();render();if(playing)frame=requestAnimationFrame(tick);
  }
  trigger.onclick=()=>{dialog.showModal();render();};$('demoClose').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{pause();render();trigger.focus();});dialog.addEventListener('cancel',pause);
  $('demoPlay').onclick=()=>{if(playing)pause();else{playing=true;lastTick=null;frame=requestAnimationFrame(tick);}render();};
  $('demoNext').onclick=()=>{pause();index=Math.min(index+1,story().length-1);elapsed=0;render();};
  $('demoSkip').onclick=()=>{pause();index=Number($('demoJump').value);elapsed=0;render();};
  $('demoDelay').onclick=()=>{extraDelay=Math.min(25,extraDelay+5);render();};$('demoReset').onclick=reset;
  $('demoScenario').onchange=()=>{scenario=$('demoScenario').value;reset();};$('demoSpeed').onchange=()=>{lastTick=null;};
  $('demoCollect').onclick=()=>{if(index!==story().length-1||collected)return;collected=true;balance+=(5+extraDelay)*10;render();};
  document.addEventListener('visibilitychange',()=>{if(document.hidden){pause();render();}});window.addEventListener('pagehide',pause);reset();
 });
})();
