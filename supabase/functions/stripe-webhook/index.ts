import Stripe from 'npm:stripe@18.5.0';
import { createClient } from 'npm:@supabase/supabase-js@2';
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  let event: Stripe.Event;
  try { event = await stripe.webhooks.constructEventAsync(await request.text(), request.headers.get('stripe-signature') || '', Deno.env.get('STRIPE_WEBHOOK_SECRET')!); }
  catch { return new Response('Invalid signature', { status: 400 }); }
  if (!['payment_intent.succeeded', 'payment_intent.amount_capturable_updated', 'payment_intent.payment_failed'].includes(event.type)) return new Response('Ignored');
  const intent = event.data.object as Stripe.PaymentIntent;
  const { error } = await db.rpc('apply_stripe_event', { p_event: event.id, p_type: event.type, p_intent: intent.id, p_amount: intent.amount, p_state: event.type === 'payment_intent.succeeded' ? 'captured' : event.type === 'payment_intent.amount_capturable_updated' ? 'authorized' : 'failed' });
  return new Response(error ? 'Retry later' : 'OK', { status: error ? 500 : 200 });
});
