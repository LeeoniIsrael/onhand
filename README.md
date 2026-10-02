# OnHand

Capable help, nearby, now. A dark, map-led Expo app for requesting home repairs at your own price, with a working synthetic marketplace and customer/worker journeys.

## Run

Node 24 LTS recommended. SDK 57 / React Native 0.86.

```sh
npm install
npm run web
# or
npm run ios
npm run android
```

The dependency-local Node 24 binary is included for environments using an unsupported Node major. npm scripts resolve it automatically. No backend keys are required for the demo.

Start on Home → **Find help now** → **Try it with a sample sink leak**. Continue through the details, address, urgency and offer, then request a specialist. Matching uses individual synthetic acceptance probabilities; if nobody accepts, retry or raise the offer. Confirm the match, use the labelled **Demo** progress actions, then approve completion, tip and review.

Open Profile → **Switch to worker mode** to try incoming offers, counters, availability, tracking, earnings and OnHand Score. Profile → **Meet OnHand** opens the welcome/login demo. Settings → **Reset demo progress** restores the seed.

## Verify

```sh
npm run typecheck
npm run lint
npm test
npm run export
npm run export:native
npx expo-doctor
```

## What is real in this build

- React Native screens and shared primitives, Expo Router navigation, spring press feedback, native haptics, image/video picker and foreground location permission flow.
- Persisted job lifecycle, chat, reviews, address editing, worker blocking and role switching.
- 28-worker simulator, skill/licensing constraints, Bayesian-weighted reputation, individual acceptance model, dynamic price estimates, dispatch waves, cancellation, no-match states and batch allocation.
- Supabase/PostGIS schema with RLS, private photo storage policies, transactional acceptance; server-only Stripe Connect authorization/capture and signed-webhook examples.

## What is simulated or not deployed

Photo classification, specialists and credentials, map/routing data, chat replies, payment methods, charges and payouts are demo data. Supabase is optional and the frontend stays in local demo mode even if credentials are supplied. Production dispatch, auth UI, storage upload orchestration, trained vision, live maps, native Live Activities and payment/verification providers require integration. SQL and Edge Functions are supplied but not deployed or integration-tested. No real worker is contacted and no real money moves.

See [architecture and release boundaries](docs/ARCHITECTURE.md) for the matching model, security design and integration checklist. `.env.example` documents optional client settings. Stripe and service-role secrets belong only in server secrets.
