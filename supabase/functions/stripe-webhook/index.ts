// supabase/functions/stripe-webhook/index.ts
// Edge Function to handle Stripe webhook events
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.5.0?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!

// Handle token exchange purchases (user-to-user trades)
async function handleTokenExchange(session: Stripe.Checkout.Session, supabaseAdmin: any) {
  const tradeId = session.metadata?.trade_id;
  const tokenId = session.metadata?.token_id;
  const sellerId = session.metadata?.seller_id;
  const buyerId = session.metadata?.buyer_id;

  if (!tradeId || !tokenId || !sellerId || !buyerId) {
    console.error('Missing metadata for token exchange');
    return;
  }

  try {
    // Update trade record
    const { error: tradeError } = await supabaseAdmin
      .from('token_trades')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', tradeId);

    if (tradeError) {
      console.error('Error updating trade:', tradeError);
      return;
    }

    // Get token details for transfer
    const { data: token } = await supabaseAdmin
      .from('tokens')
      .select('*')
      .eq('id', tokenId)
      .single();

    if (!token) {
      console.error('Token not found for transfer');
      return;
    }

    // Transfer token ownership to buyer
    const { error: transferError } = await supabaseAdmin
      .from('tokens')
      .update({
        user_id: buyerId,
        is_listed_for_sale: false,
        listing_price: null,
        listed_at: null,
        status: 'in_custody', // Buyer now owns it, in custody
        purchase_price: token.listing_price, // Update purchase price to what buyer paid
        purchase_date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', tokenId);

    if (transferError) {
      console.error('Error transferring token:', transferError);
      return;
    }

    // Create transfer record for provenance tracking
    await supabaseAdmin
      .from('token_transfers')
      .insert({
        token_id: tokenId,
        from_user_id: sellerId,
        to_user_id: buyerId,
        transfer_type: 'exchange_sale',
        sale_price: token.listing_price,
      });

    console.log('=== TOKEN EXCHANGE COMPLETED ===');
    console.log(`Trade ID: ${tradeId}`);
    console.log(`Token ID: ${tokenId}`);
    console.log(`Product: ${token.product_name}`);
    console.log(`Size: ${token.size}`);
    console.log(`Sale Price: $${token.listing_price}`);
    console.log(`Seller: ${sellerId}`);
    console.log(`Buyer: ${buyerId}`);
    console.log('================================');

  } catch (error) {
    console.error('Error in handleTokenExchange:', error);
  }
}

Deno.serve(async (req) => {
  const signature = req.headers.get('Stripe-Signature')!
  const body = await req.text()

  let event: Stripe.Event

  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret)
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

      // Check if this is a token exchange purchase
      if (session.metadata?.type === 'token_exchange') {
        await handleTokenExchange(session, supabaseAdmin);
        break;
      }

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

        // Get order details for token creation and notification
        const { data: order } = await supabaseAdmin
          .from('orders')
          .select(`
            *,
            assets:asset_id (name, stockx_sku, image_url, custody_status)
          `)
          .eq('id', orderId)
          .single()

        if (order) {
          // Determine token status based on asset custody
          // - 'in_vault' items are instant: token is immediately active and tradeable
          // - 'available_to_acquire' items need to be purchased: token starts as acquiring
          const assetCustody = (order.assets as any)?.custody_status;
          const isInstant = assetCustody === 'in_vault';
          const tokenStatus = isInstant ? 'in_custody' : 'acquiring';
          const exchangeEligible = isInstant; // Only instant items are immediately tradeable

          // Create token record for this purchase (ownership-first model)
          const tokenData = {
            user_id: order.user_id,
            order_id: order.id,
            sku: (order.assets as any)?.stockx_sku || 'UNKNOWN',
            product_name: (order.assets as any)?.name || 'Unknown Product',
            size: order.size,
            product_image_url: (order.assets as any)?.image_url,
            purchase_price: order.amount_cents / 100,
            purchase_date: new Date().toISOString(),
            custody_type: 'bloom', // All tokens are Bloom custody
            is_exchange_eligible: exchangeEligible,
            current_value: order.amount_cents / 100, // Initial value = purchase price
            value_updated_at: new Date().toISOString(),
            status: tokenStatus,
          };

          const { data: token, error: tokenError } = await supabaseAdmin
            .from('tokens')
            .insert(tokenData)
            .select()
            .single();

          if (tokenError) {
            console.error('Token creation error:', tokenError);
          } else {
            // Create initial transfer record (provenance tracking)
            await supabaseAdmin
              .from('token_transfers')
              .insert({
                token_id: token.id,
                from_user_id: null, // NULL = initial grant
                to_user_id: order.user_id,
                transfer_type: 'initial_grant',
                sale_price: order.amount_cents / 100,
              });

            console.log(`Token ${token.id} created for order ${order.id}`);
          }

          // Log the order for manual fulfillment (ownership-first model)
          console.log('=== NEW OWNERSHIP PURCHASE ===')
          console.log(`Order ID: ${order.id}`)
          console.log(`Asset: ${(order.assets as any)?.name}`)
          console.log(`Size: ${order.size}`)
          console.log(`Amount: $${(order.amount_cents / 100).toFixed(2)}`)
          console.log(`StockX SKU: ${(order.assets as any)?.stockx_sku}`)
          console.log(`Customer Email: ${session.customer_email}`)
          console.log(`Token Status: acquiring`)
          console.log('==============================')

          // Send notification email to founder via Resend (ownership-first)
          try {
            const notificationPayload = {
              order_id: order.id,
              product_name: (order.assets as any)?.name || 'Unknown Product',
              size: order.size,
              sku: (order.assets as any)?.stockx_sku || 'UNKNOWN',
              amount_cents: order.amount_cents,
              customer_email: session.customer_email || 'unknown',
            };

            const notifyResponse = await fetch(
              `${Deno.env.get('SUPABASE_URL')}/functions/v1/notify-founder`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                },
                body: JSON.stringify(notificationPayload),
              }
            );

            if (notifyResponse.ok) {
              console.log('Founder notification sent successfully');
            } else {
              console.error('Failed to send founder notification:', await notifyResponse.text());
            }
          } catch (notifyError) {
            console.error('Error sending founder notification:', notifyError);
            // Don't fail the webhook if notification fails
          }
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
