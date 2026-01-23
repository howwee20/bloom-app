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
  action: 'buy' | 'sell' | 'convert' | 'transfer' | 'balance' | 'breakdown' | 'support';
  symbol?: string;
  notional_cents?: number;
  preview_title: string;
  preview_body: string;
  confirm_required: boolean;
  idempotency_key: string;
};

export type CommandConfirmRequest = {
  action: CommandPreview['action'];
  symbol?: string;
  notional_cents?: number;
  idempotency_key: string;
};
