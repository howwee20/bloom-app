// supabase/functions/notify-redemption/index.ts
// Edge Function to send founder notification email via Resend when user requests redemption

interface RedemptionNotification {
  token_id: string;
  product_name: string;
  size: string;
  shipping_name: string;
  shipping_address: string;
  customer_email: string;
}

Deno.serve(async (req) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) {
    console.error('RESEND_API_KEY not configured');
    return new Response(
      JSON.stringify({ error: 'Notification service not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const redemption: RedemptionNotification = await req.json();

    // Build the email body
    const emailBody = `
Redemption request received!

TOKEN DETAILS
─────────────────────────────
Token ID: ${redemption.token_id}
Product: ${redemption.product_name}
Size: ${redemption.size}

SHIP TO
─────────────────────────────
${redemption.shipping_name}
${redemption.shipping_address}

CUSTOMER
─────────────────────────────
Email: ${redemption.customer_email}

─────────────────────────────
Action: Ship item from Bloom Vault to customer address

View in Supabase: https://supabase.com/dashboard/project/idsirmgnimjbvehwdtag/editor

Time: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET
`;

    // Send email via Resend
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Bloom <orders@bloom.com>',
        to: ['founder@bloom.com'], // Replace with actual founder email
        subject: `Redemption Request: ${redemption.product_name} - Size ${redemption.size}`,
        text: emailBody,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Resend API error:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to send notification' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const result = await response.json();
    console.log('Redemption notification sent:', result.id);

    return new Response(
      JSON.stringify({ success: true, email_id: result.id }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error sending redemption notification:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
