// supabase/functions/confirm-setup-intent/index.ts
// Edge Function to confirm SetupIntent and save card details
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
    const { setup_intent_id, payment_method_id } = await req.json()

    if (!setup_intent_id) {
      return new Response(
        JSON.stringify({ error: 'setup_intent_id is required' }),
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

    // Get admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Retrieve the SetupIntent to verify it succeeded
    const setupIntent = await stripe.setupIntents.retrieve(setup_intent_id)

    // Verify this SetupIntent belongs to the user
    if (setupIntent.metadata?.supabase_user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'SetupIntent does not belong to this user' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (setupIntent.status !== 'succeeded') {
      return new Response(
        JSON.stringify({
          error: 'SetupIntent not succeeded',
          status: setupIntent.status,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get the payment method (either from request or from SetupIntent)
    const pmId = payment_method_id || setupIntent.payment_method

    if (!pmId) {
      return new Response(
        JSON.stringify({ error: 'No payment method found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Retrieve payment method details
    const paymentMethod = await stripe.paymentMethods.retrieve(pmId as string)

    // Set as default payment method for customer
    await stripe.customers.update(setupIntent.customer as string, {
      invoice_settings: {
        default_payment_method: pmId as string,
      },
    })

    // Save to profile
    const cardLast4 = paymentMethod.card?.last4 || null
    const cardBrand = paymentMethod.card?.brand || null

    await supabaseAdmin.rpc('save_stripe_payment_info', {
      p_user_id: user.id,
      p_customer_id: setupIntent.customer as string,
      p_payment_method_id: pmId as string,
      p_card_last4: cardLast4,
      p_card_brand: cardBrand,
    })

    console.log(`Saved card ${cardBrand} ****${cardLast4} for user ${user.id}`)

    return new Response(
      JSON.stringify({
        success: true,
        card_last4: cardLast4,
        card_brand: cardBrand,
        payment_method_id: pmId,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('ConfirmSetupIntent error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
