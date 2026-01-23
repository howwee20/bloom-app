let logged = false;

type AdapterStatus = {
  name: string;
  mode: 'mock' | 'real';
};

export function logAdapterSummary() {
  if (logged) return;
  logged = true;

  const alpacaConfigured = !!(process.env.ALPACA_API_KEY || process.env.ALPACA_KEY);
  const cryptoProvider = (process.env.CRYPTO_PROVIDER || 'mock').toLowerCase();
  const cryptoMode: AdapterStatus['mode'] = cryptoProvider === 'mock' ? 'mock' : 'real';

  const statuses: AdapterStatus[] = [
    { name: 'Bank/BaaS', mode: process.env.COLUMN_API_KEY ? 'real' : 'mock' },
    { name: 'Card Processor', mode: process.env.CARD_PROCESSOR_API_KEY ? 'real' : 'mock' },
    { name: 'Brokerage', mode: alpacaConfigured ? 'real' : 'mock' },
    { name: 'Crypto', mode: cryptoMode },
  ];

  const summary = statuses.map((s) => `${s.name}: ${s.mode}`).join(' | ');
  console.log(`[Bloom] Adapter modes -> ${summary}`);
}
