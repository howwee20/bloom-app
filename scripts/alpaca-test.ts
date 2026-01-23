import 'dotenv/config';
import { AlpacaBrokerageAdapter } from '../lib/engine/integrations/brokerage';

async function run() {
  const symbol = process.env.BLOOM_STOCK_TICKER
    || process.env.BLOOM_DEFAULT_ETF_SYMBOL
    || 'SPY';

  const adapter = new AlpacaBrokerageAdapter();
  const quote = await adapter.getQuote(symbol);

  console.log(`Alpaca quote for ${symbol}: $${(quote.price_cents / 100).toFixed(2)}`);
}

run().catch((error) => {
  console.error('Alpaca test failed:', error);
  process.exit(1);
});
