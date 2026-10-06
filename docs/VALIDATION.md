# Validation — 6 October 2026

Tests ran against the final source and a freshly recreated local Supabase/PostgreSQL database. No hosted production deployment, live payment/push, external email, signed store binary or store submission was performed.

## Automated results

| Check | Observed result | What it proves |
| --- | --- | --- |
| ESLint + strict TypeScript | Pass | Static checks for the app and scripts. |
| Unit/security regressions | 26 pass | Matching/lifecycle simulator invariants, public configuration guards, time-bounded malformed URL decoding, tab session namespaces, bounded fetch cancellation and Unicode-safe secure chunks. These do not substitute for the real database tests. |
| Deno checks | Six endpoints pass | Payments, webhook, account, Connect, operations and media typecheck. |
| Fresh database reset | All 22 migrations apply | Schema is reproducible on local PostgreSQL 17.11 with Auth/Storage integration. This is not a production upgrade/restore test. |
| Auth integration | Two pass | Actual intercepted confirmation and recovery email codes, verified signup, password replacement and old-password rejection. Local mail only. |
| Database/Edge integration | 29 pass | Actual RLS, command, storage, concurrency, deletion, financial-state and authenticated endpoint boundaries. |
| Expo Doctor | 18/18 pass | SDK dependency/config checks. |
| Web export | Pass | Production web bundling. Hosting/security headers still need configuration. |
| Android + iOS export | Both pass | Hermes production bundles. Not signing, native compilation, payment SDK/device behavior or store readiness. |
| Release environment guard | Expected rejection | Public-release configuration is incomplete: hosted public keys, support contact, live publishable payment key and EAS project must be supplied. The local backend is not a public-release configuration. |
| Dependency audit | 21 high, zero moderate/critical | Two unresolved advisory sources cascade through tooling. See the security audit; this is a release risk to review. |
| Credential pattern scan | No matches | Selected high-confidence patterns in tracked files/history, 346 historical objects. Not an exhaustive third-party secret scan. |

Database integration covers immutable roles, foreign address ownership, credential/location privacy, command replay consistency, matching eligibility and jurisdiction polygons, outsider chat rejection, stale locations, accept races, three-slot offer pressure, revoked JWT denial on raw tables/RPC/Edge, operator audit boundaries, current-time license expiry, media byte/dimension/hash validation and direct/signed upload denial. It also covers concurrent/daily media reservation caps, uploaded object ownership, account deletion including orphan objects, anonymous/wrong-origin/unsigned webhook failures, capture approval/idempotency, refund ledger reversal and immutable assigned agreements. The sensitive offer column check includes a real Realtime event.

Payment integration tests exercise database/provider-event contracts with local fixtures. They do **not** call Stripe test/live APIs or verify real 3DS, PaymentSheet, Checkout, Connect onboarding or bank payouts.

## Local query benchmark

`npm run test:load` creates 5,000 synthetic eligible workers inside a rolled-back transaction and executes 40 matching queries. Final recorded run:

- Matching p50 **75.22 ms**, p95 **83.37 ms**, maximum **206.06 ms**.
- First dispatch **153.91 ms**, creating three offers.
- JSON and query plan: `LOAD_TEST.json`, `LOAD_QUERY_PLAN.json`.

This is a local single-process SQL benchmark, not an end-to-end response SLA or evidence of thousands of simultaneous users. Measure concurrent traffic, pool/lock waits, large histories, Realtime peaks, scheduler lag and provider slowdown on the selected hosted tier before expanding.

## Browser checks

Used the real app controls and local PostgreSQL accounts, with desktop and a 390-pixel development preview frame. Saved proof images are in `docs/review/`; the frame is disabled in production.

- Separate customer and worker login/home/account journeys, including wrong-role error and corrected sign-in.
- Request creation, real category/address selection, optional future scheduling and price, review, posting and worker acceptance.
- Exact address appears after assignment; local authorization gates departure; real chat and worker departure/arrival/work/completion; customer approval, fixture capture and review.
- Account/draft isolation and preserved request draft during address navigation.
- Final review caught and fixed Realtime channel reuse during cleanup/token refresh, provider-dependent error fallback, and a reserved parameter in the development preview route. Account signals now have one owner, channel names are unique, and token refresh does not remount subscriptions.
- Final simplified composer verified after the redesign: one description, price, optional timing/duration and one review step.
- Private photo handling and upload boundaries exercised through real Storage/Edge integration tests.

No old simulated reply, classifier diagnosis, fake acceptance percentage, role-switch button or demo payment is part of the hosted production path. The local payment fixture is prominently labelled and constrained to loopback/container hosts.

## Required before public release

1. Hosted staging migrations/handlers, Auth/SMTP settings, real delivery, HTTPS/CSP, scheduler and secrets.
2. Actual Stripe test-mode native/web authorization, 3DS, holds/capture, interruptions, webhook ordering/duplication, refunds, Connect and payout failures.
3. Signed iOS/Android physical-device QA: secure session restoration/logout, camera/photo, location and permission denial, push foreground/background/taps, offline recovery, reduced motion, large text, VoiceOver/TalkBack and keyboard/safe-area behavior.
4. Hosted capacity, operational alerts, provider quotas, backup/object-storage restoration and recovery drills.
5. Qualified identity/licensing/insurance review process, accurate service polygons, reviewed legal/support/retention policy and monitored safety reports.
6. Compatible upstream dependency fixes or explicit toolchain risk disposition; store metadata/privacy disclosures, enrollment and review.

See `HANDOFF.md` for the numbered operator setup steps. The public production/App Store goal remains open.
