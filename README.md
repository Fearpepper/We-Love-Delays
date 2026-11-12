# We Love Delays — shareable Berkeley bus website

This is the Berkeley AC Transit app adapted for public web hosting. It uses Python's standard library, with no pip dependencies. The browser never receives your 511 API token.

## Deploy with Render (free tier where available)

1. Create a **private GitHub repository** and upload these four files (`index.html`, `server.py`, `render.yaml`, `README.md`) at the repository root. **Do not upload or paste your 511 token into any file.**
2. Sign in to https://dashboard.render.com and choose **New → Blueprint**. Connect the repository and select its `render.yaml`.
3. When Render requests `SF511_API_KEY`, paste your token into Render's secret environment variable field. Do not include quotation marks.
4. Deploy. Render provides a `*.onrender.com` URL you can share with teammates. The initial startup may be slow on free hosting.
5. Open `/api/status` at your website to confirm `configured: true`, then load the site and choose Live AC Transit. The status endpoint never reveals the token.

Alternative manual setup: create a Render **Web Service** from the repository, set runtime Python, build command `echo ready`, start command `python server.py`, and add environment variable `SF511_API_KEY` as a secret.

## What is live vs. prototype?

- AC Transit routes, stop sequences and schedules are from 511 GTFS static data when the API is available.
- Arrival estimates are from 511 StopMonitoring, and may be unavailable or delayed.
- Trip planning does **not** calculate address-to-address transit itineraries or transfers. Destination text and arrival deadline are notes only.
- Rewards and user-reported delays are **demo-only**, not agency submissions or redeemable offers.
- Geolocation requires user permission and HTTPS (provided by Render).
- The default 511 API quota is limited; the server caches GTFS for 12 hours and arrivals for 65 seconds, but many visitors/stops may still exhaust quota.
- Free hosting may sleep and restart; in-memory caches will reset. If 511 endpoints return errors, the UI can use demo mode.

## Security

The server reads the token only from `SF511_API_KEY`. Do not commit `.env` files, API tokens or credentials. Keep the repository private if possible. This prototype has no user accounts and is not designed for production-grade abuse protection. Public deployment means anyone with the link can trigger API requests through the app; watch your API quota.

## Local test (without the Mac .command file)

Run `SF511_API_KEY='your-token-here' python3 server.py` in a terminal and visit http://localhost:10000 . This shell command places the token in shell history, so for safer local entry use `read -s SF511_API_KEY; export SF511_API_KEY; python3 server.py` (press Enter after pasting the hidden token).

## Daily-use reliability

An active bus trip and step progress are saved in this browser for up to 12 hours. Reloading restores the bus portion of the route, requests fresh predictions, and leaves GPS following off. Device GPS coordinates and past delay predictions are not saved. Walking legs must be checked again. Finished or cancelled trips are removed from recovery storage; cancelling does not award points. Recovery requires browser storage and the application shell to be available; clearing browser data removes it.

Countdowns age every 15 seconds while the page is visible. Boarding arrivals refresh approximately every 70 seconds; resuming the app or reconnecting requests current data. Stale predictions become schedule-only information, and offline status is shown. Google Maps transit directions and official AC Transit alerts remain available from Guide. Map tiles and new walking routes need an internet connection.

This remains a student transit companion: real phone GPS and actual bus arrivals need field validation. Render's free plan may sleep; changing hosting or purchasing a paid transit/routing service is not included. Rewards are fictional and cannot be redeemed. Official service alerts are linked, not automatically integrated.
