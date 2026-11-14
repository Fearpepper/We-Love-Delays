const {test,expect}=require('@playwright/test');
test.use({baseURL:process.env.BASE_URL||'http://127.0.0.1:10000',serviceWorkers:'block'});
const stop=(id,name,lon)=>({id,name,code:id,lat:37.87,lon});
const network={routes:[{id:'51B',name:'51B'},{id:'6',name:'6'}],stops:{a:stop('a','Alpha boarding',-122.27),b:stop('b','Beta transfer',-122.26),c:stop('c','Gamma destination',-122.25)},patterns:[{route:'51B',direction:'0',headsign:'Beta',stops:['a','b'],sample_trip:'one'},{route:'6',direction:'0',headsign:'Gamma',stops:['b','c'],sample_trip:'two'}]};
async function setup(page,delayed=true,networkReady=Promise.resolve()){
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

 await page.goto('/');
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
 await page.reload();await page.locator('#appRewards').click();
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
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/status',route=>route.fulfill({json:{configured:true}}));
 await page.route('**/api/network',route=>route.fulfill({status:503,json:{error:'Transit feed temporarily unavailable'}}));
 await page.goto('/');
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
 await page.reload();
 await expect(page.locator('#guideTripFeedback')).toContainText('Active bus trip restored');
 await expect(page.locator('#navNext')).toContainText('Wait for and board');
 await expect(page.locator('#guideFinishTrip')).toBeVisible();
 await expect(page.locator('#guideMapHost #map')).toBeVisible();
 await expect(page.locator('#livePointsValue')).toHaveText('0');
 await page.locator('#guideFinishTrip').click();
 await expect(page.locator('#tripComplete')).toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem('wld-active-trip-v1'))).toBeNull();
 await page.reload();await page.locator('#appGuide').click();
 await expect(page.locator('#guideEmpty')).toBeVisible();
 await page.locator('#appRewards').click();await expect(page.locator('#points')).toHaveText('0');
 expect(errors).toEqual([]);
});
test('saved transfer directions recover when the transit network is unavailable',async({page})=>{
 const errors=await setup(page);await plan(page,'Gamma destination');
 await page.locator('#guideStartTrip').click();
 await page.locator('#navAdvance').click();
 await page.route('**/api/network',route=>route.fulfill({status:503,json:{error:'Network unavailable'}}));
 await page.reload();
 await expect(page.locator('#feedStatus')).toContainText('Saved trip only');
 await expect(page.locator('#connectionStatus')).toContainText('Live transit data is unavailable');
 await expect(page.locator('#guideTripFeedback')).toContainText('Active bus trip restored');
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
 await page.reload();
 await expect(page.locator('#message')).toContainText('AC Transit data loaded');
 await expect(page.locator('#originSearch')).toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem('wld-active-trip-v1'))).toBeNull();
 await plan(page);await page.locator('#guideStartTrip').click();
 await page.evaluate(()=>{const key='wld-active-trip-v1',data=JSON.parse(localStorage.getItem(key));data.startedAt=Date.now()-13*3600000;localStorage.setItem(key,JSON.stringify(data));});
 // Avoid pagehide replacing the intentionally expired fixture.
 const expired=await page.evaluate(()=>localStorage.getItem('wld-active-trip-v1'));
 await page.context().addInitScript(value=>localStorage.setItem('wld-active-trip-v1',value),expired);
 await page.reload();
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
 await page.reload();
 await expect(page.locator('#guideFinishTrip')).toBeVisible();
 await expect(page.locator('#guideTripFeedback')).toContainText('Active bus trip restored');
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
 await page.reload();await plan(page);
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
 await page.reload();await plan(page);
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
 await page.reload();
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
 await page.reload();await page.locator('#appRewards').click();
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
 await page.reload();await plan(page);
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
 await page.reload();await plan(page);
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
 await expect(page.locator('#tripCompleteSummary')).toContainText('reported no delay');
 expect(errors).toEqual([]);
});
test('replanning an active trip gives visible origin guidance and preserves progress',async({page})=>{
 const errors=await setup(page);
 await page.route('**/api/alerts',route=>route.fulfill({json:{fetched:Math.floor(Date.now()/1000),alerts:[{id:'notice',title:'Check dates',effect:'DETOUR',selectors:[{route:'51B'}],periods:[]}]}}));
 await page.reload();await plan(page);await page.locator('#guideStartTrip').click();
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
 await page.route('**/api/network',route=>route.fulfill({json:expanded}));await page.reload();
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
 const card=page.locator('.walking-option');await expect(card).toBeVisible();
 await expect(card.locator('h3')).toHaveText(minutes===5?'Walking looks faster':'Walk directly');
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
