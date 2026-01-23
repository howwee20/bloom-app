let logged = false;

type AdapterStatus = {
  name: string;
  mode: 'mock' | 'real';
};

export function logAdapterSummary() {
  if (logged) return;
  logged = true;

  const statuses: AdapterStatus[] = [
    { name: 'Bank/BaaS', mode: process.env.COLUMN_API_KEY ? 'real' : 'mock' },
    { name: 'Card Processor', mode: process.env.CARD_PROCESSOR_API_KEY ? 'real' : 'mock' },
    { name: 'Brokerage', mode: process.env.ALPACA_API_KEY ? 'real' : 'mock' },
    { name: 'Crypto', mode: (process.env.COINBASE_API_KEY || process.env.ZEROHASH_API_KEY) ? 'real' : 'mock' },
  ];

  const summary = statuses.map((s) => `${s.name}: ${s.mode}`).join(' | ');
  console.log(`[Bloom] Adapter modes -> ${summary}`);
}
