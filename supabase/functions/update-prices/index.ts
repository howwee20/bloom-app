// supabase/functions/update-prices/index.ts
// Edge Function to fetch and update StockX prices (real data only)
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const path = url.pathname.replace('/update-prices', '')

  try {
    // Health check endpoint
    if (req.method === 'GET' && (path === '' || path === '/')) {
      return new Response(JSON.stringify({
        status: 'ok',
        message: 'Price update function ready',
        timestamp: new Date().toISOString(),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // All update endpoint
    if (req.method === 'POST' && path === '/all') {
      const start = Date.now()

      // Get environment variables
      const supabaseUrl = Deno.env.get('SUPABASE_URL')
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      const stockxApiKey = Deno.env.get('STOCKX_API_KEY')
      const stockxClientId = Deno.env.get('STOCKX_CLIENT_ID')

      const envCheck = {
        SUPABASE_URL: !!supabaseUrl,
        SUPABASE_SERVICE_ROLE_KEY: !!serviceKey,
        STOCKX_API_KEY: !!stockxApiKey,
        STOCKX_CLIENT_ID: !!stockxClientId,
      }

      const supabaseAdmin = createClient(supabaseUrl!, serviceKey!)

      // Fetch one asset to verify DB connection
      const { data: asset, error } = await supabaseAdmin
        .from('assets')
        .select('id, name, stockx_sku, price')
        .not('stockx_sku', 'is', null)
        .limit(1)
        .single()

      return new Response(JSON.stringify({
        ok: true,
        env_check: envCheck,
        test_asset: asset,
        db_error: error?.message || null,
        durationMs: Date.now() - start,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
