const { test, expect } = require('@playwright/test');
const base = process.env.BASE_URL || 'https://we-love-delays.onrender.com';
test.use({ baseURL: base });
test('deployed app loads and exposes three primary actions', async ({ page }) => {
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const response=await page.goto('/',{waitUntil:'domcontentloaded',timeout:120000});
 expect(response?.ok()).toBeTruthy();
 await expect(page.locator('#appTrips')).toBeVisible();
 await expect(page.locator('#appGuide')).toBeVisible();
 await expect(page.locator('#appRewards')).toBeVisible();
 await expect(page.locator('#originSearch')).toBeVisible();
 await expect(page.locator('#place')).toBeVisible();
 await page.locator('#appGuide').click();
 await expect(page.locator('#guideScreen')).toBeVisible();
 await page.locator('#guidePlanTrip').click();
 await expect(page.locator('#originSearch')).toBeVisible();
 await page.locator('#appRewards').click();
 await expect(page.locator('#appRewards')).toHaveAttribute('aria-pressed','true');
 expect(errors).toEqual([]);
});
test('trip completion controls are reachable',async ({page})=>{
 await page.goto('/',{waitUntil:'domcontentloaded',timeout:120000});
 await page.locator('#appGuide').click();
 await expect(page.locator('#guideEmpty')).toBeVisible();
 await expect(page.locator('#guideStartTrip')).toHaveCount(1);
 await expect(page.locator('#guideFinishTrip')).toHaveCount(1);
 await expect(page.locator('#tripPlanAgain')).toHaveCount(1);
 await expect(page.locator('#tripViewRewards')).toHaveCount(1);
});
test('server responds to transit API without a browser crash',async ({request})=>{
 const r=await request.get('/api/arrivals?stop=invalid-test-stop',{timeout:120000});
 expect([200,400,404,422,502,503]).toContain(r.status());
});
