const {test,expect}=require('@playwright/test');
test.use({baseURL:process.env.BASE_URL||'http://127.0.0.1:10000',serviceWorkers:'block'});
const stop=(id,name,lon)=>({id,name,code:id,lat:37.87,lon});
const network={routes:[{id:'51B',name:'51B'},{id:'6',name:'6'}],stops:{a:stop('a','Alpha boarding',-122.27),b:stop('b','Beta transfer',-122.26),c:stop('c','Gamma destination',-122.25)},patterns:[{route:'51B',direction:'0',headsign:'Beta',stops:['a','b'],sample_trip:'one'},{route:'6',direction:'0',headsign:'Gamma',stops:['b','c'],sample_trip:'two'}]};
async function setup(page,delayed=true){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  let data={};
  if(path==='/api/status')data={configured:true};
  if(path==='/api/network')data=network;
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
 await expect(page.locator('#guideTripFeedback')).toContainText(/Checking|Destination/);
 await expect(page.locator('#delayPreview')).toContainText('5 min late');
 await page.locator('#guideFinishTrip').click();
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
test('transfer is labeled accurately and unavailable tracking is disabled',async({page})=>{
 const errors=await setup(page);await plan(page,'Gamma destination');
 await expect(page.locator('#navTitle')).toHaveText('Transfer directions');
 await expect(page.locator('.route-result-badge').first()).toHaveText('1 transfer');
 await expect(page.locator('#guideStartTrip')).toBeDisabled();
 await expect(page.locator('#guideTripFeedback')).toContainText('tracking is unavailable');
 await page.locator('#appTrips').click();
 await expect(page.locator('#originSearch')).toBeVisible();
 expect(errors).toEqual([]);
});
