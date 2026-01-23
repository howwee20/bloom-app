import { ExternalLinkService } from './externalLinks';
import {
  getBankAccountBalance,
  getCard,
  getEntity,
  isColumnConfigured,
} from './integrations/columnClient';

export type DirectDepositDetails = {
  bank_account_id: string;
  routing_number: string;
  account_number: string;
  account_number_last4: string;
  account_type: string;
  account_name: string | null;
};

export type CardStatusDetails = {
  card_id: string;
  status: string;
  last4: string;
  type: string;
  network: string | null;
};

export class AccountService {
  private externalLinks = new ExternalLinkService();

  async getDirectDepositDetails(userId: string): Promise<DirectDepositDetails> {
    const link = await this.externalLinks.getLink(userId, 'column');
    if (!link?.bank_account_id) {
      throw new Error('No Column bank account linked. Run column:import.');
    }

    if (!isColumnConfigured()) {
      throw new Error('COLUMN_API_KEY not configured');
    }

    const response = await getBankAccountBalance(link.bank_account_id);
    if (!response.ok) {
      throw new Error(`Column GET bank account failed (${response.status})`);
    }

    const account = response.data;
    let accountName: string | null = null;
    if (link.entity_id) {
      const entity = await getEntity(link.entity_id);
      if (entity.ok) {
        accountName = entity.data.person
          ? `${entity.data.person.first_name} ${entity.data.person.last_name}`
          : entity.data.business?.legal_name ?? null;
      }
    }

    return {
      bank_account_id: account.id,
      routing_number: account.routing_number,
      account_number: account.account_number,
      account_number_last4: account.account_number?.slice(-4) || '0000',
      account_type: account.type,
      account_name: accountName,
    };
  }

  async getCardStatus(userId: string): Promise<CardStatusDetails> {
    const link = await this.externalLinks.getLink(userId, 'column');
    if (!link?.card_id) {
      throw new Error('No Column card linked. Run column:import.');
    }

    if (!isColumnConfigured()) {
      throw new Error('COLUMN_API_KEY not configured');
    }

    const response = await getCard(link.card_id);
    if (!response.ok) {
      throw new Error(`Column GET card failed (${response.status})`);
    }

    const card = response.data;
    const metadata = link.metadata_json || {};

    return {
      card_id: card.id,
      status: card.status,
      last4: card.last_four,
      type: card.type,
      network: typeof metadata.card_network === 'string' ? metadata.card_network : null,
    };
  }
}
