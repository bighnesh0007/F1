# F1 Live roadmap

Status of the improvement plan. "Needs you" means the code is in place and only a key,
account or setting from the project owner is missing.

## Foundations

| Item | Status | Where / what's needed |
| --- | --- | --- |
| Test with real keys | **Needs you** | Add Clerk keys to `.env` (or the cloud environment) and allow the network hosts listed in the README; then sign up as the first user. |
| Automated tests | Done | `server/test` (node:test, 31 tests), `client/test` (vitest, 14 tests), GitHub Actions in `.github/workflows/ci.yml`. |
| Error tracking and logs | Done | Slow/failed request logs, crash logs, browser error + Web Vitals reports, `/api/health/metrics` (set `METRICS_TOKEN`). |
| Faster first load | Done | Live view and charts load on demand: home page JS 445 KB → 325 KB (gzipped). |
| Offline mode | Done | Service worker (`client/public/sw.js`) caches pages and public data; last live timing is kept and shown, marked, when offline. |
| Accessibility | Done | Skip link, visible focus, keyboard map, focus-trapped dialogs, live regions, colour-blind palette, reduce motion. |

## Live experience

| Item | Status | Where / what's needed |
| --- | --- | --- |
| Map accuracy | Done | Timing-delay correction: median error 81 m → 28 m against real GPS (`client/lib/track.ts`). |
| Radio transcripts | **Needs you** | Works with any OpenAI-compatible speech-to-text API: set `TRANSCRIBE_URL` and `TRANSCRIBE_API_KEY`. |
| Push notifications | **Needs you** | Generate VAPID keys (`npx web-push generate-vapid-keys`) and set `VAPID_*`. |
| Translations | Partly done | Hindi and Spanish for the main screens (navigation, settings, home, race centre, Play). Other screens fall back to English; add strings to `client/lib/i18n.ts`. |
| Picture-in-picture timing | Done | "Pop out" in the race centre (Document PiP; popup window elsewhere). |
| Head-to-head view | Done | Charts tab: lap deltas and the gap between two drivers per lap. |
| Strategy predictor | Done | Charts → Pit strategy: pit windows, rejoin position, undercut risk. Estimates, not team data. |
| Live lap-time charts | Done | Charts tab: lap times, gaps and positions for every driver. |
| TV mode | Done | `/live/tv`. |

## Social and games

| Item | Status | Where / what's needed |
| --- | --- | --- |
| Live chat | Done | Race centre → Chat (everyone and per tribe). Basic moderation: slow mode, word masking, report-to-hide, mute. A full moderation team/tooling is not included. |
| Live polls | Done | Who wins / Driver of the day during races. |
| Fantasy team | Done | Play → Fantasy. Prices from the standings; scoring from Jolpica results. |
| Weekly quiz | Done | Play → Quiz, generated from race history. |
| Shareable cards | Done | Share a correct call (`/c/:id`) or a profile; images at `/og/...`. |
| Achievements and streaks | Done | Streak, quiz, fantasy, watched sessions, watch party host, friends, Supporter, Web3 ready badges. |
| Friends | Done | Follow fans, friends ranking and feed. |

## Content

| Item | Status | Where / what's needed |
| --- | --- | --- |
| Circuit guides | Done (no seat guide) | "Going to the race": local time, daylight, forecast/typical weather, tickets and directions. Grandstand-by-grandstand seat advice is not included: there's no reliable open data for it. |
| News feed | Done | `/news` from public RSS feeds. |
| Driver/team pages | Done | `/drivers/:id`, `/teams/:id`. |
| AI race summary | **Needs you** | Set `ANTHROPIC_API_KEY`. |
| Ask about the race | **Needs you** | Same key; Race centre → Ask AI. |
| Installable app | Done (store listing needs you) | Install button and shortcuts. Google Play: build a TWA with Bubblewrap/PWABuilder and set `ANDROID_PACKAGE_NAME`/`ANDROID_CERT_SHA256`. |

## Business and future

| Item | Status | Where / what's needed |
| --- | --- | --- |
| Premium tier | **Needs you** | `/pro` uses Clerk Billing: enable Billing in the Clerk dashboard and create a plan with the key `pro` (or set `PRO_PLAN`). Perks: more AI questions, more leagues, Supporter badge. The app has no ads to remove. |
| Web3 | First step done | Wallet sign-in/linking through Clerk (enable Web3 wallets in the Clerk dashboard); linked wallets show on the profile and earn a badge. NFT badges and a fan token are not built: anything with monetary value needs legal advice first (see README). |
| Sponsor or team partnerships | Not code | Business work: official data/content licences would replace the community sources (Jolpica, F1 live timing feed, RSS). |
