# OnHand implementation handoff — 6 October 2026

The app now runs against a real local PostgreSQL backend, with separate customer and worker accounts, server-controlled matching, chat, job progression, private photos, payment state, reviews, reports and account deletion. The runtime demo store and simulated replies have been removed from the shipped journeys. All implementation checkpoints are pushed to `codex/onhand-app`.

**Public launch is still gated.** Hosted providers, real Stripe integration tests, signed physical-device tests, store enrollment/review and the remaining dependency risk review require the operator's setup. No purchase, paid API call, live charge, hosted deployment, cloud build or store submission was made. Bundles are not signed store binaries. The larger production/App Store goal remains open.

## What changed, why, and where to review

| Change | Simple explanation | Review |
| --- | --- | --- |
| Real database authority | The phone asks to do something; Postgres checks who owns it and whether it is allowed. Changing local state cannot assign a worker or mark a payment paid. | `supabase/migrations/`, `tests/database.integration.mts` |
| Customer/worker separation | Roles are set once at signup. Each role gets its own home and account controls. Wrong-role sign-in stays on the form with a useful error. | `src/marketplace/AuthScreen.tsx`, `HomeScreen.tsx`, `AccountScreen.tsx` |
| Simple interface | Three destinations. One job description and price. Optional timing is tucked away. One job detail screen handles progress, chat and payment. Old parallel screens redirect. | `src/marketplace/`, `src/app/`, `docs/review/` |
| Responsive feedback | Shared spring feedback, haptics, touch targets, reduced motion, clear busy/error states, virtualized lists, deduplicated reads and short caches. | `src/marketplace/ui.tsx`, `Provider.tsx`, `api.ts` |
| Safer sessions | Native tokens use Keychain/Keystore with Unicode-safe byte chunks. Web accounts do not leak across tabs. Account changes clear private caches/drafts. Database policies reject revoked session IDs. | `src/services/session-*.ts`, `supabase/migrations/202610060009_session_revocation.sql` |
| Address and credential privacy | Unassigned workers get region and coarse distance, not exact coordinates. Raw scores/licenses are not client-readable. Assigned photos use expiring URLs. | `202610060007_deleted_session_and_media.sql`, `202610060010_offer_privacy.sql` |
| Matching that handles contention | Eligibility filters precede ranking. Offer waves, slot limits and database locks keep bursts controlled; one worker cannot accept two active jobs. | matching/dispatch migrations, database concurrency tests |
| Payment recovery | Stable operation keys, explicit completion approval, signed provider events and a durable retry queue reduce double-charge/state-drift risks. Earnings and bank payouts are distinct. | `supabase/functions/payments/`, `stripe-webhook/`, `_shared/payments.ts` |
| Bounded private media | Service-side uploads validate size/header/dimensions, reserve quotas and prevent path forgery. Account erasure includes unattached uploads. | `supabase/functions/media/`, `202610060008_media_admission.sql` |
| Real operations | Audited credential/identity decisions, jurisdiction polygons, support cases/refunds, maintenance, notification receipts and health metrics have server-side tools. | `scripts/operator.mts`, `docs/OPERATIONS.md` |
| Release discipline | Version-compatible dependencies, deterministic decoder patch, EAS environment gates, local backend tests and a manual CI workflow. | `scripts/release-check.mjs`, `eas.json`, `.github/workflows/quality.yml` |

## How matching works

First reject unavailable, unverified, blocked, stale-location, unqualified or underpriced candidates. Require payout readiness and no active assignment. Regulated work requires current credentials and a real coordinate inside an approved jurisdiction boundary.

Then rank eligible workers using smoothed reputation, completion reliability, demonstrated skill, distance, price fit and a small newcomer opportunity component. A job-specific hash rotates equal-score ties. Three pending offers per worker is a hard cap. Dispatch uses expanding waves rather than notifying everyone. Acceptance rechecks eligibility inside locked transactions.

This is an explainable SQL baseline, not a trained AI predictor or a fairness guarantee. It avoids paid AI, fabricated acceptance percentages and automatic customer replies. Real outcomes should drive later calibration and bias review. Travel estimates are approximate, not road routing or guaranteed arrival times.

## How to review locally

1. Follow the README setup with Node 24 and Docker. The database/services are local and the fixture payment path cannot be enabled on a hosted Supabase URL.
2. Start `npm run local:functions` and `npm run web` in separate terminals.
3. Sign in as **Get help** with `customer@onhand.test`; sign in as **Find work** in another tab with `worker@onhand.test`. Both fixture passwords are `LocalOnHand-2026!`.
4. Post an **Assembly** job at the saved synthetic address, with a $120 price. Accept from the worker tab. Before acceptance, verify only approximate location is visible; afterward, verify the private address.
5. Use the clearly labelled local payment authorization. Send a chat message, then advance the worker through departure, arrival, start and completion. The customer approves completion and reviews the worker. These are synthetic state transitions; no money moves.
6. Try wrong-role sign-in, duplicate actions, account changes, optional scheduling, cancelling/reporting, denied permissions and interrupted connectivity. Refresh seed locations with `npm run local:seed` if workers have been idle longer than 15 minutes.
7. Read `docs/VALIDATION.md`, `docs/security/AUDIT.md`, `docs/ARCHITECTURE.md` and `docs/OPERATIONS.md`. Run the documented checks to reproduce the results. Database/auth/load helpers reject non-loopback targets.

## What I need from you next, in order

Do these in the provider dashboards or a protected local environment. **Do not paste private keys, government identity documents or payment credentials into chat.** Selecting or enabling a billed service is your decision; nothing below authorizes a purchase automatically.

1. **Operator identity, launch scope and budget.** Confirm the legal business/support contact, intended launch jurisdiction, approved job categories, the 15% platform fee, cancellation/refund rules, minimum price and who performs safety/credential reviews. Review the draft privacy/terms with qualified advice for your operating location. Decide retention, insurance and abuse-response procedures. The draft text is not a legal compliance certification.
2. **Staging Supabase project.** Select/create the project yourself, choose region/tier and review its costs. Supply public configuration through `.env.local`/EAS, and link the selected project securely. I can then inspect/apply migrations and deploy all six handlers to that known staging target. Back up any existing data first. Do not copy local fixtures into hosted production.
3. **Email sender.** Configure a verified SMTP domain/sender and the supplied token-based confirmation/recovery templates. Configure hosted Auth verification, 12-character passwords, redirect allowlists and rate limits. I can then test real delivery/recovery and failed-code/session cases.
4. **Stripe test configuration.** Complete your Stripe/Connect account setup yourself. Store test server/webhook secrets in Supabase and the publishable test key in the client environment. Choose a supported platform/connected-account event destination with the correct signing secret. I can then run test-mode PaymentSheet/Checkout, 3DS, cancellation, capture, webhook reordering, full refund and payout failure tests. Do not enable live money before these pass.
5. **Operational review and coverage.** Supply authoritative service-boundary GeoJSON and an approved review process. An operator reviews worker identity/insurance/licenses; Stripe payout readiness alone is insufficient. Configure the protected one-minute operations scheduler, monitoring, alerts, backup policy and storage retention. I can then validate dispatch/recovery and a staging restore.
6. **EAS and physical devices.** Link your EAS project; confirm bundle IDs belong to you; configure APNs/FCM credentials. Choose the permitted build plan/free quota. Provide testing on iOS and Android physical devices, including camera, location denial, offline reconnect, push taps, secure-session restoration, payment recovery, VoiceOver/TalkBack, reduced motion and large text. I can prepare/run builds within your explicitly approved quota; no cloud build has been started.
7. **Dependency and capacity gate.** Review the remaining `braces` and `node-forge` upstream advisories with the toolchain owner. Adopt compatible fixes when available; do not force an old Expo SDK. Measure the actual hosted tier under concurrent job/chat/Realtime bursts and provider slowdown, set budgets/alerts and verify backups. The 5,000-worker local query benchmark is not proof of thousands of concurrent users.
8. **Store accounts and submission materials.** Complete Apple/Google enrollment/payment/identity steps yourself. Supply approved branding, support/privacy URLs, app descriptions, content rating and truthful privacy/Data Safety disclosures, plus reviewer customer/worker accounts and instructions. Google testing requirements depend on your account. I can prepare signed release builds and submission packages after the prior gates; store approval is external.
9. **Final production switch.** After staging and device tests pass, choose the production project/provider secrets, approved live Stripe mode and spending limits. Apply forward migrations, verify cron/webhooks/alerts, set HTTPS/CSP headers if publishing web, and run `npm run release:check`. Perform controlled launch and reconciled payment monitoring. Any live financial action remains yours to execute/approve specifically.

## Costs and limits

See `docs/COSTS.md` for primary links, assumptions and worked budgets. Published US reference prices checked 6 October 2026:

- Supabase Pro starts at **$25/month**, with compute, Realtime, storage/egress/function and backup overages/options.
- EAS has a free build quota; optional Starter **$19/month plus usage**. Expo push itself has no service charge.
- Stripe domestic cards **2.9% + $0.30/charge**; this Connect model generally adds **$2/month per active worker account + 0.25% + $0.25/payout**, subject to your contract.
- Example email: Resend free limits or **$20/month** Pro plus overages.
- Apple Developer **$99/year**; Google Play **$25 one time**, subject to regional/eligibility conditions.
- Hosting/domain, staging compute, monitoring, insurance, verification vendors, tax reporting and human support may add costs. No paid AI, maps, Redis or message broker is required by the implemented core.

An illustrative 100 × $120 job month with 25 active workers and one payout each is about **$484.75** in processing/Connect/database costs before store/business costs. A 1,000-job example is about **$4,590** under the documented assumptions. These totals include variable payment fees, not just subscriptions; they are not capacity promises.

## Deliberate boundaries

No claim of zero vulnerabilities, unbreakable software, legal compliance or completed store readiness is made. Partial refunds, tips, automated dispute decisions, paid routing/address validation, automated identity/background checks, AI moderation and model training are not shipped. Required launch work includes human support, provider tests, physical-device QA and hosted recovery/capacity checks. The existing infrastructure makes these remaining gates concrete and reviewable without spending money first.
