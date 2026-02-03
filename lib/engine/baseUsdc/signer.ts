import { BaseUsdcRpcClient } from '@/providers/base_usdc/rpc';
import { normalizeAddress } from '@/providers/base_usdc/normalize';
import { supabaseAdmin } from '@/lib/server/supabaseAdmin';

export type SignerTxData = {
  raw_signed_tx?: string | null;
};

export interface SignerProvider {
  getAddress(userId: string, agentId?: string | null): Promise<string | null>;
  signAndSendTx(userId: string, txData: SignerTxData): Promise<{ tx_hash: string }>;
  supportsDelegationScopes?(): boolean;
}

export class ExternalSignerProvider implements SignerProvider {
  private rpc: BaseUsdcRpcClient;

  constructor(rpc?: BaseUsdcRpcClient) {
    this.rpc = rpc || new BaseUsdcRpcClient();
  }

  async getAddress(userId: string) {
    const { data, error } = await supabaseAdmin
      .from('wallets')
      .select('address')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data?.address ? normalizeAddress(data.address) : null;
  }

  async signAndSendTx(_userId: string, txData: SignerTxData) {
    if (!txData.raw_signed_tx) {
      throw new Error('Missing signed transaction payload');
    }
    const txHash = await this.rpc.sendRawTransaction(txData.raw_signed_tx);
    return { tx_hash: txHash };
  }

  supportsDelegationScopes() {
    return false;
  }
}
