# OnHand engineering notes

OnHand is an Expo SDK 57 / React Native 0.86 app, with Expo Router routes and a responsive React Native Web preview. The current runtime is deliberately a local demo. It is not ready to process real bookings or money.

## Structure

- `src/design`: tokens, spring-driven controls, accessibility primitives, schematic map provider.
- `src/features`: home, progressively disclosed request, matching/jobs, chat, account, worker workflows.
- `src/domain`: strict models, service taxonomy, job state machine, synthetic population, pricing, reputation, routing, acceptance, dispatch and batch allocation.
- `src/state`: Zustand actions and AsyncStorage persistence. Screens request transitions; they do not set arbitrary job states.
- `src/services`: classification, payments, chat, activity and telemetry contracts; mock adapters; optional Supabase client and scoped realtime/storage adapters.
- `supabase`: PostGIS schema, indexes, row-level access policies, transactional offer acceptance and payment-webhook handling; Stripe Connect Edge Function examples.

## Demo contract

28 synthetic workers have varied skill histories, prices, locations, service areas, availability and performance. They are not actual providers. Avatars use public placeholder images with initials as an offline fallback. The map is an original schematic of a Brooklyn neighborhood, not a navigation product. Public markers show illustrative density; they do not identify precise workers. Classification is a text-based, delayed heuristic, not image recognition. A sample sink issue is available without camera permissions. Chat replies, credentials, card authorizations, captures and payouts are simulated. Demo progress persists on the device. Settings can reset it.

All requested screen concepts are represented through dedicated routes or focused states: request method/capture/analysis/details/location/timing/price/summary; matching/found; tracking/arrival/in-progress; completion/tip/multi-dimension review; job history/detail; chat/messages; profile/payment/addresses/safety/settings; welcome/login; worker setup/skills/verification; worker availability/offers/counter/accepted job; earnings/reputation/reviews/profile/settings. Native splash is configured with Expo. The home screen is the default demo entry to make exploration immediate; the welcome flow is reachable from Profile → Meet OnHand.

## Reputation

Bayesian review prior: 35 reviews at 4.4/5. Observed reviews get more weight as their count grows. Components: adjusted reviews (30%), reliability (30%), completion/time/repeat/recent performance (16%), relevant skill confidence (16%), diminishing experience confidence (8%). Reliability mixes completion, punctuality and responsiveness. Cancellation, complaints, refunds and disputes penalize the result. Acceptance rate is used to estimate willingness, not to reward indiscriminate acceptance. Components are clamped to [0,1]. Recent performance is a separate input; production aggregation must calculate it from time-decayed event windows, not lifetime averages.

## Acceptance and price

Per-worker logistic acceptance uses effective hourly revenue including travel time, preferred minimum compensation, utilization, historic acceptance, responsiveness and schedule flexibility. Price compatibility is also a hard eligibility boundary. A worker is filtered before scoring if unavailable, suspended, outside their service radius, blocked, missing a skill, or missing a required valid jurisdiction-specific license.

The aggregate is `min(0.98, 1 - product(1 - acceptance * completion * (1 - cancellation)))`. This is an independence approximation over synthetic workers, not a calibrated promise. Correlated market shocks and strategic worker behavior would require a trained survival/choice model. The recommendation uses duration, urgency, and eligible local supply. The live metrics derive from candidates at the selected price; they are not a lookup table of invented percentages. Production needs market demand, time/day, materials, regional costs and historical calibration data.

## Routing and dispatch

Routing is an interface. The simulator models road detours, heading and a river-crossing penalty. It is not straight-line nearest-worker assignment. Production should replace this provider with Mapbox or another traffic-aware route matrix and time-valid availability.

Candidate weights: skill 21%, quality 20% (26% for premium offers), acceptance 19%, completion 14%, ETA utility 12% (6% for premium), price fit 8%, repeat-customer affinity proxy 6%, minus cancellation and complaint risks. All positive inputs are normalized. Premium visibility is a weighting change, not a permanent lockout. One first-wave slot is reserved for an eligible newcomer if one exists. Hard safety/skill/price constraints are never relaxed for exploration.

Dispatch snapshots and ranks candidates, sends up to three offers, then four more, then the remaining eligible pool. Waves progress from the highest joint scores to broader candidate coverage. Each offer has an expiry. Acceptance is sampled individually. It can succeed, exhaust, or cancel; the app never substitutes a guaranteed hard-coded match. Abort signals suppress late acceptance. Production dispatch must run server-side so it survives app suspension. The current app restarts a demo search when the user reopens it.

`allocateBatch` is an oldest-request-first allocation heuristic that reserves each worker at most once. It is isolated from single-request ranking. Replace it with maximum-weight bipartite assignment, min-cost flow, or a solver when multiple simultaneous jobs become material. Revalidate and transact at acceptance, not just candidate generation.

## State and money

The shared transition table permits explicit cancellation and dispute paths and rejects jumps such as draft → completed. SQL enforces the same edges. Screens invoke store actions. A mock capture requires completion approval and an amount matching the authorization. Tips are separately chosen; a changed scope is never silently billed. The worker counteroffer demo has an explicit customer-approval simulation step.

Production money flow: customer-scoped Edge Function creates a Stripe Connect destination PaymentIntent with manual capture, confirmed through a native PaymentSheet. Work occurs after successful authorization. Customer completion approval requests capture. Signed webhooks deduplicate and update payment, job and payout bookkeeping transactionally. Only service role may invoke those functions. Authorization and capture have stable idempotency keys. Secrets stay server-side.

The included production handlers cover base-offer authorization/capture only. Before deployment, implement customer Stripe identities, PaymentSheet, tip authorization, incremental/scope authorization, refund/dispute operator workflows, Connect onboarding/KYC, authorization expiration renewal, cancellation release, payout reconciliation, monitored retries and Stripe test-mode integration tests. `scheduled` demo jobs are matched immediately for preview; production must schedule dispatch and authorization near the appointment to avoid expired holds.

## Privacy and permissions

Exact addresses, access notes and points live in `job_private`; offered workers can read only the approximate job row. Accepted participants may read private rows and photos. Storage is private, with participant checks against the job UUID path prefix. Client writes cannot change jobs, offers, quality metrics, verified credentials, or financial records. A server orchestration layer must authenticate, validate eligibility and constraints, then use service-role actions. Never ship a service-role key in `EXPO_PUBLIC_*` variables.

The migration is a foundation and has not been applied to a hosted project. Verify it against local Supabase and test RLS using customer/worker/outsider accounts before live use. Provider eligibility policies need jurisdiction-specific operational review and a credentials provider; the demo’s NY skill check is not a legal determination.

## Realtime, recovery and observability

Realtime subscriptions scope job state and chat to one job. A connection callback exposes recovery state; reconnect should invalidate the relevant TanStack Query cache. Do not poll every screen. Local chat is optimistic with explicit sent/failed states and retry; automatic replies are labelled demo. Native Live Activities have a contract, but the demo adapter is intentionally inert until an app-group/widget target and push service exist.

Telemetry is an in-memory ring buffer (300 events) behind an adapter. It records lifecycle, offer, pricing and payment events without addresses, names, photos or chat contents. Production analytics should respect consent, redact identifiers, monitor dispatch latency, no-match rate, cancellations, payment reconciliation, and fairness/exploration exposure by skill cohort.

## Design

Graphite `#101112`, charcoal `#1b1d1e`, elevated `#242627`, warm white `#f4f3ef`, orange `#ff641f`, green `#9bcca8`. System grotesk typography keeps native familiarity. Cards use 18px radii; controls have generous targets. Orange focuses attention on requesting and acting, rather than decorating every surface. Buttons compress to 0.97 with springs. OS and app reduced-motion preferences suppress press animation. Haptics distinguish selection, commitment, success and warning.

## Release boundary

Web functional review and platform exports do not validate native camera permissions, haptic feel, map rendering or 120Hz performance on physical devices. Complete iOS/Android device QA, accessibility text scaling and VoiceOver/TalkBack checks, integration tests, security review, real identity/licensing verification, support operations, and payment compliance before treating this as a live marketplace.
