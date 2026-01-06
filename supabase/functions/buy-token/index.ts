// supabase/functions/buy-token/index.ts
// Edge Function to buy a token from another user on the exchange
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

const PLATFORM_FEE_PERCENT = 0.03; // 3% platform fee

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { token_id, success_url, cancel_url } = await req.json()

    if (!token_id) {
      return new Response(
        JSON.stringify({ error: 'token_id is required' }),
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

    // Get token details using service role
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: token, error: tokenError } = await supabaseAdmin
      .from('tokens')
      .select('*')
      .eq('id', token_id)
      .eq('is_listed_for_sale', true)
      .eq('status', 'listed')
      .single()

    if (tokenError || !token) {
      return new Response(
        JSON.stringify({ error: 'Token not found or not for sale' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Prevent buying own token
    if (token.user_id === user.id) {
      return new Response(
        JSON.stringify({ error: 'Cannot buy your own token' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Calculate fees
    const listingPrice = Number(token.listing_price);
    const platformFee = Math.round(listingPrice * PLATFORM_FEE_PERCENT * 100) / 100;
    const totalPrice = listingPrice + platformFee;
    const totalCents = Math.round(totalPrice * 100);
    const sellerPayout = listingPrice - platformFee; // Seller pays 3% too, so 6% total

    // Create token trade record
    const { data: trade, error: tradeError } = await supabaseAdmin
      .from('token_trades')
      .insert({
        token_id: token.id,
        seller_id: token.user_id,
        buyer_id: user.id,
        sale_price: listingPrice,
        platform_fee: platformFee * 2, // Total platform fee (3% from buyer + 3% from seller)
        seller_payout: sellerPayout,
        status: 'pending',
      })
      .select()
      .single()

    if (tradeError) {
      console.error('Trade creation error:', tradeError)
      return new Response(
        JSON.stringify({ error: 'Failed to create trade' }),
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
              name: token.product_name,
              description: `Size ${token.size} - Exchange Token Purchase`,
              images: token.product_image_url ? [token.product_image_url] : [],
            },
            unit_amount: Math.round(listingPrice * 100),
          },
          quantity: 1,
        },
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Platform Fee',
              description: 'Bloom Exchange fee (3%)',
            },
            unit_amount: Math.round(platformFee * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: success_url || 'bloomapp://exchange/success',
      cancel_url: cancel_url || 'bloomapp://exchange/cancel',
      metadata: {
        trade_id: trade.id,
        token_id: token.id,
        seller_id: token.user_id,
        buyer_id: user.id,
        type: 'token_exchange',
      },
      customer_email: user.email,
    })

    // Update trade with Stripe session ID
    await supabaseAdmin
      .from('token_trades')
      .update({ stripe_payment_intent_id: session.id })
      .eq('id', trade.id)

    return new Response(
      JSON.stringify({
        session_id: session.id,
        url: session.url,
        trade_id: trade.id,
        total_price: totalPrice,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Buy token error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
