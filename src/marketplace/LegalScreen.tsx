import React from "react";
import { Copy, Divider, Page, palette, Stack } from "./ui";
export default function LegalScreen() {
  const contact = process.env.EXPO_PUBLIC_SUPPORT_EMAIL;
  return (
    <Page
      back
      title="Privacy and terms"
      subtitle="Last updated October 6, 2026"
    >
      <Stack>
        <Copy size={23} weight="700">
          Your information
        </Copy>
        <Copy color={palette.slate}>
          OnHand uses your name, email, job details, photos, messages and
          location to connect customers with workers and deliver the service.
          Exact job addresses are shared only with the customer and assigned
          worker. Worker location is used for matching and is not publicly
          displayed.
        </Copy>
        <Copy color={palette.slate}>
          We use Supabase for account authentication, PostgreSQL data, private
          photo storage and live updates. Expo delivers device alerts; your
          device’s location services help locate addresses. Stripe handles
          payment and bank details. OnHand does not store card numbers. We do
          not sell your personal information or use your private job photos to
          train AI models.
        </Copy>
        <Copy color={palette.slate}>
          You can sign out or request account deletion from Account. Deletion
          removes your account information and saved addresses; transaction
          records needed for accounting, fraud prevention or dispute resolution
          may be retained. Backups and payment providers follow their own
          retention requirements.
        </Copy>
        <Divider />
        <Copy size={23} weight="700">
          Using OnHand
        </Copy>
        <Copy color={palette.slate}>
          Customers describe a job and set a budget. Workers choose whether to
          accept it or propose another price. Materials, timing and scope
          changes require agreement before work proceeds. Travel estimates are
          approximate and do not guarantee an arrival time.
        </Copy>
        <Copy color={palette.slate}>
          The customer authorizes the agreed payment before work starts, then
          approves completion before capture. A 15% platform service fee is
          deducted from the job price. The job price is the customer’s total for
          the agreed work; additional material costs require separate agreement.
          Tips are not supported in this release.
        </Copy>
        <Copy color={palette.slate}>
          Workers must hold the qualifications and insurance required for their
          work and area. An identity check does not guarantee performance.
          Customers and workers should coordinate safely, report concerns in the
          job screen, and contact local emergency services if there is immediate
          danger.
        </Copy>
        <Copy color={palette.slate}>
          Cancel before work starts through the job screen. Work already
          started, payment disputes and refunds require a support review. Refund
          decisions depend on the agreement, work delivered and applicable
          requirements.
        </Copy>
        <Divider />
        <Copy size={23} weight="700">
          Contact
        </Copy>
        <Copy color={palette.slate}>
          {contact
            ? `For support or a privacy request, contact ${contact}.`
            : "Support contact is being configured. Job reports are stored for review. Public launch requires an active support and privacy contact."}
        </Copy>
        <Copy size={13} color={palette.slate}>
          The app operator must confirm these terms, retention periods, coverage
          area and support process before public release.
        </Copy>
      </Stack>
    </Page>
  );
}
