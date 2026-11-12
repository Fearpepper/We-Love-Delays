const { defineConfig, devices } = require('@playwright/test');
module.exports=defineConfig({
 testDir:'./tests',
 testMatch:['browser.spec.cjs','flows.spec.cjs'],
 timeout:120000,
 expect:{timeout:15000},
 retries:1,
 use:{
  ...((process.env.DEVICE==='mobile')?devices['iPhone 13']:{viewport:{width:1440,height:900}}),
  browserName:'chromium',
  ...(process.env.CHROMIUM_PATH?{launchOptions:{executablePath:process.env.CHROMIUM_PATH}}:{}),
  screenshot:'only-on-failure',
  trace:'retain-on-failure'
 },
 reporter:'line'
});
