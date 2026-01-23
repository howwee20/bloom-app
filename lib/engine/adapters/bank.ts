import { ColumnAdapter } from '../integrations/column';

export type BankBalanceTruth = {
  cash_balance_cents: number;
};

export interface BankAdapter {
  createAccount(userId: string): Promise<{ ok: boolean; provider: string; account_id: string | null }>;
  getBalanceTruth(userId: string): Promise<BankBalanceTruth>;
}

export class ColumnBankAdapter implements BankAdapter {
  private column = new ColumnAdapter();

  async createAccount(userId: string) {
    return this.column.createAccount();
  }

  async getBalanceTruth(userId: string) {
    return this.column.getBalanceTruth(userId);
  }
}

export class MockBankAdapter implements BankAdapter {
  async createAccount() {
    return { ok: true, provider: 'mock', account_id: 'mock-account' };
  }

  async getBalanceTruth() {
    return { cash_balance_cents: 0 };
  }
}

export function getBankAdapter() {
  if (process.env.COLUMN_API_KEY) {
    return new ColumnBankAdapter();
  }
  return new MockBankAdapter();
}
