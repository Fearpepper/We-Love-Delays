/* Present the existing navigation engine as a first-class Guide screen. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const panel=$('navigationPanel'),content=$('guideContent'),empty=$('guideEmpty');
 if(!panel||!content||!empty)return;
 content.appendChild(panel);
 function update(){
  const hasRoute=!panel.classList.contains('hidden');
  empty.hidden=hasRoute;content.hidden=!hasRoute;syncMap();
 }
 window.wldUpdateGuide=update;
 window.wldSyncGuideMap=syncMap;
 $('guidePlanTrip').addEventListener('click',()=>{
  if(typeof window.wldSelectTab==='function')window.wldSelectTab('routes');
  const input=$('originSearch');if(input)input.focus({preventScroll:true});
 });
 const observer=new MutationObserver(update);
 observer.observe(panel,{attributes:true,attributeFilter:['class']});
 update();
})();