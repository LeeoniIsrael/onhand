# Validation record

Validation performed on 2026-10-02.

## Automated

- TypeScript strict check: passed.
- ESLint: passed without warnings after cleanup.
- Node test suite: 15 passed. Covers population diversity, Bayesian reputation, hard eligibility constraints, license expiration/jurisdiction, price monotonicity, blocked candidates, bounded/explainable ranking, road detours, batch exclusivity, acceptance/expiry/cancellation, newcomer exposure, lifecycle invariants, payment approval/idempotency, and category coverage.
- Expo Doctor: 18/18 checks passed.
- Expo production web export: passed.
- iOS and Android Hermes bundle exports: passed. These validate bundling, not store signing or device behavior.

## Browser walkthrough

Used the actual rendered app controls, with phone and desktop viewport checks.

- Home → request → sample classification → editable details → saved address → immediate timing → price presets → summary → submit.
- Price metrics update with the offer; the tested $145 → $180 change moved estimated probability from 84% to 97% in the initial seeded population. Exact results may change as seed inputs evolve.
- Matching selected a ranked candidate and displayed the agreed offer and arrival estimate.
- Confirm → tracking → text quick reply → simulated response.
- Arrival → start work → work complete → customer approval → 15% tip → demo capture → multidimensional review → saved confirmation.
- Profile → switch worker → incoming offer → counteroffer → explicit demo customer approval → accepted job; precise address shown only after acceptance in the worker UI.
- Reset demo progress restored a clean customer entry.
- Fixed a missing pressed-control background, reserved route-parameter conflict, empty-string native text warning, retained scroll position between request steps, and phone-width header/map overflow found during review.

## Native runtime

- Expo Go 57.0.9 loaded OnHand on an iPhone 17 Pro simulator (iOS 26.0). Native home rendering, safe areas, controls and schematic map verified visually. The initial IPv6-only localhost binding was corrected by restarting Metro on its normal interface. Full native workflow and physical-device interaction QA remain outstanding.

## Remaining release gates

- Hosted Supabase migrations/RLS and Stripe handlers are not deployed or integration-tested. See architecture notes.
- Physical-device haptics, camera/video capture, permission denial, location accuracy, offline recovery, VoiceOver/TalkBack and large text need device QA.
- Full real-world dispatcher scheduling, live routing, model calibration, verification, support/refunds and notification delivery remain integration work.
- `npm audit` reports 16 transitive Expo ecosystem advisories (4 high, 12 moderate). Notably node-forge's latest available release remains affected by GHSA-86w9-cpqp-85rv. The CLI's proposed fixes include downgrading Expo to SDK 44, which would break this SDK 57 app; no forced downgrade was applied. The query-string/decode-uri-component and xcode/uuid chains also need compatible upstream updates. Recheck and resolve before production release.

Preview images in this folder show the local app, not a design-only mockup.
