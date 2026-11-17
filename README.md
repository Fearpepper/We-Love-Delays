# We Love Delays — shareable Berkeley bus website

This is the Berkeley AC Transit app adapted for public web hosting. It uses Python's standard library, with no pip dependencies. The browser never receives your 511 API token.

## Deploy with Render (free tier where available)

1. Create a **private GitHub repository** and upload the complete project, including `assets/`, `sw.js`, the manifest and server configuration. **Do not upload or paste your 511 token into any file.**
2. Sign in to https://dashboard.render.com and choose **New → Blueprint**. Connect the repository and select its `render.yaml`.
3. When Render requests `SF511_API_KEY`, paste your token into Render's secret environment variable field. Do not include quotation marks.
4. Deploy. Render provides a `*.onrender.com` URL you can share with teammates. The initial startup may be slow on free hosting.
5. Open `/api/status` at your website to confirm `configured: true`, then load the site and choose Live AC Transit. The status endpoint never reveals the token.

Alternative manual setup: create a Render **Web Service** from the repository, set runtime Python, build command `echo ready`, start command `python server.py`, and add environment variable `SF511_API_KEY` as a secret.

## What is live vs. prototype?

- AC Transit routes, stop sequences and schedules are from 511 GTFS static data when the API is available.
- Arrival estimates are from 511 StopMonitoring, and may be unavailable or delayed.
- Planning finds direct and one-transfer AC Transit stop-order options. Published departures and available OpenRouteService walking paths are used to check connection timing and arrival deadlines. Coverage is limited to the available patterns; results do not guarantee the fastest possible itinerary, accessibility or live transfer reliability.
- Prototype rewards use fresh destination delay predictions for supported direct trips; demo points remain separate. Points are not verified transit compensation or redeemable offers.
- Geolocation requires user permission and HTTPS (provided by Render).
- The default 511 API quota is limited; the server caches GTFS for 12 hours and arrivals for 120 seconds; concurrent identical requests share a single provider fetch, but many visitors/stops may still exhaust quota.
- Free hosting may sleep and restart; in-memory caches will reset. If 511 endpoints return errors, the UI can use demo mode.

## Security

The server reads the token only from `SF511_API_KEY`. Do not commit `.env` files, API tokens or credentials. Keep the repository private if possible. This prototype has no user accounts and is not designed for production-grade abuse protection. Public deployment means anyone with the link can trigger API requests through the app; watch your API quota.

## Local test (without the Mac .command file)

Run `SF511_API_KEY='your-token-here' python3 server.py` in a terminal and visit http://localhost:10000 . This shell command places the token in shell history, so for safer local entry use `read -s SF511_API_KEY; export SF511_API_KEY; python3 server.py` (press Enter after pasting the hidden token).

## Daily-use reliability

An active bus trip and step progress are saved in this browser for up to 12 hours. Reloading restores the bus portion of the route, requests fresh predictions, and leaves GPS following off. Device GPS coordinates and past delay predictions are not saved. Walking legs must be checked again. Finished or cancelled trips are removed from recovery storage; cancelling does not award points. Recovery requires browser storage and the application shell to be available; clearing browser data removes it.

Countdowns age every 15 seconds while the page is visible. Boarding arrivals refresh approximately every three minutes; destination predictions refresh approximately every 145 seconds; resuming the app or reconnecting requests current data. Stale predictions become schedule-only information, and offline status is shown. Google Maps transit directions and official AC Transit alerts remain available from Guide. Map tiles and new walking routes need an internet connection.

This remains a student transit companion: real phone GPS and actual bus arrivals need field validation. Render's free plan may sleep; changing hosting or purchasing a paid transit/routing service is not included. Rewards are fictional and cannot be redeemed. 511 service alerts are integrated with route, direction, stop and active-period filtering. The planner shows agency alerts and Guide shows matching notices. Alerts are checked at most every ten minutes while visible and retain source/check times and offline warnings. A missing or empty feed never guarantees normal service. Use the official alert link for details. Failed network downloads can be retried without reloading the page.


## Disruptions, transfers and saved app startup

The Guide automatically searches alternative AC Transit patterns before departure when a matching severe notice has a current machine-readable impact period. Undated notices show a review/search action instead. Alternatives avoid matching affected patterns, keep the current route selected, and check available walking paths and schedules. During an active trip, the rider must update their current starting stop in Plan; the app does not silently move an in-progress trip to another bus. This is not automatic in-vehicle rerouting or confirmation of normal service.

Transfer trips can earn prototype points from the final bus's fresh, uniquely matched destination prediction after the rider marks boarding that bus complete. Earlier-leg delays are not summed. Missing, stale, ambiguous, offline or unidentified predictions do not earn points. Recovery discards old predictions. Rewards remain fictional, nonredeemable points.

After one successful installation, the versioned app shell opens from cache without waiting for Render to wake. Live data still needs the server, and a first visit still needs hosting startup. No keep-alive service or paid plan is used. GPS diagnostics report blocked permissions, poor accuracy and outdated fixes without saving location history. Walking proximity can advance with a fresh accurate fix; boarding/alighting still require manual confirmation. Real phone and bus field validation remains necessary.

## Place search and nearby-stop recovery

Business and address lookup uses the configured OpenRouteService/Pelias API, with Photon as an independent fallback. Results retain street/locality information so riders can choose the correct branch. Successful queries are cached briefly and failed providers cool down before retrying. Public Nominatim autocomplete is no longer used. Search outages offer map-pin selection rather than requiring a stop name.

When an exact stop pair has no direct or one-transfer connection, the planner retries nearby stops within 500 m, including the opposite side of the street. Selected endpoint coordinates remain the walking origin/destination; actual pedestrian paths and published schedules are checked separately. This is limited AC Transit planning, not a guarantee of every possible regional connection.

The planner uses one interactive map behind a floating location form. The same map moves between Plan, Map and Guide to preserve controls and avoid duplicate map instances. Current-location and map-pin actions are exposed beside the search fields.

### Daily commute controls

Set Leave now, Leave at, or Arrive by before Find routes. Future times use the device timezone and support the next seven days, subject to the published GTFS service calendar. Arrive-by ranking prefers the latest feasible departure. Schedule-based leave guidance includes pedestrian estimates and a five-minute boarding buffer; it is not a live prediction.

Walking defaults to 15 minutes total across the journey, adjustable from 5 to 30 minutes. Direct walks over the preference or 20 minutes are collapsed optional alternatives and never promoted over buses. Step-free requests use the wheelchair pedestrian profile and published stop/vehicle accessibility flags. Explicit inaccessible flags exclude verified connections; unknown flags are labeled and require confirmation. Missing wheelchair paths never silently fall back to walking paths.

Get-off reminders appear in Guide only during an active ride, within 300 metres straight-line of the exit stop, using a GPS fix no older than 30 seconds with accuracy within 60 metres. One alert per bus leg; manually confirm alighting and transfers. Keep the app visible and GPS following enabled. Background, lock-screen, and real-phone reminder reliability require field testing. No location history or external notification permission is added.

### Everyday rider tools

Buses near your starting point requests arrivals only when asked, for up to three served stops within 1 km, with at most two concurrent requests. In-flight stop requests are shared; the browser keeps at most eight results for 45 seconds. The server's existing 120-second provider cache remains in use. Vehicle report timestamps determine whether a prediction is live, independently of fetch time. No continuous location polling or automatic arrival polling is added for nearby stops.

Guide distinguishes a fresh final-bus-stop prediction from a scheduled door-to-door arrival and unavailable data. Walking after the final bus is additional to its live stop prediction. Missed-bus recovery checks schedules from the selected origin/boarding stop, retains the destination, and preserves the active trip until a replacement is chosen. A ride in progress still needs an explicitly chosen current origin.

Feedback is bounded to ten reports on the device. Reports contain user-entered text, route IDs and public stop codes, with copy/download and a prefilled public GitHub issue link. Nothing is automatically submitted, and no GPS coordinates are attached. The rider must review personal details before publishing. Storage failure is reported and export remains available. See FIELD_TESTING.md and Before your first ride in Guide for manual phone checks; no real ride has been certified by automated testing.

### Location recovery

Use my location first requests a fresh high-accuracy fix, then retries once with standard accuracy after an unavailable/timeout error or an unusable fix. Each attempt has a 12-second timeout with a 28-second total watchdog. Permission denial is never retried automatically. Only fresh fixes with accuracy within 200 m select a starting stop; rougher estimates require a map-confirmed starting point. Existing origins remain unchanged on failure. Manual origin changes cancel the pending result, and old callbacks cannot replace a chosen stop. Error help includes Safari/device permission instructions, Retry location, and a map picker. Browser-provider/OS location failures still require device settings or manual selection; a website cannot switch on device location services.

### Assignment simulation

The small Demo button in the header opens a separate presentation dialog with sample direct/transfer trips, an illustrative animated SVG map, play/pause, speeds, next-step/jump controls, a five-minute sample delay with optional additions, and a demo-only completion/wallet. Timings, locations, route lines and delays are illustrative, not actual bus predictions or street navigation. The controller makes no transit or geolocation requests and writes no regular wallet, active-trip or browser-storage state. Closing or hiding the tab pauses playback. Reset/scenario change clears demo progress and points. After a first successful app installation the demo controller is included in the cached shell; a first visit still needs the website to load.
