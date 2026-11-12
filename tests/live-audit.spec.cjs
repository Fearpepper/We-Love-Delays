const {test,expect}=require('@playwright/test');
test.describe.configure({retries:0});
test.use({baseURL:'https://we-love-delays.onrender.com',serviceWorkers:'block'});
test('live 511 route, guide, completion and wallet',async({page})=>{
 page.setDefaultTimeout(20000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/',{timeout:120000,waitUntil:'domcontentloaded'});
 await expect(page.locator('#feedStatus')).toContainText('connected',{timeout:90000});
 await expect(page.locator('#message')).toContainText('AC Transit data loaded',{timeout:60000});
 await page.locator('#originSearch').fill('Downtown Berkeley');
 await page.locator('#originSuggestions button').filter({hasText:'Center St & Shattuck Av'}).first().click();
 await page.locator('#place').fill('University Av & Grant St');
 // Keep both directions of this named stop eligible; choose the direct route below.
 await page.locator('#autoFind').click();
 await page.locator('.route-choice').filter({hasText:'· Direct'}).first().click();
 await expect(page.locator('#guideContent')).toBeVisible();
 await page.locator('#navAdvance').click();
 await page.locator('#guideStartTrip').click();
 await expect(page.locator('#guideFinishTrip')).toBeVisible();
 await page.locator('#guideFinishTrip').click();
 await expect(page.locator('#tripComplete')).toBeVisible();
 await page.locator('#tripViewRewards').click();
 await expect(page.locator('#points')).toBeVisible();
 await expect(page.locator('#points')).toHaveText(/^\d+$/);
 await page.screenshot({path:test.info().outputPath('live-wallet.png'),fullPage:true});
 expect(errors).toEqual([]);
});

test('live ORS pedestrian endpoint reports traceable route data when configured',async({request})=>{
 const query=new URLSearchParams({from_lat:'37.8715',from_lon:'-122.2585',to_lat:'37.8705',to_lon:'-122.2630'});
 const response=await request.get('/api/walk-route?'+query,{timeout:90000});
 if(!response.ok()){
  const payload=await response.json().catch(()=>({}));
  console.warn('Live ORS unavailable ('+response.status()+'): '+String(payload.error||'No details').slice(0,160));
  test.skip(true,'ORS is not available in the deployed Render environment');
 }
 const data=await response.json();
 expect(data.available).toBe(true);
 expect(data.source).toContain('OpenRouteService');
 expect(data.minutes).toBeGreaterThan(0);
 expect(data.meters).toBeGreaterThan(0);
 expect(data.geometry?.type).toBe('LineString');
 const coords=data.geometry.coordinates;
 expect(coords.length).toBeGreaterThan(1);
 // Bounding checks protect against coordinate-order reversals and unrelated paths.
 expect(coords[0][0]).toBeGreaterThan(-123);
 expect(coords[0][0]).toBeLessThan(-121);
 expect(coords[0][1]).toBeGreaterThan(37);
 expect(coords[0][1]).toBeLessThan(39);
});
