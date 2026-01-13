// supabase/functions/create-payment-intent/index.ts
// Edge Function to create PaymentIntent for instant checkout with saved card
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.5.0?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const {
      order_intent_id,
      amount_cents,
      payment_method_id,
      // Optional: for direct payment without order_intent
      asset_id,
      size,
      lane,
      marketplace,
      shipping_name,
      shipping_address_line1,
      shipping_address_line2,
      shipping_city,
      shipping_state,
      shipping_zip,
      shipping_country,
    } = await req.json()

    // Get user from auth header
    const authHeader = req.headers.get('Authorization')!
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Get user's profile with Stripe info
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profile')
      .select('stripe_customer_id, stripe_default_payment_method_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.stripe_customer_id) {
      return new Response(
        JSON.stringify({ error: 'No Stripe customer found. Please add a card first.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Use provided payment_method_id or default from profile
    const pmId = payment_method_id || profile.stripe_default_payment_method_id

    if (!pmId) {
      return new Response(
        JSON.stringify({ error: 'No payment method found. Please add a card first.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let finalAmount = amount_cents
    let orderId = order_intent_id
    let orderType = 'order_intent' // or 'order'
    let productName = 'Bloom Purchase'
    let productSku = ''

    // If order_intent_id provided, get amount from there
    if (order_intent_id) {
      const { data: orderIntent, error: orderError } = await supabaseAdmin
        .from('order_intents')
        .select('*')
        .eq('id', order_intent_id)
        .eq('user_id', user.id)
        .single()

      if (orderError || !orderIntent) {
        return new Response(
          JSON.stringify({ error: 'Order intent not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Use max_total for authorization (covers price fluctuations)
      finalAmount = Math.round(orderIntent.max_total * 100)
      productName = orderIntent.shoe_name || 'Bloom Purchase'
      productSku = orderIntent.style_code || ''
    } else if (asset_id && size) {
      // Direct purchase flow - create order first
      const { data: asset, error: assetError } = await supabaseAdmin
        .from('assets')
        .select('*')
        .eq('id', asset_id)
        .single()

      if (assetError || !asset) {
        return new Response(
          JSON.stringify({ error: 'Asset not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      finalAmount = Math.round(asset.price * 100)
      productName = asset.name || 'Bloom Purchase'
      productSku = asset.stockx_sku || ''

      // Create order record (like create-checkout does)
      const normalizedLane = lane === 'a' || lane === 'b' ? lane : 'b'
      const normalizedMarketplace = (marketplace || asset.price_source || 'stockx').toString().toLowerCase()

      const { data: order, error: orderCreateError } = await supabaseAdmin
        .from('orders')
        .insert({
          user_id: user.id,
          asset_id: asset.id,
          size: size,
          amount_cents: finalAmount,
          status: 'pending_payment',
          lane: normalizedLane,
          marketplace: normalizedMarketplace,
          execution_mode: 'brokered',
          shipping_name: normalizedLane === 'a' ? shipping_name : null,
          shipping_address_line1: normalizedLane === 'a' ? shipping_address_line1 : null,
          shipping_address_line2: normalizedLane === 'a' ? shipping_address_line2 : null,
          shipping_city: normalizedLane === 'a' ? shipping_city : null,
          shipping_state: normalizedLane === 'a' ? shipping_state : null,
          shipping_zip: normalizedLane === 'a' ? shipping_zip : null,
          shipping_country: normalizedLane === 'a' ? (shipping_country || 'US') : null,
        })
        .select()
        .single()

      if (orderCreateError || !order) {
        console.error('Order creation error:', orderCreateError)
        return new Response(
          JSON.stringify({ error: 'Failed to create order' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      orderId = order.id
      orderType = 'order'
    }

    if (!finalAmount || finalAmount < 50) {
      return new Response(
        JSON.stringify({ error: 'Invalid amount' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create PaymentIntent with automatic confirmation
    const paymentIntent = await stripe.paymentIntents.create({
      amount: finalAmount,
      currency: 'usd',
      customer: profile.stripe_customer_id,
      payment_method: pmId,
      off_session: true, // Charging without customer present
      confirm: true, // Immediately attempt charge
      description: `${productName} - Size ${size || 'N/A'}`,
      metadata: {
        order_id: orderId,
        order_type: orderType,
        user_id: user.id,
        product_sku: productSku,
      },
      // Return URL for 3DS authentication if required
      return_url: 'https://bloom-app-alpha.vercel.app/checkout/complete',
    })

    // Update order/order_intent with payment info
    const updateData = {
      stripe_payment_intent_id: paymentIntent.id,
      stripe_charge_status: paymentIntent.status,
      ...(paymentIntent.status === 'succeeded' ? { paid_at: new Date().toISOString() } : {}),
    }

    if (orderType === 'order_intent') {
      await supabaseAdmin
        .from('order_intents')
        .update(updateData)
        .eq('id', orderId)
    } else {
      await supabaseAdmin
        .from('orders')
        .update({
          stripe_payment_intent: paymentIntent.id,
          stripe_charge_status: paymentIntent.status,
          ...(paymentIntent.status === 'succeeded' ? {
            status: 'paid',
            paid_at: new Date().toISOString(),
          } : {}),
        })
        .eq('id', orderId)
    }

    // Handle different payment states
    if (paymentIntent.status === 'succeeded') {
      console.log(`Payment succeeded for ${orderType} ${orderId}`)

      // Send notification for successful payment
      try {
        await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/notify-founder`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({
              order_id: orderId,
              product_name: productName,
              size: size || 'N/A',
              sku: productSku,
              amount_cents: finalAmount,
              customer_email: user.email,
              payment_method: 'instant_checkout',
            }),
          }
        )
      } catch (notifyError) {
        console.error('Notification error:', notifyError)
      }

      return new Response(
        JSON.stringify({
          success: true,
          status: 'succeeded',
          order_id: orderId,
          order_type: orderType,
          payment_intent_id: paymentIntent.id,
          amount_charged: finalAmount,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } else if (paymentIntent.status === 'requires_action') {
      // 3DS authentication required
      return new Response(
        JSON.stringify({
          success: false,
          status: 'requires_action',
          requires_action: true,
          payment_intent_id: paymentIntent.id,
          client_secret: paymentIntent.client_secret,
          next_action: paymentIntent.next_action,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } else {
      // Processing or other state
      return new Response(
        JSON.stringify({
          success: false,
          status: paymentIntent.status,
          payment_intent_id: paymentIntent.id,
          message: 'Payment is processing',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  } catch (error: any) {
    console.error('PaymentIntent error:', error)

    // Handle Stripe card errors
    if (error.type === 'StripeCardError') {
      return new Response(
        JSON.stringify({
          success: false,
          status: 'failed',
          error: error.message,
          decline_code: error.decline_code,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
