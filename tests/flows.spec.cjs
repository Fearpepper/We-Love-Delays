const {test,expect}=require('@playwright/test');
test.use({baseURL:process.env.BASE_URL||'http://127.0.0.1:10000',serviceWorkers:'block'});
const stop=(id,name,lon)=>({id,name,code:id,lat:37.87,lon});
const network={routes:[{id:'51B',name:'51B'},{id:'6',name:'6'}],stops:{a:stop('a','Alpha boarding',-122.27),b:stop('b','Beta transfer',-122.26),c:stop('c','Gamma destination',-122.25)},patterns:[{route:'51B',direction:'0',headsign:'Beta',stops:['a','b'],sample_trip:'one'},{route:'6',direction:'0',headsign:'Gamma',stops:['b','c'],sample_trip:'two'}]};
async function setup(page,delayed=true,networkReady=Promise.resolve(),skipOnboarding=true){
 if(skipOnboarding)await page.addInitScript(()=>localStorage.setItem('wld-onboarded','1'));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  let data={};
  if(path==='/api/status')data={configured:true};
  if(path==='/api/network'){await networkReady;data=network;}
  if(path==='/api/alerts')data={alerts:[],fetched:Math.floor(Date.now()/1000)};
  if(path==='/api/places')data={places:[]};
  if(path==='/api/arrivals')data={arrivals:delayed?[{route:'51B',vehicle:'test-bus',recorded:new Date().toISOString(),aimed:new Date(Date.now()+600000).toISOString(),expected:new Date(Date.now()+900000).toISOString()}]:[]};
  if(path==='/api/scheduled-journey')data={trips:[]};
  if(path==='/api/walk-route')data={available:false};
  await route.fulfill({json:data});
 });

 await page.goto('/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#feedStatus')).toContainText('connected');
 return errors;
}
async function plan(page,destination='Beta transfer'){
 await page.locator('#originSearch').fill('Alpha boarding');
 await page.locator('#originSuggestions button').first().click();
 await page.locator('#place').fill(destination);
 await page.locator('#destinationSuggestions button').first().click();
 await page.locator('#autoFind').click();
 await page.locator('.route-choice').first().click();
 await expect(page.locator('#guideContent')).toBeVisible();
}
test('direct journey completes once and wallet persists prediction points',async({page})=>{
 const errors=await setup(page);
 for(const id of ['appTrips','appGuide','appRewards'])await expect(page.locator('#'+id)).toBeInViewport();
 await plan(page);
 await expect(page.locator('#guideStartTrip')).toBeEnabled();
 await page.locator('#navAdvance').click();
 await expect(page.locator('#navNext')).toContainText('Wait for and board');
 await page.locator('#guideStartTrip').click();
 await expect(page.locator('#guidePrediction')).toBeVisible();
 await expect(page.locator('#liveRefresh')).toBeEnabled();
 await expect(page.locator('#liveTrackingState')).toContainText('Fresh 511 vehicle prediction');
 await expect(page.locator('#liveDelayValue')).toHaveText('5');
 await expect(page.locator('#guideArrivalSummary')).toContainText('Final bus stop ETA');
 await expect(page.locator('#livePointsValue')).toHaveText('50');
 await expect(page.locator('#guideTripFeedback')).toContainText(/Checking|Destination/);
 await expect(page.locator('#delayPreview')).toContainText('5 min late');
 await page.locator('#guideFinishTrip').click();
 await expect(page.locator('#guidePrediction')).toBeHidden();
 await expect(page.locator('#tripComplete')).toBeVisible();
 await expect(page.locator('#guideEmpty')).toBeHidden();
 await expect(page.locator('#tripCompleteSummary')).toContainText('50 prototype points');
 await page.locator('#tripViewRewards').click();
 await expect(page.locator('#points')).toHaveText('50');
 await page.reload({waitUntil:'domcontentloaded'});await page.locator('#appRewards').click();
 await expect(page.locator('#points')).toHaveText('50');
 await expect(page.locator('#rewardHistory')).toContainText('+50 pts');
 expect(errors).toEqual([]);
});
test('missing predictions complete without points and allow another trip',async({page})=>{
 const errors=await setup(page,false);await plan(page);
 await page.locator('#guideStartTrip').click();
 await page.locator('#guideFinishTrip').click();
 await expect(page.locator('#tripCompleteSummary')).toContainText('No points');
 await expect(page.locator('#guideEmpty')).toBeHidden();
 await page.locator('#tripPlanAgain').click();
 await expect(page.locator('#originSearch')).toBeVisible();
 await expect(page.locator('#points')).toHaveText('0');
 expect(errors).toEqual([]);
});
test('transfer can start and finish without unsupported reward tracking',async({page})=>{
 const errors=await setup(page);await plan(page,'Gamma destination');
 await expect(page.locator('#navTitle')).toHaveText('Transfer directions');
 await expect(page.locator('.route-result-badge').first()).toHaveText('1 transfer');
 await expect(page.locator('#guideStartTrip')).toBeEnabled();
 await page.locator('#guideStartTrip').click();
 await expect(page.locator('#guideTripFeedback')).toContainText('Trip started');
 const steps=await page.locator('#navSteps .nav-step').count();
 for(let i=0;i<steps;i++)await page.locator('#navAdvance').click();
 await expect(page.locator('#tripComplete')).toBeVisible();
 await expect(page.locator('#guideContent')).toBeHidden();
 await expect(page.locator('#points')).toHaveText('0');
 await page.locator('#tripPlanAgain').click();
 await page.locator('#appTrips').click();
 await expect(page.locator('#originSearch')).toBeVisible();
 expect(errors).toEqual([]);
});

 test('typing before the network loads refreshes stop suggestions on arrival',async({page})=>{
  let release;const ready=new Promise(resolve=>{release=resolve});
  const errors=await setup(page,true,ready);
  await page.locator('#originSearch').fill('Alpha boarding');
  await expect(page.locator('#originSuggestions button')).toHaveCount(0);
  release();
  await expect(page.locator('#originSuggestions button').first()).toContainText('Alpha boarding');
  await page.locator('#originSuggestions button').first().click();
  expect(errors).toEqual([]);
 });

test('an older place lookup cannot erase newer stop suggestions',async({page})=>{
 const errors=await setup(page);
 await expect(page.locator('#message')).toContainText('AC Transit data loaded');
 let release,started;
 const pending=new Promise(resolve=>{release=resolve});
 const requested=new Promise(resolve=>{started=resolve});
 await page.route('**/api/places?**',async route=>{
  if(new URL(route.request().url()).searchParams.get('q')==='zzzz'){started();await pending;}
  await route.fulfill({json:{places:[]}});
 });
 await page.locator('#originSearch').fill('zzzz');
 await requested;
 await page.locator('#originSearch').fill('Alpha boarding');
 await expect(page.locator('#originSuggestions button').first()).toContainText('Alpha boarding');
 const oldResponse=page.waitForResponse(r=>r.url().includes('/api/places?q=zzzz'));
 release();await oldResponse;
 await expect(page.locator('#originSuggestions button').first()).toContainText('Alpha boarding');
 expect(errors).toEqual([]);
});

test('stale 511 reports cannot be shown as live or award prototype points',async({page})=>{
 const errors=await setup(page);
 await page.route('**/api/arrivals?**',async route=>{
  const now=Date.now();
  await route.fulfill({json:{arrivals:[{route:'51B',vehicle:'stale-bus',recorded:new Date(now-7*60000).toISOString(),aimed:new Date(now+4*60000).toISOString(),expected:new Date(now+9*60000).toISOString(),destination:'Beta'}]}});
 });
 await expect(page.locator('#message')).toContainText('AC Transit data loaded');
 await plan(page);
 await page.locator('#guideStartTrip').click();
 await expect(page.locator('#delayPreview')).toContainText('not confirmed');
 await page.locator('#guideFinishTrip').click();
 await expect(page.locator('#tripCompleteSummary')).toContainText('No points');
 await page.locator('#tripViewRewards').click();
 await expect(page.locator('#points')).toHaveText('0');
 expect(errors).toEqual([]);
});
test('selected origin stop takes precedence over older GPS for walking',async({page})=>{
 const errors=await setup(page);
 await expect(page.locator('#message')).toContainText('AC Transit data loaded');
 await page.evaluate(()=>{locationPoint={lat:37.90,lon:-122.34}});
 const walkedFromGps=[];
 await page.route('**/api/walk-route?**',async route=>{
  const qs=new URL(route.request().url()).searchParams;
  if(Math.abs(Number(qs.get('from_lat'))-37.90)<0.00001)walkedFromGps.push(route.request().url());
  await route.fulfill({json:{available:true,minutes:2.5,meters:180,geometry:{type:'LineString',coordinates:[[-122.27,37.87],[-122.26,37.87]]}}});
 });
 await plan(page);
 await expect(page.locator('#navSteps')).toContainText('Already at this stop · no walk required');
 await expect(page.locator('#navSteps')).not.toContainText('Walking route unavailable until');
 expect(walkedFromGps).toEqual([]);
 expect(errors).toEqual([]);
});

test('Guide focuses on the selected direct trip, not a distant GPS point',async({page})=>{
 const errors=await setup(page);
 await page.evaluate(()=>{locationPoint={lat:40.7128,lon:-74.006}});
 await plan(page);
 await expect(page.locator('#guideMapHost #map')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>typeof routeMap!=='undefined'&&routeMap?routeMap.getZoom():null)).toBeGreaterThanOrEqual(12);
 await expect.poll(()=>page.evaluate(()=>routeMap?.getCenter()?.lat??0)).toBeGreaterThan(37.85);
 const before=await page.evaluate(()=>({lat:routeMap.getCenter().lat,lon:routeMap.getCenter().lng,zoom:routeMap.getZoom()}));
 expect(before.lat).toBeLessThan(37.9);
 expect(before.lon).toBeGreaterThan(-122.30);
 expect(before.lon).toBeLessThan(-122.23);
 await page.locator('#guideStartTrip').click();
 await expect.poll(()=>page.evaluate(()=>routeMap?.getZoom()||0)).toBeGreaterThanOrEqual(12);
 const after=await page.evaluate(()=>({lat:routeMap.getCenter().lat,lon:routeMap.getCenter().lng}));
 expect(after.lat).toBeGreaterThan(37.85);
 expect(after.lon).toBeGreaterThan(-122.30);
 expect(errors).toEqual([]);
});
test('Guide fits both bus legs of a transfer on the map',async({page})=>{
 const errors=await setup(page);
 await plan(page,'Gamma destination');
 await expect(page.locator('#guideMapHost #map')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>routeMap?.getZoom()||0)).toBeGreaterThanOrEqual(12);
 // Guide moves the map after the click; wait for the subsequent route fit.
 await expect.poll(()=>page.evaluate(()=>routeMap?.getBounds().contains([37.87,-122.27])&&routeMap?.getBounds().contains([37.87,-122.25]))).toBe(true);
 expect(await page.evaluate(()=>routeMap.getZoom())).toBeGreaterThanOrEqual(12);
 expect(errors).toEqual([]);
});

test('last direction step completes a direct trip and cannot award twice',async({page})=>{
 const errors=await setup(page);await plan(page);
 await page.locator('#guideStartTrip').click();
 await expect(page.locator('#delayPreview')).toContainText('5 min late');
 const steps=await page.locator('#navSteps .nav-step').count();
 for(let i=0;i<steps;i++)await page.locator('#navAdvance').click();
 await expect(page.locator('#tripComplete')).toBeVisible();
 await expect(page.locator('#points')).toHaveText('50');
 await page.locator('#tripPlanAgain').click();await plan(page);
 await expect(page.locator('#guideStartTrip')).toBeEnabled();
 await expect(page.locator('#points')).toHaveText('50');
 expect(errors).toEqual([]);
});

test('manual route selection opens Guide and starts the selected bus',async({page})=>{
 const errors=await setup(page);
 await expect(page.locator('#message')).toContainText('AC Transit data loaded');
 await page.locator('#manualRouteDetails > summary').click();
 await page.locator('#route').selectOption('51B');
 await page.locator('#pattern').selectOption({index:1});
 await page.locator('#board').selectOption({index:1});
 await page.locator('#exit').selectOption({index:1});
 await page.locator('#preview').click();
 await expect(page.locator('#guideContent')).toBeVisible();
 await expect(page.locator('#navSteps')).toContainText('Beta transfer');
 await page.locator('#guideStartTrip').click();
 await expect(page.locator('#guideFinishTrip')).toBeVisible();
 await page.locator('#guideFinishTrip').click();
 await expect(page.locator('#tripComplete')).toBeVisible();
 expect(errors).toEqual([]);
});
test('empty search and empty Guide recover without a crash',async({page})=>{
 const errors=await setup(page);
 await expect(page.locator('#message')).toContainText('AC Transit data loaded');
 await page.locator('#autoFind').click();
 await expect(page.locator('#autoResults')).toContainText('Could not match');
 await expect(page.locator('#autoFind')).toBeEnabled();
 await page.locator('#appGuide').click();
 await expect(page.locator('#guideEmpty')).toBeVisible();
 await page.locator('#guidePlanTrip').click();
 await expect(page.locator('#originSearch')).toBeVisible();
 expect(errors).toEqual([]);
});
test('tabs preserve selected route and remain within the viewport',async({page})=>{
 const errors=await setup(page);await plan(page);
 for(const id of ['appMap','appRewards','appTrips','appGuide']){
  await expect(page.locator('#'+id)).toBeInViewport();
  await page.locator('#'+id).click();
  await expect(page.locator('#'+id)).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
 }
 await expect(page.locator('#guideContent')).toBeVisible();
 await expect(page.locator('#guideMapHost #map')).toBeVisible();
 await expect(page.locator('#guideStartTrip')).toBeEnabled();
 expect(errors).toEqual([]);
});
test('transit outage shows a useful error without simulated routes',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('wld-onboarded','1'));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/status',route=>route.fulfill({json:{configured:true}}));
 await page.route('**/api/network',route=>route.fulfill({status:503,json:{error:'Transit feed temporarily unavailable'}}));
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#feedStatus')).toContainText('Live data unavailable');
 await expect(page.locator('#message')).toContainText('Transit feed temporarily unavailable');
 await expect(page.locator('#route')).toBeDisabled();
 await page.locator('#autoFind').click();
 await expect(page.locator('#autoResults')).toContainText('Routes have not loaded');
 expect(errors).toEqual([]);
});

test('active direct trip recovers route and progress without restoring old prediction credit',async({page})=>{
 const errors=await setup(page);await plan(page);
 await page.locator('#guideStartTrip').click();
 await expect(page.locator('#delayPreview')).toContainText('5 min late');
 await page.locator('#navAdvance').click();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('wld-active-trip-v1')));
 expect(saved.progress).toBe(1);
 expect(saved).not.toHaveProperty('locationPoint');
 expect(saved).not.toHaveProperty('delay');
 await page.route('**/api/arrivals?**',route=>route.fulfill({json:{arrivals:[]}}));
 await page.reload({waitUntil:'domcontentloaded'});
 await expect(page.locator('#guideTripFeedback')).toContainText('Trip restored');
 await expect(page.locator('#navNext')).toContainText('Wait for and board');
 await expect(page.locator('#guideFinishTrip')).toBeVisible();
 await expect(page.locator('#guideMapHost #map')).toBeVisible();
 await expect(page.locator('#livePointsValue')).toHaveText('0');
 await page.locator('#guideFinishTrip').click();
 await expect(page.locator('#tripComplete')).toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem('wld-active-trip-v1'))).toBeNull();
 await page.reload({waitUntil:'domcontentloaded'});await page.locator('#appGuide').click();
 await expect(page.locator('#guideEmpty')).toBeVisible();
 await page.locator('#appRewards').click();await expect(page.locator('#points')).toHaveText('0');
 expect(errors).toEqual([]);
});
test('saved transfer directions recover when the transit network is unavailable',async({page})=>{
 const errors=await setup(page);await plan(page,'Gamma destination');
 await page.locator('#guideStartTrip').click();
 await page.locator('#navAdvance').click();
 await page.route('**/api/network',route=>route.fulfill({status:503,json:{error:'Network unavailable'}}));
 await page.reload({waitUntil:'domcontentloaded'});
 await expect(page.locator('#feedStatus')).toContainText('Saved trip only');
 await expect(page.locator('#connectionStatus')).toContainText('Live transit data is unavailable');
 await expect(page.locator('#guideTripFeedback')).toContainText('Trip restored');
 await expect(page.locator('#navTitle')).toContainText('Transfer');
 await expect(page.locator('#guideFinishTrip')).toBeVisible();
 await expect(page.locator('a').filter({hasText:'Check trip in Google Maps'})).toHaveAttribute('href',/travelmode=transit/);
 await page.locator('#guideFinishTrip').click();
 await expect(page.locator('#tripComplete')).toBeVisible();
 expect(errors).toEqual([]);
});
test('old or corrupt saved trips do not block a fresh search',async({page})=>{
 const errors=await setup(page);
 await page.evaluate(()=>localStorage.setItem('wld-active-trip-v1','{broken json'));
 await page.reload({waitUntil:'domcontentloaded'});
 await expect(page.locator('#message')).toContainText('AC Transit data loaded');
 await expect(page.locator('#originSearch')).toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem('wld-active-trip-v1'))).toBeNull();
 await plan(page);await page.locator('#guideStartTrip').click();
 await page.evaluate(()=>{const key='wld-active-trip-v1',data=JSON.parse(localStorage.getItem(key));data.startedAt=Date.now()-13*3600000;localStorage.setItem(key,JSON.stringify(data));});
 // Avoid pagehide replacing the intentionally expired fixture.
 const expired=await page.evaluate(()=>localStorage.getItem('wld-active-trip-v1'));
 await page.context().addInitScript(value=>localStorage.setItem('wld-active-trip-v1',value),expired);
 await page.reload({waitUntil:'domcontentloaded'});
 await expect(page.locator('#message')).toContainText('AC Transit data loaded');
 await page.locator('#appGuide').click();await expect(page.locator('#guideEmpty')).toBeVisible();
 expect(errors).toEqual([]);
});
test('boarding countdowns update and stale vehicle reports stop showing as live',async({page})=>{
 await page.clock.install({time:new Date()});
 const errors=await setup(page);
 await expect(page.locator('#message')).toContainText('AC Transit data loaded');
 await page.locator('#manualRouteDetails > summary').click();
 await page.locator('#route').selectOption('51B');await page.locator('#pattern').selectOption({index:1});
 await page.locator('#board').selectOption({index:1});
 await expect(page.locator('#arrivals')).toContainText('Predicted');
 await page.clock.fastForward(6*60000);
 await expect(page.locator('#arrivals')).toContainText('Scheduled');
 await expect(page.locator('#arrivals')).not.toContainText('Predicted');
 await expect(page.locator('#predicted')).toHaveText('—');
 expect(errors).toEqual([]);
});

test('cancelling clears recovery without awarding provisional points',async({page})=>{
 const errors=await setup(page);await plan(page);
 await page.locator('#guideStartTrip').click();
 await expect(page.locator('#livePointsValue')).toHaveText('50');
 await expect(page.locator('#tripRecoveryStatus')).toContainText('saved on this device');
 await page.locator('#cancelTrip').click();
 await expect(page.locator('#tripComplete')).toContainText('Trip cancelled');
 await expect(page.locator('#points')).toHaveText('0');
 expect(await page.evaluate(()=>localStorage.getItem('wld-active-trip-v1'))).toBeNull();
 expect(errors).toEqual([]);
});

test('saved bus directions open before a slow transit network download completes',async({page})=>{
 const errors=await setup(page);await plan(page);await page.locator('#guideStartTrip').click();
 await expect(page.locator('#tripRecoveryStatus')).toContainText('saved on this device');
 let release;const gate=new Promise(resolve=>{release=resolve});
 await page.route('**/api/network',async route=>{await gate;await route.fulfill({json:network});});
 await page.reload({waitUntil:'domcontentloaded'});
 await expect(page.locator('#guideFinishTrip')).toBeVisible();
 await expect(page.locator('#guideTripFeedback')).toContainText('Trip restored');
 await expect(page.locator('#navSteps')).toContainText('Beta transfer');
 release();
 await expect(page.locator('#message')).toContainText('AC Transit data loaded');
 await expect(page.locator('#guideFinishTrip')).toBeVisible();
 expect(errors).toEqual([]);
});

test('unavailable browser storage is explained without blocking trip controls',async({page})=>{
 await page.addInitScript(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='wld-active-trip-v1')throw new DOMException('Storage blocked','QuotaExceededError');return set.call(this,key,value);};});
 const errors=await setup(page);await plan(page);await page.locator('#guideStartTrip').click();
 await expect(page.locator('#tripRecoveryStatus')).toContainText('storage is unavailable');
 await expect(page.locator('#guideFinishTrip')).toBeVisible();
 await page.locator('#cancelTrip').click();
 await expect(page.locator('#tripComplete')).toContainText('Trip cancelled');
 expect(errors).toEqual([]);
});
test('going offline removes provisional prediction credit and keeps written directions',async({page})=>{
 const errors=await setup(page);await plan(page);await page.locator('#guideStartTrip').click();
 await expect(page.locator('#livePointsValue')).toHaveText('50');
 await page.context().setOffline(true);
 await expect(page.locator('#connectionStatus')).toBeVisible();
 await expect(page.locator('#connectionStatus')).toContainText('Offline');
 await expect(page.locator('#livePointsValue')).toHaveText('0');
 await expect(page.locator('#navSteps')).toContainText('Beta transfer');
 await page.locator('#guideFinishTrip').click();
 await expect(page.locator('#points')).toHaveText('0');
 expect(errors).toEqual([]);
});

test('route ranking uses the selected starting stop instead of an older GPS fix',async({page})=>{
 const errors=await setup(page);
 await page.evaluate(()=>{locationPoint={lat:40.7128,lon:-74.006};});
 await plan(page);
 await expect(page.locator('.route-choice small').first()).toContainText('~0 m to board');
 expect(errors).toEqual([]);
});

test('service alerts respect route, stop, direction and active periods and render safely',async({page})=>{
 const errors=await setup(page);
 await page.route('**/api/alerts',route=>route.fulfill({json:{fetched:Math.floor(Date.now()/1000),alerts:[
  {title:'Boarding stop closed',description:'Use next stop <script>alert(1)</script>',selectors:[{route:'51B',stop:'a',direction:0}],periods:[]},
  {title:'Other route only',selectors:[{route:'6'}],periods:[]},
  {title:'Reverse direction only',selectors:[{route:'51B',direction:1}],periods:[]},
  {title:'Expired notice',selectors:[],periods:[{end:1}]},
  {title:'Agency-wide update',selectors:[],periods:[]}
 ]}}));
 await page.reload({waitUntil:'domcontentloaded'});await plan(page);
 const panel=page.locator('#guideServiceAlerts');
 await expect(panel).toContainText('Boarding stop closed');
 await expect(panel).toContainText('Agency-wide update');
 await expect(panel).not.toContainText('Other route only');
 await expect(panel).not.toContainText('Reverse direction only');
 await expect(panel).not.toContainText('Expired notice');
 await page.locator('details.trip-inspector').filter({has:panel}).locator(':scope > summary').click();
 await panel.locator('summary').first().click();
 await expect(panel).toContainText('<script>alert(1)</script>');
 await page.context().setOffline(true);
 await expect(panel).toContainText('may be outdated');
 expect(errors).toEqual([]);
});
test('failed alert feed keeps directions usable and shows an official fallback',async({page})=>{
 const errors=await setup(page);
 await page.route('**/api/alerts',route=>route.fulfill({status:502,json:{error:'Provider unavailable'}}));
 await page.reload({waitUntil:'domcontentloaded'});await plan(page);
 await expect(page.locator('#guideServiceAlerts')).toContainText('Alerts unavailable');
 await expect(page.locator('#guideServiceAlerts a')).toHaveAttribute('href','https://www.actransit.org/alert');
 await page.locator('#guideStartTrip').click();await page.locator('#guideFinishTrip').click();
 await expect(page.locator('#tripComplete')).toBeVisible();expect(errors).toEqual([]);
});
test('transfer results check connection feasibility before selection',async({page})=>{
 const errors=await setup(page);
 const now=Date.now();
 await page.route('**/api/scheduled-journey?*',route=>{
  const second=new URL(route.request().url()).searchParams.get('trip')==='two';
  route.fulfill({json:{trips:[{departure:new Date(now+(second?30:10)*60000).toISOString(),arrival:new Date(now+(second?40:20)*60000).toISOString()}]}});
 });
 await plan(page,'Gamma destination');
 await expect(page.locator('.route-choice .route-timing')).toContainText('Scheduled arrival');
 await expect(page.locator('#guideStartTrip')).toBeEnabled();expect(errors).toEqual([]);
});

test('failed transit download can retry without reloading the page',async({page})=>{
 const errors=await setup(page);
 let unavailable=true;
 await page.route('**/api/network',route=>unavailable?route.fulfill({status:503,json:{error:'Temporarily unavailable'}}):route.fulfill({json:network}));
 await page.reload({waitUntil:'domcontentloaded'});
 await expect(page.locator('#retryNetwork')).toBeVisible();
 unavailable=false;await page.locator('#retryNetwork').click();
 await expect(page.locator('#retryNetwork')).toBeHidden();
 await expect(page.locator('#message')).toContainText('AC Transit data loaded');
 await plan(page);await expect(page.locator('#guideStartTrip')).toBeEnabled();expect(errors).toEqual([]);
});

test('transfer rewards wait for final-bus boarding and use only its delay',async({page})=>{
 const errors=await setup(page);await plan(page,'Gamma destination');
 await page.route('**/api/arrivals?*',route=>route.fulfill({json:{arrivals:[{route:'6',vehicle:'last-bus',recorded:new Date().toISOString(),aimed:new Date(Date.now()+600000).toISOString(),expected:new Date(Date.now()+720000).toISOString()}]}}));
 await page.locator('#guideStartTrip').click();
 await expect(page.locator('#livePointsValue')).toHaveText('0');
 // reach, board first bus, leave first bus, board final bus
 for(let i=0;i<4;i++)await page.locator('#navAdvance').click();
 await expect(page.locator('#livePointsValue')).toHaveText('20');
 await expect(page.locator('#liveDataNote')).toContainText('final bus prediction only');
 await page.locator('#guideFinishTrip').click();
 await expect(page.locator('#points')).toHaveText('20');
 await page.reload({waitUntil:'domcontentloaded'});await page.locator('#appRewards').click();
 await expect(page.locator('#rewardHistory')).toContainText('final bus prediction');
 expect(errors).toEqual([]);
});
test('stale or inaccurate GPS fixes cannot advance walking progress',async({page})=>{
 const errors=await setup(page);await plan(page);
 const before=await page.evaluate(()=>activeNavigation.progress);
 await page.evaluate(()=>updateNavigationPosition(37.87,-122.27,5,Date.now()-60000));
 expect(await page.evaluate(()=>activeNavigation.progress)).toBe(before);
 await expect(page.locator('#navStatus')).toContainText('outdated');
 await page.evaluate(()=>updateNavigationPosition(37.87,-122.27,150,Date.now()));
 expect(await page.evaluate(()=>activeNavigation.progress)).toBe(before);
 await expect(page.locator('#gpsDiagnostics')).toContainText('accuracy is low');
 await page.evaluate(()=>updateNavigationPosition(37.87,-122.27,5,Date.now()));
 expect(await page.evaluate(()=>activeNavigation.progress)).toBe(before+1);
 await expect(page.locator('#navNext')).toContainText('Wait for and board');
 expect(errors).toEqual([]);
});
test('current disruption automatically searches alternatives without replacing the trip',async({page})=>{
 const errors=await setup(page);
 await page.route('**/api/alerts',route=>route.fulfill({json:{fetched:Math.floor(Date.now()/1000),alerts:[{id:'closed',title:'51B closed now',description:'Use another bus',effect:'NO_SERVICE',selectors:[{route:'51B'}],periods:[{start:Math.floor(Date.now()/1000)-60,end:Math.floor(Date.now()/1000)+3600}]}]}}));
 await page.reload({waitUntil:'domcontentloaded'});await plan(page);
 await expect(page.locator('#replanPanel')).toBeVisible();
 await expect(page.locator('#replanStatus')).toContainText('search complete');
 await expect(page.locator('#replanResults')).not.toContainText('Bus 51B');
 await expect(page.locator('#guideStartTrip')).toBeVisible();
 await expect(page.locator('#navSteps')).toContainText('Bus 51B');
 expect(errors).toEqual([]);
});
test('undated disruption offers review instead of automatically assuming it applies now',async({page})=>{
 const errors=await setup(page);
 await page.route('**/api/alerts',route=>route.fulfill({json:{fetched:Math.floor(Date.now()/1000),alerts:[{id:'future',title:'Future detour',effect:'DETOUR',selectors:[{route:'51B'}],periods:[]}]}}));
 await page.reload({waitUntil:'domcontentloaded'});await plan(page);
 await expect(page.locator('#replanStatus')).toContainText('published dates');
 await expect(page.locator('#replanResults')).toBeEmpty();expect(errors).toEqual([]);
});

test('a fresh on-time prediction completes without a false missing-data warning',async({page})=>{
 const errors=await setup(page);await plan(page);
 const time=new Date(Date.now()+600000).toISOString();
 await page.route('**/api/arrivals?*',route=>route.fulfill({json:{arrivals:[{route:'51B',vehicle:'on-time-bus',recorded:new Date().toISOString(),aimed:time,expected:time}]}}));
 await page.locator('#guideStartTrip').click();
 await expect(page.locator('#liveTrackingState')).toContainText('Fresh 511');
 await expect(page.locator('#liveDelayValue')).toHaveText('0');
 await page.locator('#guideFinishTrip').click();
 await expect(page.locator('#tripPointsDetails')).toContainText('reported no delay');
 expect(errors).toEqual([]);
});
test('replanning an active trip gives visible origin guidance and preserves progress',async({page})=>{
 const errors=await setup(page);
 await page.route('**/api/alerts',route=>route.fulfill({json:{fetched:Math.floor(Date.now()/1000),alerts:[{id:'notice',title:'Check dates',effect:'DETOUR',selectors:[{route:'51B'}],periods:[]}]}}));
 await page.reload({waitUntil:'domcontentloaded'});await plan(page);await page.locator('#guideStartTrip').click();
 await page.locator('details.trip-inspector').filter({has:page.locator('#replanPanel')}).locator(':scope > summary').click();
 await page.locator('#replanPanel button').click();
 await expect(page.locator('#message')).toContainText('current starting stop');
 await page.locator('#appGuide').click();await expect(page.locator('#guideFinishTrip')).toBeVisible();expect(errors).toEqual([]);
});

test('trip hierarchy presents concrete actions and expandable route detail',async({page})=>{
 const errors=await setup(page);
 await page.screenshot({path:test.info().outputPath('layered-planner.png'),fullPage:true});
 await plan(page);
 await page.screenshot({path:test.info().outputPath('layered-guide.png'),fullPage:true});
 await expect(page.locator('.guide-hero h1')).toHaveText('51B');
 await expect(page.locator('#navAdvance')).toHaveText("I'm at the stop");
 const details=page.locator('details.trip-inspector').filter({has:page.locator('#navSteps')});
 await expect(details).not.toHaveAttribute('open','');
 await details.locator(':scope > summary').click();await expect(page.locator('#navSteps')).toBeVisible();
 await page.locator('#guideStartTrip').click();await expect(page.locator('#navAdvance')).toHaveClass(/is-next-action/);
 await page.locator('#navAdvance').click();await expect(page.locator('#navAdvance')).toHaveText("I'm on Bus 51B");
 await page.locator('#navAdvance').click();await expect(page.locator('#navAdvance')).toHaveText("I've arrived · Finish trip");
 await page.locator('#navAdvance').click();await expect(page.locator('#tripComplete')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(errors).toEqual([]);
});

test('business choices show branch addresses and plan from actual place coordinates',async({page})=>{
 const errors=await setup(page);
 await page.route('**/api/places?*',route=>{
  const text=new URL(route.request().url()).searchParams.get('q');
  return route.fulfill({json:{places:text.includes('coffee')?[{name:'Coffee Spot',detail:'100 Alpha Street, Berkeley',lat:37.87,lon:-122.2701},{name:'Coffee Spot',detail:'200 Other Street, Berkeley',lat:37.9,lon:-122.3}]:[]}});
 });
 await page.locator('#originSearch').fill('Coffee Spot');
 await page.locator('#originSuggestions button').filter({hasText:'100 Alpha Street'}).click();
 await page.locator('#place').fill('Beta transfer');await page.locator('#destinationSuggestions button').first().click();
 await page.locator('#autoFind').click();await expect(page.locator('.route-choice').first()).toContainText('Bus 51B');
 expect(await page.evaluate(()=>selectedPlaces.originSearch.lon)).toBe(-122.2701);
 expect(errors).toEqual([]);
});
test('a disconnected exact stop retries nearby opposite-direction stops',async({page})=>{
 const errors=await setup(page);
 const expanded=JSON.parse(JSON.stringify(network));expanded.stops.a2=stop('a2','Alpha opposite side',-122.2702);expanded.stops.b2=stop('b2','Beta opposite side',-122.2602);
 expanded.patterns.push({route:'6',direction:'1',headsign:'Alpha',stops:['b2','a2'],sample_trip:'reverse'});
 await page.route('**/api/network',route=>route.fulfill({json:expanded}));await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#originSearch').fill('Beta transfer');await page.locator('#originSuggestions button').first().click();
 await page.locator('#place').fill('Alpha boarding');await page.locator('#destinationSuggestions button').first().click();
 await page.locator('#autoFind').click();await expect(page.locator('#autoResults')).toContainText('Checking nearby stops');
 await expect(page.locator('.route-choice').first()).toContainText('Bus 6');
 await page.locator('.route-choice').first().click();await expect(page.locator('#navSteps')).toContainText('Beta opposite side');
 expect(errors).toEqual([]);
});
test('geocoder outage can recover with a map pin instead of a dead-end error',async({page})=>{
 const errors=await setup(page);await page.route('**/api/places?*',route=>route.fulfill({status:502,json:{error:'Provider down'}}));
 await page.locator('#place').fill('Local business');
 await expect(page.locator('#destinationSuggestions')).toContainText('choose the exact location');
 await page.locator('#destinationSuggestions button').filter({hasText:'map'}).click();
 await expect(page.locator('#map')).toBeVisible();await page.locator('#map').click({position:{x:140,y:140}});
 await expect(page.locator('#place')).toHaveValue('Map-selected destination');
 expect(await page.evaluate(()=>Number.isFinite(selectedPlaces.place.lat))).toBe(true);expect(errors).toEqual([]);
});
test('map-led planner moves the same map through tabs and preserves visible controls',async({page})=>{
 const errors=await setup(page);await expect(page.locator('#planMapHost #map')).toBeVisible();
 await plan(page);await expect(page.locator('#guideMapHost #map')).toBeVisible();
 await page.locator('#appMap').click();await expect(page.locator('#map')).toBeVisible();
 await page.locator('#appTrips').click();await expect(page.locator('#planMapHost #map')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:test.info().outputPath('map-led-planner.png'),fullPage:true});expect(errors).toEqual([]);
});

for(const denied of [false,true])test('trip start automatically requests GPS and remains usable '+(denied?'when denied':'when granted'),async({page})=>{
 await page.addInitScript(denied=>{
  window.gpsCalls={started:0,cleared:0};
  Object.defineProperty(navigator,'geolocation',{value:{
   watchPosition(success,error){window.gpsCalls.started++;if(denied)setTimeout(()=>error({message:'Permission denied'}),0);return 7;},
   clearWatch(){window.gpsCalls.cleared++;}
  },configurable:true});
 },denied);
 const errors=await setup(page);await plan(page);
 await page.locator('#guideStartTrip').click();
 await expect.poll(()=>page.evaluate(()=>window.gpsCalls.started)).toBe(1);
 await expect(page.locator('#guideFinishTrip')).toBeVisible();
 if(denied){await expect(page.locator('#navStatus')).toContainText('Location tracking stopped');await expect(page.locator('#navStart')).toBeEnabled();}
 else {await expect(page.locator('#navStop')).toBeEnabled();await page.evaluate(()=>document.getElementById('startJourney').click());expect(await page.evaluate(()=>window.gpsCalls.started)).toBe(1);}
 await page.locator('#guideFinishTrip').click();await expect(page.locator('#tripComplete')).toBeVisible();
 expect(await page.evaluate(()=>window.gpsCalls.cleared)).toBe(1);expect(errors).toEqual([]);
});

for(const transfer of [false,true])for(const minutes of [5,60])test('walking comparison '+(transfer?'transfer':'direct')+' '+minutes+' minutes',async({page})=>{
 const errors=await setup(page),now=Date.now();
 await page.route('**/api/walk-route?*',route=>route.fulfill({json:{available:true,minutes,meters:minutes*70,source:'OpenRouteService foot-walking',geometry:{type:'LineString',coordinates:[[-122.27,37.87],[-122.26,37.87]]}}}));
 await page.route('**/api/scheduled-journey?*',route=>{
  const second=new URL(route.request().url()).searchParams.get('trip')==='two';
  return route.fulfill({json:{trips:[{departure:new Date(now+(second?30:10)*60000).toISOString(),arrival:new Date(now+(second?40:20)*60000).toISOString()}]}});
 });
 await plan(page,transfer?'Gamma destination':'Beta transfer');
 await page.locator('#appTrips').click();
 const card=page.locator('.walking-option');if(minutes===60){await expect(card).not.toBeVisible();await page.locator('.long-walk-option summary').click();}await expect(card).toBeVisible();
 await expect(card.locator('h3')).toHaveText(minutes===5?'Walking looks faster':'Long walk · optional');
 await expect(card).toContainText('Fastest checked bus:');
 if(minutes===5)await expect(page.locator('[data-route-heading]')).toContainText('Bus alternatives');
 if(minutes===5&&!transfer)await page.screenshot({path:test.info().outputPath('walking-first.png'),fullPage:true});
 const link=card.getByRole('link',{name:'Open walking directions ↗'});
 await expect(link).toHaveAttribute('href',/travelmode=walking/);
 await expect(link).toHaveAttribute('href',/origin=37.87%2C-122.27/);
 await card.getByRole('button',{name:'See walking route'}).click();
 await expect(page.locator('#mapText')).toContainText('Direct pedestrian route');
 await expect(page.locator('#map')).toBeVisible();expect(errors).toEqual([]);
});

test('Home shortcut restores exact stops across reload and clears stale selections',async({page})=>{
 const errors=await setup(page);await plan(page);await page.locator('#appTrips').click();
 await page.getByRole('button',{name:'Save current trip as Home',exact:true}).click();
 await expect(page.locator('.everyday-trips [role=status]')).toContainText('Home saved');
 await page.locator('#originSearch').fill('Gamma destination');await page.locator('#place').fill('Alpha boarding');
 await page.getByRole('button',{name:'Open Home',exact:true}).click();
 await expect(page.locator('#originSearch')).toHaveValue('Alpha boarding');await expect(page.locator('#place')).toHaveValue('Beta transfer');
 expect(await page.evaluate(()=>window.wldCaptureSearch().stopIds)).toEqual({originSearch:'a',place:'b'});
 await page.reload({waitUntil:'domcontentloaded'});await expect(page.locator('#message')).toContainText('AC Transit data loaded');
 await page.getByRole('button',{name:'Open Home',exact:true}).click();
 expect(await page.evaluate(()=>window.wldCaptureSearch().stopIds)).toEqual({originSearch:'a',place:'b'});
 await page.locator('#autoFind').click();await expect(page.locator('.route-choice')).toContainText('51B');expect(errors).toEqual([]);
});

test('Find another way preserves the active trip until a replacement is selected',async({page})=>{
 const errors=await setup(page);await plan(page,'Gamma destination');await page.locator('#guideStartTrip').click();
 await page.locator('#navAdvance').click();const progress=await page.evaluate(()=>activeNavigation.progress);
 await page.locator('#tripRecoveryActions > summary').click();await page.getByRole('button',{name:'I missed my transfer',exact:true}).click();
 await expect(page.locator('#originSearch')).toHaveValue('');await expect(page.locator('#place')).toHaveValue('Gamma destination');
 await expect(page.locator('.recovery-guidance')).toContainText('Choose where you are now');
 expect(await page.evaluate(()=>Boolean(journey))).toBe(true);expect(await page.evaluate(()=>activeNavigation.progress)).toBe(progress);
 await page.getByRole('button',{name:'Return to current trip'}).click();await expect(page.locator('#guideFinishTrip')).toBeVisible();
 await page.locator('#appTrips').click();await plan(page);
 await expect(page.locator('#guideStartTrip')).toBeVisible();expect(await page.evaluate(()=>Boolean(journey))).toBe(false);expect(errors).toEqual([]);
});

test('door-to-door comparison separates walking waiting riding and transfers',async({page})=>{
 const errors=await setup(page),now=Date.now();
 await page.route('**/api/scheduled-journey?*',route=>{
  const second=new URL(route.request().url()).searchParams.get('trip')==='two';
  return route.fulfill({json:{trips:[{departure:new Date(now+(second?30:10)*60000).toISOString(),arrival:new Date(now+(second?40:20)*60000).toISOString()}]}});
 });
 await plan(page,'Gamma destination');await page.locator('#appTrips').click();
 const comparison=page.locator('.route-choice .journey-comparison');await expect(comparison).toContainText('Total');await expect(comparison).toContainText('Wait');await expect(comparison).toContainText('Ride');await expect(comparison).toContainText('Transfers1');
 await page.screenshot({path:test.info().outputPath('everyday-comparison.png'),fullPage:true});
 await page.locator('#appGuide').click();await expect(page.locator('#navNext')).toBeVisible();
 await expect(page.locator('.trip-timing-detail')).not.toHaveAttribute('open','');
 await page.screenshot({path:test.info().outputPath('everyday-guide.png'),fullPage:true});expect(errors).toEqual([]);
});

test('GPS map follows smoothly preserves zoom and resumes after browsing',async({page})=>{
 await page.addInitScript(()=>{window.gpsCallbacks=[];window.gpsCleared=[];Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition(ok,fail){window.gpsCallbacks.push({ok,fail});return window.gpsCallbacks.length;},clearWatch(id){window.gpsCleared.push(id);}}});});
 const errors=await setup(page);await plan(page);await page.locator('#guideStartTrip').click();
 const fix=async(lat,lon,accuracy=8)=>page.evaluate(({lat,lon,accuracy})=>window.gpsCallbacks[0].ok({coords:{latitude:lat,longitude:lon,accuracy},timestamp:Date.now()}),{lat,lon,accuracy});
 await fix(37.871,-122.269);await expect(page.locator('#mapFollow')).toHaveAttribute('aria-pressed','true');
 await expect.poll(()=>page.evaluate(()=>Math.abs(routeMap.getCenter().lat-37.871))).toBeLessThan(.0001);
 await page.evaluate(()=>routeMap.setZoom(18,{animate:false}));await fix(37.872,-122.268);
 expect(await page.evaluate(()=>routeMap.getZoom())).toBe(18);
 await page.evaluate(()=>{routeMap.fire('dragstart');routeMap.setView([37.86,-122.28],15,{animate:false});focusSelectedTripMap();});
 await fix(37.873,-122.267);await expect(page.locator('#mapFollow')).toHaveAttribute('aria-pressed','false');
 expect(await page.evaluate(()=>routeMap.getCenter().lat)).toBeCloseTo(37.86,3);
 await page.locator('#mapFollow').click();await expect.poll(()=>page.evaluate(()=>Math.abs(routeMap.getCenter().lat-37.873))).toBeLessThan(.0001);
 await page.locator('#appMap').click();await page.locator('#appGuide').click();
 await expect.poll(()=>page.evaluate(()=>Math.abs(routeMap.getCenter().lat-37.873))).toBeLessThan(.0001);
 await page.locator('#appTrips').click();await page.locator('#place').fill('New destination');expect(await page.evaluate(()=>mapFollowing)).toBe(false);expect(await page.evaluate(()=>gpsWatchId)).toBe(1);await page.locator('#appGuide').click();
 const before=await page.evaluate(()=>locationPoint.lat);await page.locator('#guideFinishTrip').click();await fix(38,-122.2);
 expect(await page.evaluate(()=>locationPoint.lat)).toBe(before);expect(await page.evaluate(()=>window.gpsCleared)).toEqual([1]);expect(errors).toEqual([]);
});

test('a throwing GPS provider keeps trip finish and location retry usable',async({page})=>{
 await page.addInitScript(()=>{Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition(){throw Error('Unavailable')},clearWatch(){}}});});
 const errors=await setup(page);await plan(page);await page.locator('#guideStartTrip').click();
 await expect(page.locator('#navStatus')).toContainText('Location tracking unavailable');
 await expect(page.locator('#navStart')).toBeEnabled();await page.locator('#guideFinishTrip').click();await expect(page.locator('#tripComplete')).toBeVisible();expect(errors).toEqual([]);
});

for(const stale of [false,true])test('current location keeps the real walking origin '+(stale?'and rejects stale fixes':'instead of snapping to a stop'),async({page})=>{
 await page.addInitScript(stale=>Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(ok){setTimeout(()=>ok({coords:{latitude:37.8706,longitude:-122.271,accuracy:10},timestamp:Date.now()-(stale?180000:0)}),0)},clearWatch(){}}}),stale);
 const errors=await setup(page);await expect(page.locator('#message')).toContainText('AC Transit data loaded');
 await page.locator('.location-shortcut').filter({hasText:'Use my location'}).click();
 if(stale){await expect(page.locator('#locationText')).toContainText('outdated');await expect(page.locator('#originSearch')).toHaveValue('');}
 else {await expect(page.locator('#originSearch')).toHaveValue('Current location');expect(await page.evaluate(()=>walkingEndpoint('originSearch').lat)).toBe(37.8706);expect(await page.evaluate(()=>walkingEndpoint('originSearch').lon)).toBe(-122.271);}
 expect(errors).toEqual([]);
});

test('Map explores served stops and selects exact start and destination without losing an active trip',async({page})=>{
 const errors=await setup(page);await plan(page);await page.locator('#guideStartTrip').click();
 await page.locator('#appMap').click();await expect(page.locator('#mapExplorer')).toBeVisible();
 await expect(page.locator('#mapStopList')).toContainText('Alpha boarding');await expect(page.locator('#mapStopList')).toContainText('Buses 51B');
 await page.locator('#mapStopList [data-stop-id="c"][data-stop-target="place"]').click();
 await expect(page.locator('#place')).toHaveValue('Gamma destination');expect(await page.evaluate(()=>window.wldCaptureSearch().stopIds.place)).toBe('c');
 expect(await page.evaluate(()=>Boolean(journey))).toBe(true);
 await page.locator('#appMap').click();await page.locator('#mapStopList [data-stop-id="b"][data-stop-target="originSearch"]').click();
 await expect(page.locator('#originSearch')).toHaveValue('Beta transfer');expect(await page.evaluate(()=>window.wldCaptureSearch().stopIds.originSearch)).toBe('b');
 await page.locator('#appGuide').click();await expect(page.locator('#guideFinishTrip')).toBeVisible();
 await expect(page.locator('#mapExplorer')).toBeHidden();expect(errors).toEqual([]);
});

test('Map search refreshes after panning and handles areas without stops',async({page})=>{
 const errors=await setup(page);await expect(page.locator('#message')).toContainText('AC Transit data loaded');await page.locator('#appMap').click();await expect(page.locator('#mapStopList .map-stop')).toHaveCount(3);
 await page.evaluate(()=>routeMap.setView([38.2,-122.8],13,{animate:false}));await page.locator('#searchMapArea').click();
 await expect(page.locator('#mapExplorerStatus')).toContainText('No served AC Transit stops');await expect(page.locator('#mapStopList .map-stop')).toHaveCount(0);
 await page.getByRole('button',{name:'Back to Berkeley',exact:true}).click();await expect(page.locator('#mapStopList .map-stop')).toHaveCount(3);await expect.poll(()=>page.evaluate(()=>Math.abs(routeMap.getCenter().lng+122.2585))).toBeLessThan(.001);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:test.info().outputPath('map-explorer.png'),fullPage:true});expect(errors).toEqual([]);
});

test('Map keeps its searched area and exact stop actions across repeated Plan transitions',async({page})=>{
 const errors=await setup(page);await expect(page.locator('#message')).toContainText('AC Transit data loaded');
 await page.locator('#appMap').click();await expect(page.locator('#mapStopList .map-stop')).toHaveCount(3);
 const center=await page.evaluate(()=>({lat:routeMap.getCenter().lat,lng:routeMap.getCenter().lng}));
 await page.locator('#mapStopList [data-stop-id="a"][data-stop-target="originSearch"]').click();
 await page.locator('#appMap').click();await expect(page.locator('#mapStopList .map-stop')).toHaveCount(3);
 await expect.poll(()=>page.evaluate(lng=>Math.abs(routeMap.getCenter().lng-lng),center.lng)).toBeLessThan(.002);
 await page.locator('#mapStopList [data-stop-id="c"][data-stop-target="place"]').click();await expect(page.locator('#place')).toHaveValue('Gamma destination');
 await page.locator('#appMap').click();await expect(page.locator('#mapStopList .map-stop')).toHaveCount(3);
 expect(await page.evaluate(lng=>Math.abs(routeMap.getCenter().lng-lng),center.lng)).toBeLessThan(.002);
 expect(errors).toEqual([]);
});

for(const mode of ['leave','arrive'])test('future '+mode+' search sends timezone and shows leave guidance',async({page})=>{
 const errors=await setup(page);const anchor=Date.now()+120*60000,requests=[];
 await page.locator('#tripWhen').selectOption(mode);
 const d=new Date(anchor);await page.locator('#tripDateTime').fill(new Date(d-d.getTimezoneOffset()*60000).toISOString().slice(0,16));
 await page.route('**/api/scheduled-journey?*',route=>{const q=new URL(route.request().url()).searchParams;requests.push({at:q.get('at'),mode:q.get('mode')});const base=Date.parse(q.get('at'));return route.fulfill({json:{trips:[{departure:new Date(base+(mode==='arrive'?-30:10)*60000).toISOString(),arrival:new Date(base+(mode==='arrive'?-10:30)*60000).toISOString(),ride_minutes:20}]}});});
 await plan(page);await expect(page.locator('#commuteLeave')).toContainText('Leave in');expect(requests.length).toBeGreaterThan(0);expect(requests.every(r=>r.at?.endsWith('Z')&&r.mode===(mode==='arrive'?'arrive':'depart'))).toBe(true);expect(errors).toEqual([]);
});
test('40 minute walk stays optional even when the bus takes longer',async({page})=>{
 await setup(page);await page.route('**/api/walk-route?*',r=>r.fulfill({json:{available:true,minutes:40,meters:3000,geometry:{type:'LineString',coordinates:[[-122.27,37.87],[-122.26,37.87]]}}}));
 const n=Date.now();await page.route('**/api/scheduled-journey?*',r=>r.fulfill({json:{trips:[{departure:new Date(n+60*60000).toISOString(),arrival:new Date(n+90*60000).toISOString()}]}}));
 await plan(page);await page.locator('#appTrips').click();await expect(page.locator('.long-walk-option summary')).toContainText('40-minute');await expect(page.locator('.walking-option')).not.toBeVisible();await expect(page.getByText('Walking looks faster',{exact:true})).toHaveCount(0);
});
test('step free requests wheelchair paths and marks missing accessibility data',async({page})=>{
 await setup(page);const profiles=[];await page.route('**/api/walk-route?*',r=>{profiles.push(new URL(r.request().url()).searchParams.get('profile'));return r.fulfill({json:{available:true,minutes:5,meters:300}});});
 await page.locator('.commute-options summary').click();await page.locator('#stepFree').check();await plan(page);await page.locator('#appTrips').click();await expect(page.locator('.access-note').first()).toContainText('not fully reported');expect(profiles.length).toBeGreaterThan(0);expect(profiles.every(p=>p==='wheelchair')).toBe(true);
});
test('get off reminder needs boarded trip and fresh accurate GPS',async({page})=>{
 await setup(page);await plan(page);await page.locator('#guideStartTrip').click();
 await page.evaluate(()=>{activeNavigation.progress=activeNavigation.steps.findIndex(s=>s.kind==='ride');renderNavigation();updateNavigationPosition(37.87,-122.26,80);});await expect(page.locator('#getOffAlert')).not.toBeVisible();
 await page.evaluate(()=>updateNavigationPosition(37.87,-122.26,5,Date.now()-60000));await expect(page.locator('#getOffAlert')).not.toBeVisible();
 await page.evaluate(()=>updateNavigationPosition(37.87,-122.26,5));await expect(page.locator('#getOffAlert')).toContainText('Get ready to get off');
 expect(await page.evaluate(()=>activeNavigation.steps[activeNavigation.progress].kind)).toBe('ride');
});

test('reopening an active trip respects the saved reminder preference',async({page})=>{
 await setup(page);await page.locator('.commute-options summary').click();await page.locator('#getOffReminders').uncheck();await plan(page);await page.locator('#guideStartTrip').click();
 await page.reload({waitUntil:'domcontentloaded'});await expect(page.locator('#guideTripFeedback')).toContainText('restored');
 expect(await page.evaluate(()=>activeNavigation.plan.reminders)).toBe(false);
 await page.evaluate(()=>{activeNavigation.progress=activeNavigation.steps.findIndex(s=>s.kind==='ride');renderNavigation();updateNavigationPosition(37.87,-122.26,5);});await expect(page.locator('#getOffAlert')).not.toBeVisible();
});

test('nearby departures are on demand, bounded and reused between refreshes',async({page})=>{
 const errors=await setup(page);let calls=0;await page.route('**/api/arrivals?*',r=>{calls++;return r.fulfill({json:{arrivals:[{route:'51B',destination:'Beta',aimed:new Date(Date.now()+600000).toISOString(),expected:new Date(Date.now()+660000).toISOString(),recorded:new Date().toISOString()}]}});});
 expect(calls).toBe(0);await page.locator('#nearbyDepartures summary').click();await page.locator('#nearbyRefresh').click();await expect(page.locator('#nearbyStatus')).toContainText('Choose your starting point');expect(calls).toBe(0);
 await page.locator('#originSearch').fill('Alpha boarding');await page.locator('#originSuggestions button').first().click();await page.locator('#nearbyRefresh').click();await expect(page.locator('#nearbyResults')).toContainText('Live prediction');expect(calls).toBeGreaterThan(0);expect(calls).toBeLessThanOrEqual(3);const count=calls;
 await page.locator('#nearbyRefresh').click();await expect(page.locator('#nearbyRefresh')).toBeEnabled();expect(calls).toBe(count);await expect(page.locator('#nearbyResults')).toContainText('Vehicle reported');
 await page.screenshot({path:test.info().outputPath('nearby-departures.png'),fullPage:true});expect(errors).toEqual([]);
});
test('nearby departure source ages to schedule only and becomes unavailable offline',async({page,context})=>{
 await page.clock.install();await setup(page);await page.route('**/api/arrivals?*',r=>r.fulfill({json:{arrivals:[{route:'51B',destination:'Beta',aimed:new Date(Date.now()+20*60000).toISOString(),expected:new Date(Date.now()+21*60000).toISOString(),recorded:new Date(Date.now()-4*60000).toISOString()}]}}));
 await page.locator('#originSearch').fill('Alpha boarding');await page.locator('#originSuggestions button').first().click();await page.locator('#nearbyDepartures summary').click();await page.locator('#nearbyRefresh').click();await expect(page.locator('#nearbyResults')).toContainText('Live prediction');await page.clock.fastForward(2*60000);await expect(page.locator('#nearbyResults')).toContainText('Published schedule');await expect(page.locator('#nearbyResults')).not.toContainText('Live prediction');await context.setOffline(true);await expect(page.locator('#nearbyResults')).toContainText('Offline');
});
test('missed bus checks current departures and keeps selected trip and destination',async({page})=>{
 const errors=await setup(page);const now=Date.now();await page.route('**/api/scheduled-journey?*',r=>r.fulfill({json:{trips:[{departure:new Date(now+15*60000).toISOString(),arrival:new Date(now+30*60000).toISOString(),ride_minutes:15}]}}));
 await plan(page);await page.locator('#navAdvance').click();await page.locator('#guideStartTrip').click();const before=await page.evaluate(()=>({progress:activeNavigation.progress,started:Boolean(journey),destination:activeNavigation.search.destination}));
 await page.locator('#missedBus').click();await expect(page.locator('#missedBusResults .route-choice')).toHaveCount(1);await expect(page.locator('#missedBusStatus')).toContainText('Select an option');expect(await page.evaluate(()=>({progress:activeNavigation.progress,started:Boolean(journey),destination:activeNavigation.search.destination}))).toEqual(before);await expect(page.locator('#place')).toHaveValue('Beta transfer');await expect(page.locator('#tripWhen')).toHaveValue('now');expect(errors).toEqual([]);
});
test('missed transfer recovery starts at the next boarding stop and preserves the final destination',async({page})=>{
 await setup(page);await plan(page,'Gamma destination');await page.evaluate(()=>{activeNavigation.progress=activeNavigation.steps.findIndex(s=>s.kind==='board'&&s.legIndex===1);renderNavigation();});await page.locator('#missedBus').click();await expect(page.locator('#missedBusStatus')).toContainText('Results checked from Beta transfer to Gamma destination');expect(await page.evaluate(()=>selectedStopIds)).toEqual({originSearch:'b',place:'c'});expect(await page.evaluate(()=>activeNavigation.legs.length)).toBe(2);
});
test('arrival confidence is visible before tracking and never labels a schedule live',async({page,context})=>{
 await setup(page,false);const now=Date.now();await page.route('**/api/scheduled-journey?*',r=>r.fulfill({json:{trips:[{departure:new Date(now+10*60000).toISOString(),arrival:new Date(now+20*60000).toISOString()}]}}));await plan(page);await expect(page.locator('#arrivalConfidence')).toContainText('Published schedule');await expect(page.locator('#arrivalConfidence')).toHaveAttribute('data-confidence','scheduled');await context.setOffline(true);await expect(page.locator('#arrivalConfidence')).toContainText('Offline');await expect(page.locator('#arrivalConfidence')).toHaveAttribute('data-confidence','unavailable');
});
test('feedback saves locally, restores safely, and prepares a public issue without GPS',async({page})=>{
 const errors=await setup(page);await plan(page);await page.locator('#tripFeedback summary').click();await page.locator('#saveFeedback').click();await expect(page.locator('#feedbackStatus')).toContainText('Describe what happened');await page.locator('#feedbackCategory').selectOption('walking');await page.locator('#feedbackMessage').fill('<script>alert(1)</script> Sidewalk is closed.');await page.locator('#saveFeedback').click();await expect(page.locator('#feedbackStatus')).toContainText('Not sent');await expect(page.locator('#feedbackPreview')).toContainText('<script>alert(1)</script>');
 const url=new URL(await page.locator('#feedbackIssue').getAttribute('href'));expect(url.origin).toBe('https://github.com');const report=await page.evaluate(()=>JSON.parse(localStorage.getItem('wld-feedback-v1'))[0]);expect(Object.keys(report).sort()).toEqual(['category','created','message','routes','stops','version']);expect(url.searchParams.get('body')).not.toContain('37.87');expect(url.searchParams.get('body')).not.toContain('-122.');
 await page.reload({waitUntil:'domcontentloaded'});await page.locator('#appGuide').click();await page.locator('#tripFeedback summary').click();await expect(page.locator('#feedbackPreview')).toContainText('Sidewalk is closed');await expect(page.locator('#feedbackStatus')).toContainText('Not sent');expect(errors).toEqual([]);
});
test('planning feedback and the real-phone checklist work without a selected trip',async({page})=>{
 await setup(page);await page.getByRole('button',{name:'Report a planning problem',exact:true}).click();await expect(page.locator('#feedbackMessage')).toBeVisible();await page.locator('#phoneRideCheck summary').click();await expect(page.locator('#phoneRideCheck')).toContainText('browser tests cannot verify');expect(await page.locator('#phoneRideCheck input[type=checkbox]').count()).toBe(5);await page.locator('#phoneRideCheck input').first().check();await expect(page.locator('#phoneRideCheck input').first()).toBeChecked();
});

test('missed bus preserves the resolved destination when stop names match opposite sides',async({page})=>{
 await setup(page);const expanded=JSON.parse(JSON.stringify(network));expanded.stops.b2=stop('b2','Beta transfer',-122.2605);expanded.patterns=[{...expanded.patterns[0],stops:['a','b2']}];
 await page.route('**/api/network',r=>r.fulfill({json:expanded}));await page.reload({waitUntil:'domcontentloaded'});await expect(page.locator('#message')).toContainText('AC Transit data loaded');
 await page.locator('#originSearch').fill('Alpha boarding');await page.locator('#originSuggestions button').first().click();await page.locator('#place').fill('Beta transfer');await page.locator('#autoFind').click();await page.locator('.route-choice').first().click();
 expect(await page.evaluate(()=>activeNavigation.search.stopIds.place)).toBe('b');await page.locator('#missedBus').click();await expect(page.locator('#missedBusStatus')).toContainText('Results checked');await expect(page.locator('#missedBusResults .route-choice').first()).toContainText('Direct');expect(await page.evaluate(()=>selectedStopIds.place)).toBe('b');expect(await page.evaluate(()=>walkingEndpoint('place').lon)).toBe(-122.26);
});

for(const code of [2,3])test('current location retries precise accuracy after provider error '+code,async({page})=>{
 await page.addInitScript(code=>{window.locationOptions=[];Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(ok,fail,options){window.locationOptions.push(options);setTimeout(()=>!options.enableHighAccuracy?fail({code}):ok({coords:{latitude:37.8706,longitude:-122.271,accuracy:80},timestamp:Date.now()}),0);}}});},code);
 const errors=await setup(page);await page.locator('.location-shortcut').filter({hasText:'Use my location'}).click();await expect(page.locator('#originSearch')).toHaveValue('Current location');expect(await page.evaluate(()=>window.locationOptions.map(o=>[o.enableHighAccuracy,o.maximumAge]))).toEqual([[false,0],[true,0]]);await expect(page.locator('#locate')).toBeEnabled();expect(errors).toEqual([]);
});
test('denied location does not retry and exposes permission help and map recovery',async({page})=>{
 await page.addInitScript(()=>{window.locationCalls=0;Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(ok,fail){window.locationCalls++;setTimeout(()=>fail({code:1}),0);}}});});
 const errors=await setup(page);await page.locator('.location-shortcut').filter({hasText:'Use my location'}).click();await expect(page.locator('#locationText')).toContainText('permission denied');expect(await page.evaluate(()=>window.locationCalls)).toBe(1);await expect(page.locator('#locationHelp')).toBeVisible();await page.locator('#locationHelp summary').click();await expect(page.locator('#locationHelp')).toContainText('Safari');await page.locator('#locationHelpMap').click();await expect(page.locator('#mapText')).toContainText('Tap the map');expect(errors).toEqual([]);
});
test('unavailable location retries once then keeps the existing starting point',async({page})=>{
 await page.addInitScript(()=>{window.locationCalls=0;Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(ok,fail){window.locationCalls++;setTimeout(()=>fail({code:2}),0);}}});});
 const errors=await setup(page);await page.locator('#originSearch').fill('Beta transfer');await page.locator('#originSuggestions button').first().click();await page.locator('.location-shortcut').filter({hasText:'Use my location'}).click();await expect(page.locator('#locationHelp')).toBeVisible();await expect(page.locator('#originSearch')).toHaveValue('Beta transfer');expect(await page.evaluate(()=>window.locationCalls)).toBe(2);await expect(page.locator('#locate')).toBeEnabled();expect(errors).toEqual([]);
});
test('very broad position requires map confirmation rather than choosing the wrong stop',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(ok){setTimeout(()=>ok({coords:{latitude:37.8706,longitude:-122.271,accuracy:8000},timestamp:Date.now()}),0);}}}));
 await setup(page);await page.locator('.location-shortcut').filter({hasText:'Use my location'}).click();await expect(page.locator('#locationHelp')).toBeVisible();await expect(page.locator('#originSearch')).toHaveValue('');await page.locator('#locationHelpMap').click();await expect(page.locator('#mapText')).toContainText('Tap the map');expect(await page.evaluate(()=>selectedStopIds.originSearch)).toBe(null);
});
test('manual origin selection wins over a late location callback',async({page})=>{
 await page.addInitScript(()=>{window.pendingLocation=[];Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(ok){window.pendingLocation.push(ok);}}});});
 await setup(page);await page.locator('.location-shortcut').filter({hasText:'Use my location'}).click();await page.locator('#originSearch').fill('Beta transfer');await page.locator('#originSuggestions button').first().click();await page.evaluate(()=>window.pendingLocation[0]({coords:{latitude:37.87,longitude:-122.27,accuracy:5},timestamp:Date.now()}));await expect(page.locator('#originSearch')).toHaveValue('Beta transfer');await expect(page.locator('#locate')).toBeEnabled();
});

test('manual origin is kept when GPS resolves before a slow transit download',async({page})=>{
 let release;const ready=new Promise(resolve=>release=resolve);
 await page.addInitScript(()=>Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(ok){setTimeout(()=>ok({coords:{latitude:37.87,longitude:-122.27,accuracy:5},timestamp:Date.now()}),0);}}}));
 await setup(page,false,ready);await page.locator('.location-shortcut').filter({hasText:'Use my location'}).click();await expect(page.locator('#originSearch')).toHaveValue('Current location');await page.locator('#originSearch').fill('Beta transfer');release();await expect(page.locator('#message')).toContainText('AC Transit data loaded');await expect(page.locator('#originSearch')).toHaveValue('Beta transfer');
});

async function openAssignmentDemo(page){if(await page.locator('.onboarding-overlay').isVisible())await page.locator('.onboarding-panel').getByRole('button',{name:'Close',exact:true}).click();if(!(await page.locator('#assignmentDemo').isVisible()))await page.locator('#appTrips').click();await page.getByRole('button',{name:'Assignment demo',exact:true}).click();await expect(page.locator('#assignmentDemoDialog')).toBeVisible();}
test('small assignment demo opens without GPS and completes with separate replayable points',async({page})=>{
 await page.addInitScript(()=>{window.demoGpsCalls=0;Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(){window.demoGpsCalls++},watchPosition(){window.demoGpsCalls++},clearWatch(){}}});});
 const errors=await setup(page);await page.screenshot({path:test.info().outputPath('assignment-demo-entry.png'),fullPage:false});const before=await page.evaluate(()=>({points:localStorage.getItem('wld-berkeley-points'),history:localStorage.getItem('wld-berkeley-reward-history')}));await openAssignmentDemo(page);
 await expect(page.locator('#assignmentDemoDialog')).toContainText('Simulation · not live transit');await expect(page.locator('#demoPoints')).toHaveText('0');await page.locator('#demoDelay').click();await expect(page.locator('#demoRewardNote')).toContainText('100 demo points');await page.locator('#demoJump').selectOption('5');await page.locator('#demoSkip').click();await page.locator('#demoCollect').click();await expect(page.locator('#demoCompletion')).toContainText('100 fictional points');await expect(page.locator('#demoCollect')).toBeDisabled();expect(await page.evaluate(()=>window.demoGpsCalls)).toBe(0);
 expect(await page.evaluate(()=>({points:localStorage.getItem('wld-berkeley-points'),history:localStorage.getItem('wld-berkeley-reward-history')}))).toEqual(before);
 await page.locator('#demoReset').click();await expect(page.locator('#demoPoints')).toHaveText('0');await expect(page.locator('#demoStep')).toContainText('Step 1');await expect(page.locator('#demoCollect')).toBeDisabled();await page.locator('#demoClose').click();await expect(page.locator('#assignmentDemoDialog')).not.toBeVisible();await expect(page.locator('#assignmentDemo')).toBeFocused();expect(errors).toEqual([]);
});
test('assignment transfer demo supports jumps, pause, speed and a moving bus',async({page})=>{
 const errors=await setup(page);await openAssignmentDemo(page);await page.locator('#demoScenario').selectOption('transfer');await page.locator('#demoJump').selectOption('4');await page.locator('#demoSkip').click();await expect(page.locator('#demoStep')).toContainText('Get off and walk');await page.locator('#demoJump').selectOption('6');await page.locator('#demoSkip').click();const start=await page.locator('#demoBus').getAttribute('transform');await page.locator('#demoSpeed').selectOption('12');await expect(page.locator('#demoSpeed')).toHaveValue('12');await page.locator('#demoSpeed').selectOption('4');await page.locator('#demoPlay').click();await expect.poll(()=>page.locator('#demoBus').getAttribute('transform')).not.toBe(start);await page.locator('#demoPlay').click();await expect(page.locator('#demoPlay')).toHaveText('Play simulation');const paused=await page.locator('#demoBus').getAttribute('transform');await page.waitForTimeout(150);expect(await page.locator('#demoBus').getAttribute('transform')).toBe(paused);
 await expect(page.locator('#demoClose')).toBeInViewport();await expect(page.locator('.demo-label')).toBeInViewport();await page.screenshot({path:test.info().outputPath('assignment-demo-transfer.png'),fullPage:true});await page.locator('#demoNext').click();await expect(page.locator('#demoStep')).toContainText('Arrive');await page.locator('#demoCollect').click();await expect(page.locator('#demoPoints')).toHaveText('50');expect(errors).toEqual([]);
});
test('assignment demo keeps an active real trip intact and pauses when closed',async({page})=>{
 const errors=await setup(page);await plan(page);await page.locator('#guideStartTrip').click();const before=await page.evaluate(()=>({legs:activeNavigation.legs,progress:activeNavigation.progress,started:journey.started}));await openAssignmentDemo(page);await page.locator('#demoPlay').click();await page.keyboard.press('Escape');await expect(page.locator('#assignmentDemoDialog')).not.toBeVisible();expect(await page.evaluate(()=>({legs:activeNavigation.legs,progress:activeNavigation.progress,started:journey.started}))).toEqual(before);await openAssignmentDemo(page);await expect(page.locator('#demoPlay')).toHaveText('Play simulation');await page.locator('#demoClose').click();await page.locator('#appGuide').click();await expect(page.locator('#guideFinishTrip')).toBeVisible();expect(errors).toEqual([]);
});
test('assignment simulation runs when transit APIs and map scripts are unavailable',async({page})=>{
 await page.route('**/api/**',r=>r.fulfill({status:503,json:{error:'Offline fixture'}}));await page.route('**/unpkg.com/**',r=>r.abort());await page.goto('/',{waitUntil:'domcontentloaded'});await openAssignmentDemo(page);await expect(page.locator('.demo-map')).toBeVisible();await page.locator('#demoJump').selectOption('5');await page.locator('#demoSkip').click();await page.locator('#demoCollect').click();await expect(page.locator('#demoCompletion')).toContainText('50 fictional points');
});

 test('current location accepts a recent accurate cached standard fix without waiting for GPS',async({page})=>{
 await page.addInitScript(()=>{window.locationOptions=[];Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(ok,fail,options){window.locationOptions.push(options);setTimeout(()=>ok({coords:{latitude:37.8706,longitude:-122.271,accuracy:80},timestamp:Date.now()-20000}),0);}}});});
 await setup(page);await page.locator('.location-shortcut').filter({hasText:'Use my location'}).click();await expect(page.locator('#originSearch')).toHaveValue('Current location');expect(await page.evaluate(()=>window.locationOptions.map(o=>[o.enableHighAccuracy,o.maximumAge]))).toEqual([[false,0]]);
 });
 test('hung standard location advances to precise GPS and ignores a late first callback',async({page})=>{
 await page.addInitScript(()=>{window.locationOptions=[];window.firstLocation=null;Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(ok,fail,options){window.locationOptions.push(options);if(!options.enableHighAccuracy)window.firstLocation=ok;else setTimeout(()=>ok({coords:{latitude:37.8706,longitude:-122.271,accuracy:15},timestamp:Date.now()}),0);}}});});
 await setup(page);await page.locator('.location-shortcut').filter({hasText:'Use my location'}).click();await expect(page.locator('#originSearch')).toHaveValue('Current location');await page.evaluate(()=>window.firstLocation({coords:{latitude:37.87,longitude:-122.26,accuracy:10},timestamp:Date.now()}));await expect(page.locator('#originSearch')).toHaveValue('Current location');expect(await page.evaluate(()=>window.locationOptions.map(o=>o.enableHighAccuracy))).toEqual([false,true]);
 });

test('one click applies approximate location directly with an accuracy warning',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(ok){setTimeout(()=>ok({coords:{latitude:37.8706,longitude:-122.271,accuracy:800},timestamp:Date.now()}),0);}}}));
 await setup(page);await page.locator('.location-shortcut').filter({hasText:'Use my location'}).click();await expect(page.locator('#originSearch')).toHaveValue('Current location');await expect(page.locator('#locationText')).toContainText('800 m');expect(await page.evaluate(()=>walkingEndpoint('originSearch').lat)).toBe(37.8706);
});
test('standard approximate fix works without requiring the precise provider',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(ok,fail,options){setTimeout(()=>options.enableHighAccuracy?fail({code:3}):ok({coords:{latitude:37.8706,longitude:-122.271,accuracy:900},timestamp:Date.now()}),0);}}}));
 await setup(page);await page.locator('.location-shortcut').filter({hasText:'Use my location'}).click();await expect(page.locator('#originSearch')).toHaveValue('Current location');await expect(page.locator('#locationText')).toContainText('900 m');
});

test('demo points redeem for cafes charity and BART without changing regular rewards',async({page})=>{
 const errors=await setup(page);const before=await page.evaluate(()=>JSON.stringify(localStorage));await openAssignmentDemo(page);await page.locator('#demoDelay').click();
 await page.locator('#demoJump').selectOption('5');await page.locator('#demoSkip').click();await page.locator('#demoCollect').click();await page.locator('#demoRedeemTab').click();await expect(page.locator('#demoRidePanel')).not.toBeVisible();await expect(page.locator('#demoPoints')).toHaveText('100');await expect(page.locator('#demoRedeem-bart')).toBeDisabled();
 await page.locator('#demoRedeem-cafe').click();await page.locator('#demoCancelRedeem').click();await expect(page.locator('#demoPoints')).toHaveText('100');await expect(page.locator('#demoRedeemConfirm')).not.toBeVisible();
 await page.locator('#demoRedeem-cafe').click();await page.locator('#demoConfirmRedeem').click();await expect(page.locator('#demoPoints')).toHaveText('40');await expect(page.locator('#demoRedeemStatus')).toContainText('No real voucher');await expect(page.locator('#demoRedeem-cafe')).toBeDisabled();await page.evaluate(()=>document.getElementById('demoConfirmRedeem').click());await expect(page.locator('#demoPoints')).toHaveText('40');
 await page.locator('#demoLoadPoints').click();await expect(page.locator('#demoPoints')).toHaveText('240');for(const id of ['charity','bart']){await page.locator('#demoRedeem-'+id).click();await page.locator('#demoConfirmRedeem').click();}await expect(page.locator('#demoPoints')).toHaveText('60');await expect(page.locator('#demoRedemptionHistory li')).toHaveCount(3);await expect(page.locator('#demoRedeemPanel')).toContainText('not partner offers');await expect(page.locator('#demoRedeemPanel')).toBeInViewport();await page.screenshot({path:test.info().outputPath('demo-redeem.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(await page.evaluate(()=>JSON.stringify(localStorage))).toBe(before);await page.locator('#demoClose').click();await openAssignmentDemo(page);await expect(page.locator('#demoPoints')).toHaveText('60');await page.locator('#demoRideTab').click();await expect(page.locator('#demoCompletion')).toContainText('100 fictional points collected');await page.locator('#demoReset').click();await page.locator('#demoRedeemTab').click();await expect(page.locator('#demoPoints')).toHaveText('0');await expect(page.locator('#demoRedemptionHistory')).toContainText('No demo redemptions');expect(errors).toEqual([]);
});
test('sample balance and ride earnings add together and switching to redeem pauses playback',async({page})=>{
 await setup(page);await openAssignmentDemo(page);await page.locator('#demoPlay').click();await page.locator('#demoRedeemTab').click();await page.locator('#demoLoadPoints').click();await page.locator('#demoRideTab').click();await expect(page.locator('#demoPlay')).toHaveText('Play simulation');await page.locator('#demoJump').selectOption('5');await page.locator('#demoSkip').click();await page.locator('#demoCollect').click();await expect(page.locator('#demoPoints')).toHaveText('250');await expect(page.locator('#demoCollect')).toBeDisabled();await page.locator('#demoScenario').selectOption('transfer');await expect(page.locator('#demoPoints')).toHaveText('0');
});

async function enableTransitFixture(page,response){
 await page.route('**/api/transit-plan?**',r=>r.fulfill({json:response}));
 await page.evaluate(()=>window.wldTransitConfigured=true);
}
function transitFixture(){
 const fixture=JSON.parse(JSON.stringify(require('./fixtures/transit-response.json'))),shift=Math.floor(Date.now()/1000)-2000000000+120;
 fixture.fetched=Math.floor(Date.now()/1000);for(const p of fixture.results){p.start_time+=shift;p.end_time+=shift;for(const l of p.legs){l.start_time+=shift;l.end_time+=shift;}}return fixture;
}
test('Transit transfer plan uses Guide start finish and accurate provider times',async({page})=>{
 const errors=await setup(page);await enableTransitFixture(page,transitFixture());await page.locator('#originSearch').fill('Alpha boarding');await page.locator('#place').fill('Gamma destination');await page.locator('#autoFind').click();await expect(page.locator('.transit-route-choice')).toHaveCount(1);await expect(page.locator('.transit-route-choice')).toContainText('18 min');await expect(page.locator('.transit-route-details')).not.toHaveAttribute('open','');await page.locator('.transit-route-details summary').click();await expect(page.locator('.transit-route-details')).toContainText('Walk');await expect(page.locator('.transit-route-choice')).toContainText('1 transfer');await page.locator('.transit-route-choice').click();await expect(page.locator('#navSteps')).toContainText('Continue to the bus stop');await expect(page.locator('#navSteps')).toContainText('Live estimate:');await expect(page.locator('#commuteLeave')).toContainText('Transit plan');await page.locator('#guideStartTrip').click();await expect(page.locator('#guideFinishTrip')).toBeVisible();await page.locator('#guideFinishTrip').click();await expect(page.locator('#tripComplete')).toBeVisible();await expect(page.locator('#points')).toHaveText('0');expect(errors).toEqual([]);
});
test('Transit failure falls back to 511 without dropping chosen places',async({page})=>{
 const errors=await setup(page);await enableTransitFixture(page,{available:false,reason:'Transit request allowance reached.'});await plan(page);await expect(page.locator('#autoResults')).toContainText('Transit request allowance reached');await expect(page.locator('#originSearch')).toHaveValue('Alpha boarding');await expect(page.locator('#guideStartTrip')).toBeEnabled();expect(errors).toEqual([]);
});
test('Transit request forwards departure walking and accessibility preferences',async({page})=>{
 await setup(page);await enableTransitFixture(page,transitFixture());let query;await page.route('**/api/transit-plan?**',r=>{query=new URL(r.request().url()).searchParams;return r.fulfill({json:transitFixture()});});
 await page.locator('#originSearch').fill('Alpha boarding');await page.locator('#place').fill('Gamma destination');await page.locator('.focus-fold summary').filter({hasText:'Trip options'}).click();await page.locator('#maxWalking').selectOption('5');await page.locator('#stepFree').check();await page.locator('#autoFind').click();await expect(page.locator('.transit-route-choice')).toBeVisible();expect(query.get('max_walk')).toBe('5');expect(query.get('step_free')).toBe('true');expect(query.get('mode')).toBe('now');
});
test('Transit offers 511 comparison and ignores late results after input changes',async({page})=>{
 await setup(page);await enableTransitFixture(page,transitFixture());await page.locator('#originSearch').fill('Alpha boarding');await page.locator('#place').fill('Gamma destination');await page.locator('#autoFind').click();await page.getByRole('button',{name:'Compare 511 alternatives',exact:true}).click();await expect(page.locator('#autoResults .route-choice').first()).not.toHaveClass(/transit-route-choice/);
 let release;const waiting=new Promise(r=>release=r);await page.route('**/api/transit-plan?**',async r=>{await waiting;await r.fulfill({json:transitFixture()});});await page.locator('#autoFind').click();await expect(page.locator('#autoResults')).toContainText('Finding routes');await page.locator('#place').fill('Different destination');release();await expect(page.locator('#autoResults')).toContainText('changed');await expect(page.locator('.transit-route-choice')).toHaveCount(0);
});

test('first launch tutorial has three concise screens and stays dismissed after reload',async({page})=>{
 await setup(page,true,Promise.resolve(),false);await expect(page.locator('.onboarding-overlay')).toBeVisible();await expect(page.locator('.onboarding-panel h2')).toHaveText('Track your route');await page.locator('.onboarding-panel .btn').filter({hasText:'Next'}).click();await expect(page.locator('.onboarding-panel h2')).toHaveText('Earn delay points');await page.locator('.onboarding-panel .btn').filter({hasText:'Next'}).click();await expect(page.locator('.onboarding-panel h2')).toHaveText('Explore rewards');await page.getByRole('button',{name:'Get started',exact:true}).click();await page.reload({waitUntil:'domcontentloaded'});await expect(page.locator('.onboarding-overlay')).not.toBeVisible();
});
test('Houston device location biases place suggestions and city override replaces its cache',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(ok){ok({coords:{latitude:29.7604,longitude:-95.3698,accuracy:20},timestamp:Date.now()});}}}));await setup(page);await page.locator('.location-shortcut').filter({hasText:'Use my location'}).click();let query;await page.route('**/api/places?**',r=>{query=new URL(r.request().url()).searchParams;return r.fulfill({json:{places:[{name:'Houston Cafe',detail:'Houston, Texas',lat:29.76,lon:-95.37}]}});});await page.locator('#place').fill('cafe');await expect(page.locator('#destinationSuggestions')).toContainText('Houston Cafe');expect(query.get('lat')).toBe('29.760');expect(query.get('lon')).toBe('-95.370');await page.locator('.search-area-settings summary').click();await page.locator('#searchArea').fill('Houston, TX');await page.locator('#applySearchArea').click();await expect.poll(()=>query.get('area')).toBe('Houston, TX');expect(query.has('lat')).toBe(false);await page.locator('#destinationSuggestions button').filter({hasText:'Houston Cafe'}).click();await page.locator('#autoFind').click();await expect(page.locator('#autoResults')).toContainText('No bus journey is available');await expect(page.getByRole('link',{name:'Open Google Maps'})).toBeVisible();
});
test('reward progress prospective partners and honest impact calculator work',async({page})=>{
 await setup(page);await page.locator('#appRewards').click();await expect(page.locator('#rewardProgress')).toHaveAttribute('value','0');await expect(page.locator('#nextRewardRemaining')).toContainText('60 more');await page.locator('#openPartners').click();await expect(page.locator('#partnersDialog')).toContainText('Kash Café');await expect(page.locator('#partnersDialog')).toContainText('Sharetea');await expect(page.locator('#partnersDialog')).toContainText('not confirmed');await expect(page.locator('#partnersDialog')).toContainText('$10 / month');await page.locator('#closePartners').click();await page.locator('#appTrips').click();await plan(page);await page.locator('#guideStartTrip').click();await page.locator('#guideFinishTrip').click();await page.locator('#tripViewRewards').click();await expect(page.locator('#impactOffer')).toBeVisible();await page.locator('#saveImpact').click();await expect(page.locator('#impactStatus')).toContainText('Confirm');await page.locator('#impactReplacedDriving').check();await page.locator('#saveImpact').click();await expect(page.locator('#impactValue')).not.toHaveText('0.00 kg');const value=await page.locator('#impactValue').textContent();await page.evaluate(()=>document.getElementById('saveImpact').click());await expect(page.locator('#impactValue')).toHaveText(value);await page.locator('#openVisualTour').click();await page.screenshot({path:test.info().outputPath('feedback-wallet-highlights.png'),fullPage:true});
});
test('demo redemption applies 60 point pricing and 600 point monthly presentation cap',async({page})=>{
 await setup(page);await openAssignmentDemo(page);await page.locator('#demoRedeemTab').click();for(let i=0;i<4;i++)await page.locator('#demoLoadPoints').click();for(let i=0;i<5;i++){await page.locator('#demoRedeem-bart').click();await page.locator('#demoConfirmRedeem').click();}await expect(page.locator('#demoPoints')).toHaveText('200');await expect(page.locator('#demoMonthlyCap')).toContainText('600 / 600');await expect(page.locator('#demoRedeem-cafe')).toBeDisabled();await expect(page.locator('#demoRedeem-bart')).toBeDisabled();await expect(page.locator('#demoRedeem-bart')).toHaveText('Monthly demo cap reached');
});
test('live line activity is opt in and demo crowd count is labeled simulated',async({page})=>{
 let posts=[];await setup(page);await page.route('**/api/riders**',async r=>{if(r.request().method()==='POST')posts.push(r.request().postDataJSON());await r.fulfill({json:{count:posts.at(-1)?.active?1:0}});});await plan(page);await expect(page.locator('#lineRiderCount')).toContainText('0 active');await page.locator('#guideStartTrip').click();expect(posts).toEqual([]);await page.locator('#shareLineActivity').check();await expect(page.locator('#lineRiderCount')).toContainText('1 active');expect(Object.keys(posts[0]).sort()).toEqual(['active','route','token']);await page.locator('#guideFinishTrip').click();await expect.poll(()=>posts.at(-1)?.active).toBe(false);await openAssignmentDemo(page);await expect(page.locator('#demoRidePanel')).toContainText('simulated count');
});

test('changing search area preserves selected places and stop choices',async({page})=>{
 await setup(page);await plan(page);await page.locator('#appTrips').click();const before=await page.evaluate(()=>window.wldCaptureSearch());
 await page.locator('.search-area-settings summary').click();await page.locator('#searchArea').fill('Houston, TX');await page.locator('#applySearchArea').click();
 expect(await page.evaluate(()=>window.wldCaptureSearch())).toEqual(before);await page.locator('#resetSearchArea').click();await page.locator('#autoFind').click();await expect(page.locator('.route-choice').first()).toBeVisible();
});
test('GPS selection survives an outstanding origin lookup and local context refresh',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(ok){ok({coords:{latitude:37.87,longitude:-122.27,accuracy:20},timestamp:Date.now()});}}}));
 await setup(page);let release;const wait=new Promise(r=>release=r);let requested=false;await page.route('**/api/places?**',async r=>{requested=true;await wait;await r.fulfill({json:{places:[]}});});
 await page.locator('#originSearch').fill('old text');await expect.poll(()=>requested).toBe(true);await page.locator('.location-shortcut').filter({hasText:'Use my location'}).click();release();
 await expect(page.locator('#originSearch')).toHaveValue('Current location');await expect(page.locator('#originSuggestions')).toBeEmpty();expect(await page.evaluate(()=>window.wldCaptureSearch().places.originSearch.lat)).toBe(37.87);
 await page.locator('#place').fill('Beta transfer');await page.locator('#destinationSuggestions button').first().click();await page.locator('#autoFind').click();await expect(page.locator('.route-choice').first()).toBeVisible();
});
test('outside-region GPS remains coordinates instead of geocoding Current location',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(ok){ok({coords:{latitude:29.7604,longitude:-95.3698,accuracy:20},timestamp:Date.now()});}}}));
 await setup(page);const terms=[];await page.route('**/api/places?**',r=>{terms.push(new URL(r.request().url()).searchParams.get('q'));return r.fulfill({json:{places:[]}});});
 await page.locator('.location-shortcut').filter({hasText:'Use my location'}).click();await expect(page.locator('#originSearch')).toHaveValue('Current location');
 await page.locator('#place').fill('cafe');await expect(page.locator('#destinationSuggestions')).toContainText('No nearby places');await expect(page.locator('#originSuggestions')).toBeEmpty();expect(terms).not.toContain('current location');
 expect(await page.evaluate(()=>window.wldCaptureSearch().places.originSearch)).toMatchObject({lat:29.7604,lon:-95.3698});
});

test('map location sets a visible coordinate origin before the network loads',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(ok){ok({coords:{latitude:37.8706,longitude:-122.271,accuracy:20},timestamp:Date.now()});}}}));
 let release;const waiting=new Promise(r=>release=r);await setup(page,true,waiting);await page.locator('#appMap').click();await page.locator('#mapFollow').click();await expect(page.locator('#originSearch')).toHaveValue('Current location');
 expect(await page.evaluate(()=>window.wldCaptureSearch().places.originSearch)).toMatchObject({lat:37.8706,lon:-122.271});release();await expect(page.locator('#message')).toContainText('AC Transit data loaded');await expect(page.locator('#originSearch')).toHaveValue('Current location');
});
test('Use my location reuses the blue dot and sends that origin to Transit',async({page})=>{
 await setup(page);await plan(page);await page.locator('#appTrips').click();
 await page.evaluate(()=>updateNavigationPosition(37.8706,-122.271,20,Date.now()));
 await page.evaluate(()=>Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(){throw Error('must reuse known fix');}}}));
 await page.locator('.location-shortcut').filter({hasText:'Use my location'}).click();await expect(page.locator('#originSearch')).toHaveValue('Current location');
 await enableTransitFixture(page,transitFixture());let query;await page.route('**/api/transit-plan?**',r=>{query=new URL(r.request().url()).searchParams;return r.fulfill({json:transitFixture()});});
 await page.locator('#autoFind').click();await expect.poll(()=>query?.get('from_lat')).toBe('37.8706');expect(query.get('from_lon')).toBe('-122.271');
 await page.evaluate(()=>document.getElementById('clearLoc').click());await expect(page.locator('#originSearch')).toHaveValue('');
});

for(const city of [{name:'Houston',lat:29.7604,lon:-95.3698},{name:'New York',lat:40.7128,lon:-74.006},{name:'Honolulu',lat:21.3099,lon:-157.8581}])test('national bus planning starts and finishes in '+city.name,async({page})=>{
 await setup(page);const data=transitFixture();for(const item of data.results)for(const leg of item.legs)if(leg.mode==='bus'){leg.network_id='Local|'+city.name;leg.route='6';leg.route_id='Other:6';for(const [i,stop] of leg.stops.entries()){stop.lat=city.lat+i*.001;stop.lon=city.lon+i*.001;}}
 await enableTransitFixture(page,data);await page.evaluate(city=>{selectSearchPlace('originSearch',{name:city.name+' origin',lat:city.lat,lon:city.lon});selectSearchPlace('place',{name:city.name+' destination',lat:city.lat+.01,lon:city.lon+.01});},city);
 await page.locator('#autoFind').click();await expect(page.locator('.transit-route-choice')).toHaveCount(1);await page.locator('.transit-route-choice').click();expect(await page.evaluate(()=>activeNavigation.legs.every(l=>!l.p.rewardTrackingVerified))).toBe(true);await page.locator('#guideStartTrip').click();await page.locator('#guideFinishTrip').click();await expect(page.locator('#tripComplete')).toBeVisible();await expect(page.locator('#points')).toHaveText('0');
});

test('classmate feedback keeps partner access visible and detailed wallet rules expandable',async({page})=>{
 await setup(page);await page.locator('#plannerPartners').click();await expect(page.locator('#partnersDialog')).toBeVisible();await expect(page.locator('#partnersDialog')).toContainText('Kash Café');await page.locator('#closePartners').click();await expect(page.locator('#plannerPartners')).toBeFocused();
 await page.locator('#appRewards').click();await expect(page.locator('#rewardRules')).not.toHaveAttribute('open','');await page.locator('#rewardRules summary').click();await expect(page.locator('#rewardRules')).toContainText('5-minute grace');await expect(page.locator('#rewardRules')).toContainText('not implemented account limits');await expect(page.locator('#rewardProgress')).toHaveAttribute('max','60');
});

test('Bakersfield empty plans show explicit recovery and retry only with chosen walking limit',async({page})=>{
 await setup(page);const limits=[];await enableTransitFixture(page,{available:true,results:[],empty_reason:'walking_limit'});await page.route('**/api/transit-plan?**',r=>{const q=new URL(r.request().url()).searchParams;limits.push(q.get('max_walk'));return r.fulfill({json:limits.length===1?{available:true,results:[],empty_reason:'walking_limit'}:transitFixture()});});
 await page.evaluate(()=>{selectSearchPlace('originSearch',{name:'Foothill High School',lat:35.366,lon:-118.917});selectSearchPlace('place',{name:'Valley Plaza Mall',lat:35.33753,lon:-119.033756});});
 await page.locator('#autoFind').click();await expect(page.locator('#autoResults')).toContainText('within your walking limit');await expect(page.locator('#autoResults')).not.toContainText('Checking available alternatives');await expect(page.locator('#autoResults')).toContainText('Foothill High School → Valley Plaza Mall');expect(limits).toEqual(['15']);await page.getByRole('button',{name:'Try up to 30 min walking',exact:true}).click();await expect(page.locator('.transit-route-choice')).toHaveCount(1);expect(limits).toEqual(['15','30']);
});

test('moving GPS queues a new route and rejects a stale Current location result',async({page})=>{
 await setup(page);await enableTransitFixture(page,transitFixture());let release;const hold=new Promise(r=>release=r);const origins=[];
 await page.route('**/api/transit-plan?**',async r=>{origins.push(new URL(r.request().url()).searchParams.get('from_lon'));if(origins.length===1)await hold;await r.fulfill({json:transitFixture()});});
 await page.evaluate(()=>{selectSearchPlace('place',{name:'Valley Plaza',lat:35.33753,lon:-119.033756});applyStartingCoordinates(35.366,-118.917,'Device location',20,Date.now());});
 await expect.poll(()=>origins.length).toBe(1);await page.evaluate(()=>applyStartingCoordinates(35.365,-118.919,'Device location',20,Date.now()));release();await expect.poll(()=>origins.length).toBe(2);expect(origins).toEqual(['-118.917','-118.919']);await expect(page.locator('.transit-route-choice')).toHaveCount(1);
});
test('Use my location requests fresh GPS instead of reusing a two-minute-old blue dot',async({page})=>{
 await setup(page);await page.evaluate(()=>{locationPoint={lat:35.366,lon:-118.917,accuracy:20,timestamp:Date.now()-60000};Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(ok,fail,options){window.newGpsOptions=options;ok({coords:{latitude:35.365,longitude:-118.919,accuracy:15},timestamp:Date.now()});}}});});
 await page.locator('.location-shortcut').filter({hasText:'Use my location'}).click();expect(await page.evaluate(()=>window.wldCaptureSearch().places.originSearch.lon)).toBe(-118.919);expect(await page.evaluate(()=>window.newGpsOptions.maximumAge)).toBe(0);
});

test('a longer-walk bus option is offered without silently raising the walking limit',async({page})=>{
 await setup(page);const data=transitFixture();data.results[0].walk_minutes=16;await enableTransitFixture(page,{available:true,results:[],empty_reason:'walking_limit',walking_options:data.results});await page.evaluate(()=>{selectSearchPlace('originSearch',{name:'Current location',lat:35.366,lon:-118.917});selectSearchPlace('place',{name:'Valley Plaza',lat:35.33753,lon:-119.033756});});
 await page.locator('#autoFind').click();await expect(page.locator('#autoResults')).toContainText('above your 15 min limit');await expect(page.locator('#maxWalking')).toHaveValue('15');await page.locator('#extraWalkingOptions summary').click();await expect(page.locator('.transit-route-choice')).toContainText('Walk 16 min');await page.locator('.transit-route-choice').click();await expect(page.locator('#guideStartTrip')).toBeVisible();await expect(page.locator('#maxWalking')).toHaveValue('15');
});

for(const type of [{mode:'metro',label:'BART'},{mode:'train',label:'Train'},{mode:'tram',label:'Tram'},{mode:'ferry',label:'Ferry'}])test('multimodal trip uses '+type.label+' labels and completes without bus rewards',async({page})=>{
 await setup(page);const data=transitFixture();if(type.mode==='metro'){for(const item of data.results){item.legs=item.legs.slice(0,3);item.end_time=item.legs.at(-1).end_time;item.duration=item.end_time-item.start_time;item.walk_minutes=4;}}for(const item of data.results)for(const leg of item.legs)if(leg.mode==='bus'){leg.mode=type.mode;leg.mode_label=type.label;leg.route='Yellow';leg.route_id='BART:Yellow';}
 await enableTransitFixture(page,data);await page.locator('#originSearch').fill('Alpha boarding');await page.locator('#place').fill('Gamma destination');await page.locator('#autoFind').click();await expect(page.locator('.transit-route-choice')).toContainText(type.label+' Yellow');await expect(page.locator('.transit-route-choice')).not.toContainText('Bus Yellow');await page.locator('.transit-route-choice').click();await expect(page.locator('#navSteps')).toContainText('Board '+type.label+' Yellow');await expect(page.locator('#arrivalConfidence')).toContainText('Arrival estimate');expect(await page.evaluate(()=>activeNavigation.legs.every(l=>!l.p.rewardTrackingVerified))).toBe(true);await page.locator('#guideStartTrip').click();if(type.mode==='metro'){await page.reload({waitUntil:'domcontentloaded'});await expect(page.locator('#navSteps')).toContainText('BART Yellow');}await page.locator('#guideFinishTrip').click();await expect(page.locator('#tripComplete')).toBeVisible();await expect(page.locator('#points')).toHaveText('0');
});
test('mixed bus and BART transfers keep every mode in the guide',async({page})=>{
 await setup(page);const data=transitFixture();const legs=data.results[0].legs.filter(l=>l.mode==='bus');legs[1].mode='metro';legs[1].mode_label='BART';legs[1].route='Orange';legs[1].route_id='BART:Orange';await enableTransitFixture(page,data);await page.locator('#originSearch').fill('Alpha boarding');await page.locator('#place').fill('Gamma destination');await page.locator('#autoFind').click();await expect(page.locator('.transit-route-choice')).toContainText('Bus 51B → BART Orange');await page.locator('.transit-route-choice').click();await expect(page.locator('#navSteps')).toContainText('Board Bus 51B');await expect(page.locator('#navSteps')).toContainText('Board BART Orange');await page.locator('#guideStartTrip').click();await page.reload({waitUntil:'domcontentloaded'});await expect(page.locator('#guideContent')).toBeVisible();await expect(page.locator('#navSteps')).toContainText('BART Orange');
});
