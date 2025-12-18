// supabase/functions/stripe-webhook/index.ts
// Edge Function to handle Stripe webhook events
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.5.0?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!

Deno.serve(async (req) => {
  const signature = req.headers.get('Stripe-Signature')!
  const body = await req.text()

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message)
    return new Response(
      JSON.stringify({ error: `Webhook Error: ${err.message}` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session

      const orderId = session.metadata?.order_id
      if (!orderId) {
        console.error('No order_id in session metadata')
        break
      }

      // Update order status to paid
      const { error: updateError } = await supabaseAdmin
        .from('orders')
        .update({
          status: 'paid',
          stripe_payment_intent: session.payment_intent as string,
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId)

      if (updateError) {
        console.error('Error updating order:', updateError)
      } else {
        console.log(`Order ${orderId} marked as paid`)

        // Get order details for notification
        const { data: order } = await supabaseAdmin
          .from('orders')
          .select(`
            *,
            assets:asset_id (name, stockx_sku)
          `)
          .eq('id', orderId)
          .single()

        if (order) {
          // Log the order for manual fulfillment
          console.log('=== NEW ORDER RECEIVED ===')
          console.log(`Order ID: ${order.id}`)
          console.log(`Asset: ${(order.assets as any)?.name}`)
          console.log(`Size: ${order.size}`)
          console.log(`Amount: $${(order.amount_cents / 100).toFixed(2)}`)
          console.log(`StockX SKU: ${(order.assets as any)?.stockx_sku}`)
          console.log(`Customer Email: ${session.customer_email}`)
          console.log('=========================')

          // TODO: Send notification email/SMS to yourself
          // You could add a simple email notification here using a service like Resend
        }
      }
      break
    }

    case 'checkout.session.expired': {
      const session = event.data.object as Stripe.Checkout.Session
      const orderId = session.metadata?.order_id

      if (orderId) {
        // Mark order as expired/cancelled
        await supabaseAdmin
          .from('orders')
          .update({
            status: 'cancelled',
            updated_at: new Date().toISOString(),
          })
          .eq('id', orderId)

        console.log(`Order ${orderId} expired/cancelled`)
      }
      break
    }

    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent
      console.log(`Payment failed for intent: ${paymentIntent.id}`)
      // Could update order status to 'payment_failed' if needed
      break
    }

    default:
      console.log(`Unhandled event type: ${event.type}`)
  }

  return new Response(
    JSON.stringify({ received: true }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
})
