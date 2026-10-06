# OnHand

A mobile marketplace: describe the job, name your price, and match with an eligible worker. Customers and workers have separate accounts and interfaces. Expo SDK 57 / React Native 0.86, PostgreSQL 17 with PostGIS, Supabase Auth/Storage/Realtime, and server-side Stripe Connect integrations.

**Status:** functioning and tested against a local backend. No hosted deployment, live charges, signed store build or App Store submission has been made. See [handoff](docs/HANDOFF.md) for launch gates, changes and review instructions, and [costs](docs/COSTS.md) before enabling any service.

## Run locally

Use Node 24 LTS and Docker. No provider purchase is required.

```sh
npm ci
npm run local:db
npm run local:env
npm run local:seed
```

In separate terminals:

```sh
npm run local:functions
npm run web
```

Open `http://localhost:8081`. The seed creates these **local-only fixtures**, all with password `LocalOnHand-2026!`:

| Account | Sign-in choice |
| --- | --- |
| customer@onhand.test | Get help |
| worker@onhand.test | Find work |
| worker2@onhand.test | Find work |

Use separate browser tabs for separate accounts; web sessions are tab-scoped. Post an Assembly job with the saved local test address and a $120 offer. Accept from a worker account, authorize the explicitly labelled local payment, advance through the work, approve completion and leave a review. Local payments update fixture states; **no money moves**. Rerun `local:seed` to refresh fixture worker locations; only eligible, recently located workers receive offers. Integration tests create additional synthetic accounts, which the main customer fixture excludes from matching.

If `.env.local` already exists, `npm run local:env -- --replace` explicitly replaces it with local configuration. Never replace a hosted environment with this helper. To reset this project's disposable local data, stop app sessions first and run `npx supabase@latest db reset --local`, wait for completion, then seed again. If changing Auth config, stop/start local Supabase to recreate the Auth container; resetting SQL alone does not change its environment.

For a phone, use a development build with a reachable HTTPS test backend and configured EAS project. `127.0.0.1` on a physical phone is the phone itself. Stripe/push require the configured native build; Expo Go is not the release test environment.

## Check

```sh
npm run check          # lint, strict TypeScript, 26 unit/security regression tests
npm run check:edge     # six Deno endpoints
npm run test:auth      # local intercepted-email verification/recovery
npm run test:db        # local PostgreSQL, RLS, storage, concurrency and Edge checks
npm run test:load      # rolled-back 5,000-worker SQL benchmark
npm run export        # web bundle
npm run export:native # iOS and Android Hermes bundles, not signed binaries
npx expo-doctor
```

The CI workflow is manual (`workflow_dispatch`) to avoid silently consuming paid runner minutes. `npm run release:check` checks operator-supplied release environment variables; production EAS builds invoke it after install. Missing credentials are expected to fail. Passing the guard does not replace hosted integration, physical-device QA or store review.

## Code map

- `src/app/`: thin Expo Router screens. Older URLs redirect into the current workflows.
- `src/marketplace/`: real screens, auth, account-scoped queries and shared controls.
- `src/services/`: public configuration validation, secure sessions and backend integration.
- `supabase/migrations/`: authoritative transactions, RLS, matching, financial recovery and maintenance.
- `supabase/functions/`: authenticated payments, onboarding, deletion, private media, signed webhooks and operations.
- `tests/`: unit regressions and tests of the actual local backend.
- `src/domain/`: taxonomy/lifecycle types plus the earlier simulator used by regression tests. The shipped interface does not load simulator people or automatic replies.

Read [architecture](docs/ARCHITECTURE.md), [operations](docs/OPERATIONS.md), [validation](docs/VALIDATION.md) and [security audit](docs/security/AUDIT.md). Keep Stripe, operations and service-role secrets server-side. `.env.example` lists public settings and server secret names.
