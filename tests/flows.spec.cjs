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
