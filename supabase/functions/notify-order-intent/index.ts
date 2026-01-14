// supabase/functions/notify-order-intent/index.ts
// Edge Function to send Slack notification when a new order intent is created

interface OrderIntentNotification {
  order_id: string;
  shoe_name: string;
  style_code: string;
  size: string;
  route: 'home' | 'bloom';
  quoted_total: number | null;
  max_total: number;
  email: string | null;
  marketplace: string | null;
  source_url: string | null;
}

Deno.serve(async (req) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const slackWebhookUrl = Deno.env.get('SLACK_WEBHOOK_URL');

  // If no Slack webhook configured, just return success (don't block order)
  if (!slackWebhookUrl) {
    console.log('SLACK_WEBHOOK_URL not configured, skipping notification');
    return new Response(
      JSON.stringify({ success: true, skipped: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const order: OrderIntentNotification = await req.json();

    // Format amounts
    const quotedTotalFormatted = order.quoted_total
      ? `$${order.quoted_total.toFixed(2)}`
      : 'N/A';
    const maxTotalFormatted = `$${order.max_total.toFixed(2)}`;
    const routeLabel = order.route === 'bloom' ? 'Ship to Bloom' : 'Ship to me';
    const marketplaceLabel = order.marketplace?.toUpperCase() || 'Unknown';

    // Build Slack message blocks
    const blocks: any[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🆕 NEW ORDER INTENT',
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Shoe:*\n${order.shoe_name}`,
          },
          {
            type: 'mrkdwn',
            text: `*Style Code:*\n${order.style_code}`,
          },
        ],
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Size:*\n${order.size}`,
          },
          {
            type: 'mrkdwn',
            text: `*Route:*\n${routeLabel}`,
          },
        ],
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Source:*\n${marketplaceLabel}`,
          },
          {
            type: 'mrkdwn',
            text: `*Quoted Total:*\n${quotedTotalFormatted}`,
          },
        ],
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Max Approved:*\n${maxTotalFormatted}`,
          },
          {
            type: 'mrkdwn',
            text: `*User:*\n${order.email || 'N/A'}`,
          },
        ],
      },
    ];

    // Add clickable source URL if available
    if (order.source_url) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🔗 *<${order.source_url}|BUY HERE - Click to Purchase>*`,
        },
      });
    }

    blocks.push(
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Order ID:*\n\`${order.order_id}\``,
          },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `⏰ ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`,
          },
        ],
      },
      {
        type: 'divider',
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '👆 *Action Required:* Click the link above, buy the item, and update status in admin.',
        },
      }
    );

    // Build Slack message
    const slackMessage = {
      text: `🆕 NEW ORDER INTENT - ${order.shoe_name} (${marketplaceLabel})`,
      blocks,
    };

    // Send to Slack
    const response = await fetch(slackWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(slackMessage),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Slack webhook error:', error);
      // Don't fail the request - order was already created
      return new Response(
        JSON.stringify({ success: true, slack_error: error }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('Slack notification sent for order:', order.order_id);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error sending Slack notification:', error);
    // Don't fail the request - order was already created
    return new Response(
      JSON.stringify({ success: true, error: 'Notification failed but order created' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
