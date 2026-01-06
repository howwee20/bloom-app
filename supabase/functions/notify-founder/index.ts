// supabase/functions/notify-founder/index.ts
// Edge Function to send founder notification email via Resend when order is paid

// Ownership-first model: all purchases are ownership tokens
interface OrderNotification {
  order_id: string;
  product_name: string;
  size: string;
  sku: string;
  amount_cents: number;
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
    const order: OrderNotification = await req.json();

    // Format the amount
    const formattedAmount = `$${(order.amount_cents / 100).toFixed(2)}`;

    // Build the email body (ownership-first model)
    const emailBody = `
New ownership purchase!

ORDER DETAILS
─────────────────────────────
Order ID: ${order.order_id}
Status: Acquiring

PRODUCT
─────────────────────────────
Name: ${order.product_name}
Size: ${order.size}
SKU: ${order.sku}

PAYMENT
─────────────────────────────
Amount: ${formattedAmount}
Customer: ${order.customer_email}

─────────────────────────────
Action: Purchase from StockX and ship to Bloom Vault

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
        subject: `New Ownership: ${order.product_name} - ${formattedAmount}`,
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
    console.log('Notification sent:', result.id);

    return new Response(
      JSON.stringify({ success: true, email_id: result.id }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error sending notification:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
