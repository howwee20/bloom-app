// supabase/functions/create-checkout/index.ts
// Edge Function to create Stripe checkout sessions with staleness protection
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

// Default config values (used if database config unavailable)
const DEFAULT_STALE_MINUTES = 240; // 4 hours
const DEFAULT_QUOTE_EXPIRATION_MINUTES = 10;

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { asset_id, size, success_url, cancel_url } = await req.json()

    if (!asset_id || !size) {
      return new Response(
        JSON.stringify({ error: 'asset_id and size are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

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

    // Get asset details using service role
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Fetch pricing config for staleness threshold
    const { data: pricingConfig } = await supabaseAdmin
      .from('pricing_config')
      .select('stale_minutes, quote_expiration_minutes')
      .single()

    const staleMinutes = pricingConfig?.stale_minutes || DEFAULT_STALE_MINUTES;
    const quoteExpirationMinutes = pricingConfig?.quote_expiration_minutes || DEFAULT_QUOTE_EXPIRATION_MINUTES;

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

    // STALENESS CHECK: Fail closed if price is too old
    if (asset.last_price_update) {
      const lastUpdate = new Date(asset.last_price_update);
      const minutesSinceUpdate = (Date.now() - lastUpdate.getTime()) / 60000;

      if (minutesSinceUpdate > staleMinutes) {
        return new Response(
          JSON.stringify({
            error: 'Price is stale',
            message: 'This item\'s price needs to be refreshed. Please try again later.',
            stale: true,
            minutes_since_update: Math.round(minutesSinceUpdate),
            threshold_minutes: staleMinutes,
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    } else {
      // No price update timestamp = fail closed
      return new Response(
        JSON.stringify({
          error: 'Price not available',
          message: 'This item\'s price has not been set yet.',
          stale: true,
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Convert price to cents
    const amountCents = Math.round(asset.price * 100)

    // Calculate quote expiration time
    const quoteExpiresAt = new Date(Date.now() + quoteExpirationMinutes * 60 * 1000);

    // Create order record with quote expiration
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        user_id: user.id,
        asset_id: asset.id,
        size: size,
        amount_cents: amountCents,
        quote_expires_at: quoteExpiresAt.toISOString(),
        status: 'pending_payment',
      })
      .select()
      .single()

    if (orderError) {
      console.error('Order creation error:', orderError)
      return new Response(
        JSON.stringify({ error: 'Failed to create order' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: asset.name,
              description: `Size ${size} - Ships to Bloom Vault`,
              images: asset.image_url ? [asset.image_url] : [],
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: success_url || 'bloomapp://checkout/success',
      cancel_url: cancel_url || 'bloomapp://checkout/cancel',
      metadata: {
        order_id: order.id,
        asset_id: asset.id,
        user_id: user.id,
        size: size,
      },
      customer_email: user.email,
    })

    // Update order with Stripe session ID
    await supabaseAdmin
      .from('orders')
      .update({ stripe_session_id: session.id })
      .eq('id', order.id)

    return new Response(
      JSON.stringify({
        session_id: session.id,
        url: session.url,
        order_id: order.id,
        quote_expires_at: quoteExpiresAt.toISOString(),
        price_quoted: asset.price,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Checkout error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
