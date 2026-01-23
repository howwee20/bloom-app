const COLUMN_API_KEY = process.env.COLUMN_API_KEY;
const COLUMN_BASE_URL = process.env.COLUMN_BASE_URL || 'https://api.column.com';

export function isColumnConfigured(): boolean {
  return !!COLUMN_API_KEY;
}

export async function columnRequest<T = unknown>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: unknown
): Promise<{ ok: boolean; status: number; data: T }> {
  if (!COLUMN_API_KEY) {
    throw new Error('COLUMN_API_KEY is not configured');
  }

  // Column uses Basic auth with empty username and API key as password
  const auth = Buffer.from(`:${COLUMN_API_KEY}`).toString('base64');

  const res = await fetch(`${COLUMN_BASE_URL}${path}`, {
    method,
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    data = text as unknown as T;
  }

  return { ok: res.ok, status: res.status, data };
}

// Entity types
export type ColumnEntity = {
  id: string;
  type: 'PERSON' | 'BUSINESS';
  status: string;
  created_at: string;
  person?: {
    first_name: string;
    last_name: string;
    email: string;
  };
  business?: {
    legal_name: string;
  };
};

// Bank account types
export type ColumnBankAccount = {
  id: string;
  entity_id: string;
  type: string;
  status: string;
  routing_number: string;
  account_number: string;
  balances: {
    available_amount: number;
    pending_amount: number;
    locked_amount: number;
  };
  created_at: string;
};

// Card types
export type ColumnCard = {
  id: string;
  bank_account_id: string;
  type: 'VIRTUAL' | 'PHYSICAL';
  status: string;
  last_four: string;
  expiration_month: number;
  expiration_year: number;
  created_at: string;
};

// API methods
export async function listEntities() {
  return columnRequest<{ entities: ColumnEntity[]; has_more: boolean }>('/entities');
}

export async function createPersonEntity(data: {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  ssn_last_four?: string;
  date_of_birth?: string;
  address?: {
    line_1: string;
    city: string;
    state: string;
    postal_code: string;
    country_code: string;
  };
}) {
  return columnRequest<ColumnEntity>('/entities', 'POST', {
    type: 'PERSON',
    person: data,
  });
}

export async function listBankAccounts(entityId?: string) {
  const path = entityId ? `/bank-accounts?entity_id=${entityId}` : '/bank-accounts';
  return columnRequest<{ bank_accounts: ColumnBankAccount[]; has_more: boolean }>(path);
}

export async function createBankAccount(entityId: string, type = 'CHECKING') {
  return columnRequest<ColumnBankAccount>('/bank-accounts', 'POST', {
    entity_id: entityId,
    type,
  });
}

export async function getBankAccountBalance(accountId: string) {
  return columnRequest<ColumnBankAccount>(`/bank-accounts/${accountId}`);
}

export async function listCards(bankAccountId?: string) {
  const path = bankAccountId ? `/cards?bank_account_id=${bankAccountId}` : '/cards';
  return columnRequest<{ cards: ColumnCard[]; has_more: boolean }>(path);
}

export async function createVirtualCard(bankAccountId: string) {
  return columnRequest<ColumnCard>('/cards', 'POST', {
    bank_account_id: bankAccountId,
    type: 'VIRTUAL',
  });
}

export async function getCard(cardId: string) {
  return columnRequest<ColumnCard>(`/cards/${cardId}`);
}

// ACH transfers
export type ColumnAchTransfer = {
  id: string;
  bank_account_id: string;
  amount: number;
  direction: 'CREDIT' | 'DEBIT';
  status: string;
  created_at: string;
};

export async function listAchTransfers(bankAccountId?: string) {
  const path = bankAccountId ? `/transfers/ach?bank_account_id=${bankAccountId}` : '/transfers/ach';
  return columnRequest<{ ach_transfers: ColumnAchTransfer[]; has_more: boolean }>(path);
}
