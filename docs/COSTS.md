# Cost guide — verified 6 October 2026

No purchases, upgrades, cloud builds, live payment/push calls or paid AI requests were made. Local infrastructure has no provider subscription charge; your computer, internet and existing Codex subscription are outside that statement. USD estimates below assume a US marketplace and exclude tax, discounts, disputes, refunds, international cards and business operations. Confirm prices before enabling anything.

| Service | Published baseline / usage | How it affects this app |
| --- | --- | --- |
| Supabase | Free $0; Pro starts $25/month. Small compute implies about $30 total; Medium about $75, with the included compute credit. | Auth, PostgreSQL, storage, Realtime and functions. Free is suitable for evaluation, not a production availability promise. Pro includes daily DB backups; PITR starts $100/month extra. |
| Supabase Realtime | Pro includes 500 peak connections and 5M messages; excess connections $10/1,000, messages $2.50/M. | Count simultaneous devices/tabs, not registered users. Free has lower limits. |
| Expo EAS | Free includes 15 iOS + 15 Android builds/month; Starter $19/month plus usage, with build credit. | Optional paid build convenience. No EAS build was started. |
| Expo push | No push-service charge; throughput limit 600 notifications/second/project. | Native credentials and a tested build are still required. |
| Stripe US cards | 2.9% + $0.30 per successful domestic card charge. | A $120 charge costs $3.78 before other fees. Real processing is usage-billed. |
| Stripe Connect, platform-controlled pricing | $2 per monthly active connected account, plus 0.25% + $0.25 per payout. | This implementation's Express/destination-charge model needs Connect fee budgeting; account/payout frequency matters. Confirm your contract and responsibility model. |
| Transactional email, example Resend | Free 3,000/month with 100/day limit; Pro $20/month for 50,000, then $0.90/1,000 extra. | SMTP signup/recovery emails. Choose any suitable provider; none has been connected or purchased. |
| Apple Developer | $99/year, with regional pricing/eligible waivers. | Needed for ordinary App Store distribution/signing. |
| Google Play | $25 one-time registration. | Identity/testing requirements depend on account type. |
| GitHub Actions | Public-repository standard hosted runners can be free; private-repository quotas/overages depend on plan. | Workflow is manual and has not been run. Review billing before dispatch. |

Sources: [Supabase pricing](https://supabase.com/pricing), [Expo pricing](https://expo.dev/pricing), [Expo push FAQ](https://docs.expo.dev/push-notifications/faq/), [Stripe Payments](https://stripe.com/pricing), [Stripe Connect](https://stripe.com/connect/pricing), [Resend](https://resend.com/pricing), [Apple enrollment](https://developer.apple.com/programs/enroll/), [Google registration](https://support.google.com/googleplay/android-developer/answer/6112435), [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

## Illustrative monthly budgets

For **100 completed $120 jobs**, assume 25 active workers, one bank payout each, domestic cards, no additional provider fees: card processing $378; Connect $81.75 ($50 active accounts + $25.50 volume + $6.25 payout count); a $25 database plan gives **$484.75/month** before store fees and other operating costs. The implemented 15% platform fee generates $1,800 gross platform revenue, leaving $1,315.25 after those illustrated provider/database costs, before tax/support/insurance/etc.

For **1,000 completed $120 jobs**, assume 200 active workers, one payout each, domestic cards: processing $3,780; Connect $705. Add illustrative $75 database compute, $20 email and $10 additional Realtime connection capacity: **about $4,590/month** under those assumptions. That is a budgeting example, not a measured required tier or capacity promise. Weekly payouts, international cards, more active workers, storage/media/egress and disputes change the total.

A staging project can add compute cost. Supabase database size, storage, egress, functions and backup options have quotas/overages; spend caps are not a universal cap on every fee. Email and EAS have usage billing. A custom domain, web host, uptime/error monitoring, identity/background-check vendor, insurance, tax reporting and human support can add costs; none is mandatory code-installed or purchased here, and prices require a chosen provider/coverage model. Do not assume those business costs are zero.

No paid AI, map API, routing API, Redis or separate message broker is required by the implemented core. Matching runs inside PostgreSQL. Native device geocoding/foreground location is used with user permission; there is no paid geocoding account configured. If you later choose external address validation, route ETA, AI moderation/vision or automated identity checks, set a separate budget and approve that integration first.
