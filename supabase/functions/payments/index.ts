// Deploy only after configuring Stripe Connect and a server-side job submission path.
import Stripe from 'npm:stripe@18.5.0';
import { createClient } from 'npm:@supabase/supabase-js@2';
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') || 'http://localhost:8081', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  const token = request.headers.get('Authorization')?.replace(/^Bearer /, '');
  if (!token) return reply({ error: 'Authentication required' }, 401);
  const { data: { user }, error: authError } = await db.auth.getUser(token);
  if (authError || !user) return reply({ error: 'Authentication required' }, 401);
  try {
    const { jobId, action } = await request.json();
    const { data: job, error } = await db.from('jobs').select('*').eq('id', jobId).single();
    if (error || !job || job.customer_id !== user.id) return reply({ error: 'Job not found' }, 404);
    if (action === 'authorize') {
      if (job.status !== 'matched') return reply({ error: 'A confirmed match is required' }, 409);
      const { data: worker } = await db.from('workers').select('stripe_account_id').eq('id', job.worker_id).single();
      if (!worker?.stripe_account_id) return reply({ error: 'Specialist payments are not ready' }, 409);
      const intent = await stripe.paymentIntents.create({ amount: job.offer_cents, currency: 'usd', capture_method: 'manual', automatic_payment_methods: { enabled: true }, application_fee_amount: Math.round(job.offer_cents * 0.15), transfer_data: { destination: worker.stripe_account_id }, metadata: { job_id: job.id } }, { idempotencyKey: `authorize-${job.id}-${job.version}` });
      const { error: saveError } = await db.from('payments').upsert({ job_id: job.id, stripe_intent_id: intent.id, amount_cents: job.offer_cents, fee_cents: Math.round(job.offer_cents * 0.15), state: 'pending' }, { onConflict: 'job_id', ignoreDuplicates: true });
      if (saveError) throw saveError;
      return reply({ clientSecret: intent.client_secret });
    }
    if (action === 'capture') {
      if (job.status !== 'awaiting_completion_confirmation') return reply({ error: 'Work is not ready for approval' }, 409);
      const { data: payment } = await db.from('payments').select('*').eq('job_id', job.id).single();
      if (!payment || payment.amount_cents !== job.offer_cents) return reply({ error: 'Authorize the agreed amount first' }, 409);
      const intent = await stripe.paymentIntents.capture(payment.stripe_intent_id, { amount_to_capture: payment.amount_cents }, { idempotencyKey: `capture-${payment.id}` });
      // The signed webhook is authoritative for payment/job completion.
      return reply({ status: intent.status });
    }
    return reply({ error: 'Unsupported payment action' }, 400);
  } catch { return reply({ error: 'Payment could not be processed. Retry safely with the same job.' }, 400); }
});
