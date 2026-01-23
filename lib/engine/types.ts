export type LedgerPostingInput = {
  ledger_account_id: string;
  direction: 'debit' | 'credit';
  amount_cents: number;
};

export type JournalEntryInput = {
  user_id: string;
  external_source: string;
  external_id: string;
  memo?: string | null;
  postings: LedgerPostingInput[];
};

export type ReceiptInput = {
  user_id: string;
  type: string;
  title: string;
  subtitle?: string | null;
  amount_cents: number;
  occurred_at?: string;
  metadata?: Record<string, unknown>;
};

export type CommandPreview = {
  action:
    | 'buy'
    | 'sell'
    | 'convert'
    | 'transfer'
    | 'balance'
    | 'breakdown'
    | 'support'
    | 'dd_details'
    | 'card_status'
    | 'card_freeze'
    | 'card_unfreeze'
    | 'set_buffer'
    | 'allocate'
    | 'holdings'
    | 'btc_quote'
    | 'stock_quote';
  symbol?: string;
  notional_cents?: number;
  allocation_targets?: { stocks_pct: number; btc_pct: number };
  preview_title: string;
  preview_body: string;
  confirm_required: boolean;
  idempotency_key: string;
};

export type CommandConfirmRequest = {
  action: CommandPreview['action'];
  symbol?: string;
  notional_cents?: number;
  allocation_targets?: { stocks_pct: number; btc_pct: number };
  idempotency_key: string;
};
