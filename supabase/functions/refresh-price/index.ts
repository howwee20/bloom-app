// supabase/functions/refresh-price/index.ts
// Edge Function to trigger a price refresh for a specific style code
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// StockX API for fetching prices (simplified - in production use full worker logic)
async function fetchStockXPrice(styleCode: string): Promise<{ price: number; marketplace: string } | null> {
  try {
    // StockX product search API
    const searchUrl = `https://stockx.com/api/browse?_search=${encodeURIComponent(styleCode)}&page=1&resultsPerPage=1`

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      console.log('StockX search failed:', response.status)
      return null
    }

    const data = await response.json()

    if (data.Products && data.Products.length > 0) {
      const product = data.Products[0]
      // Get lowest ask price
      const lowestAsk = product.market?.lowestAsk || product.retailPrice

      if (lowestAsk && lowestAsk > 0) {
        return {
          price: lowestAsk,
          marketplace: 'stockx',
        }
      }
    }

    return null
  } catch (e) {
    console.error('StockX fetch error:', e)
    return null
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { style_code, size, request_id } = await req.json()

    if (!style_code) {
      return new Response(
        JSON.stringify({ error: 'style_code is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user from auth header (optional - can be anonymous)
    const authHeader = req.headers.get('Authorization')
    let userId = null

    if (authHeader) {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      )

      const { data: { user } } = await supabaseClient.auth.getUser()
      userId = user?.id
    }

    // Get admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Get current price before refresh
    const { data: currentAsset } = await supabaseAdmin
      .from('assets')
      .select('price, stockx_sku')
      .eq('stockx_sku', style_code)
      .order('updated_at_pricing', { ascending: false, nullsFirst: true })
      .limit(1)
      .maybeSingle()

    const priceBefore = currentAsset?.price || null

    // Create or get refresh request
    let refreshRequestId = request_id

    if (!refreshRequestId) {
      const { data: newRequest, error: insertError } = await supabaseAdmin
        .from('price_refresh_requests')
        .insert({
          user_id: userId,
          style_code: style_code,
          size: size,
          status: 'processing',
          request_source: 'user',
          price_before: priceBefore,
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (insertError) {
        console.error('Failed to create refresh request:', insertError)
      } else {
        refreshRequestId = newRequest?.id
      }
    } else {
      // Update existing request to processing
      await supabaseAdmin
        .from('price_refresh_requests')
        .update({
          status: 'processing',
          started_at: new Date().toISOString(),
        })
        .eq('id', refreshRequestId)
    }

    // Fetch new price from StockX
    console.log(`Refreshing price for ${style_code}...`)
    const priceResult = await fetchStockXPrice(style_code)

    let priceAfter = null
    let errorMessage = null

    if (priceResult && priceResult.price) {
      priceAfter = priceResult.price

      // Update asset with new price
      const { error: updateError } = await supabaseAdmin
        .from('assets')
        .update({
          price: priceAfter,
          price_source: priceResult.marketplace,
          updated_at_pricing: new Date().toISOString(),
          last_price_checked_at: new Date().toISOString(),
        })
        .eq('stockx_sku', style_code)

      if (updateError) {
        console.error('Failed to update asset price:', updateError)
        errorMessage = 'Failed to save price'
      } else {
        console.log(`Updated ${style_code} price: $${priceBefore} -> $${priceAfter}`)
      }
    } else {
      errorMessage = 'Could not fetch price from marketplace'
    }

    // Update refresh request with result
    if (refreshRequestId) {
      await supabaseAdmin
        .from('price_refresh_requests')
        .update({
          status: errorMessage ? 'failed' : 'completed',
          price_after: priceAfter,
          marketplace: priceResult?.marketplace,
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
        })
        .eq('id', refreshRequestId)
    }

    return new Response(
      JSON.stringify({
        success: !errorMessage,
        request_id: refreshRequestId,
        style_code: style_code,
        price_before: priceBefore,
        price_after: priceAfter,
        marketplace: priceResult?.marketplace,
        error: errorMessage,
        completed_at: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Refresh price error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
