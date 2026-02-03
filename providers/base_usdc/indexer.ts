import { EventStore } from '@/lib/engine/eventStore';
import { BaseUsdcKernel } from '@/lib/engine/baseUsdcKernel';
import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import { DEFAULT_USDC_BASE_ADDRESS, USDC_TRANSFER_TOPIC } from './constants';
import { upsertRpcHealth, markRpcFailure } from './health';
import { baseUnitsToCents, normalizeAddress, parseTransferLog, type RpcLog } from './normalize';
import { BaseUsdcRpcClient } from './rpc';

const CHAIN_ID = 'base';
const PROVIDER_NAME = 'base_usdc';

function resolveNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function confirmationsRequired() {
  return resolveNumber('CONFIRMATIONS_REQUIRED', 10);
}

type WalletRow = { user_id: string; address: string };

type ExecutionRow = {
  exec_id: string;
  user_id: string;
  status: string;
  tx_hash: string | null;
};

export class BaseUsdcIndexer {
  private rpc: BaseUsdcRpcClient;
  private eventStore = new EventStore();
  private kernel = new BaseUsdcKernel();

  constructor(rpc?: BaseUsdcRpcClient) {
    this.rpc = rpc || new BaseUsdcRpcClient();
  }

  private async loadWallets() {
    const { data, error } = await supabaseAdmin
      .from('wallets')
      .select('user_id, address');
    if (error) throw error;

    const map = new Map<string, string>();
    for (const row of (data || []) as WalletRow[]) {
      if (!row.address || !row.user_id) continue;
      map.set(normalizeAddress(row.address), row.user_id);
    }
    return map;
  }

  private async getCursor() {
    const { data, error } = await supabaseAdmin
      .from('onchain_cursor')
      .select('last_indexed_block')
      .eq('chain_id', CHAIN_ID)
      .maybeSingle();
    if (error) throw error;
    return data?.last_indexed_block ? Number(data.last_indexed_block) : null;
  }

  private async setCursor(blockNumber: number) {
    await supabaseAdmin
      .from('onchain_cursor')
      .upsert({
        chain_id: CHAIN_ID,
        last_indexed_block: blockNumber,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'chain_id' });
  }

  private async recordTransfer(log: RpcLog, headBlock: number, walletMap: Map<string, string>, blockTimeCache: Map<number, string>) {
    const parsed = parseTransferLog(log);
    if (!parsed.from || !parsed.to) return;
    if (parsed.from === parsed.to) return;

    const toUserId = walletMap.get(parsed.to);
    const fromUserId = walletMap.get(parsed.from);
    if (!toUserId && !fromUserId) return;

    const confirmations = Math.max(0, headBlock - parsed.blockNumber + 1);
    const confirmed = confirmations >= confirmationsRequired();

    let blockTime = blockTimeCache.get(parsed.blockNumber);
    if (!blockTime) {
      const block = await this.rpc.getBlockTime(parsed.blockNumber);
      blockTime = block.blockTime;
      blockTimeCache.set(parsed.blockNumber, blockTime);
    }

    const amountCents = baseUnitsToCents(parsed.amountBaseUnits);

    await supabaseAdmin
      .from('onchain_transfers')
      .upsert({
        chain_id: CHAIN_ID,
        block_number: parsed.blockNumber,
        tx_hash: parsed.txHash,
        log_index: parsed.logIndex,
        from_address: parsed.from,
        to_address: parsed.to,
        amount_cents: Number(amountCents),
        token_address: parsed.tokenAddress,
        occurred_at: blockTime,
        confirmed,
        confirmations,
        created_at: new Date().toISOString(),
      }, { onConflict: 'tx_hash,log_index' });

    if (!confirmed || amountCents <= 0n) return;

    if (toUserId) {
      const { event, isNew } = await this.eventStore.recordNormalizedEvent({
        source: PROVIDER_NAME,
        domain: 'crypto',
        event_type: 'FUNDS_IN',
        external_id: `${parsed.txHash}:${parsed.logIndex}`,
        user_id: toUserId,
        amount_cents: Number(amountCents),
        currency: 'USDC',
        occurred_at: blockTime,
        metadata: {
          tx_hash: parsed.txHash,
          log_index: parsed.logIndex,
          from_address: parsed.from,
          to_address: parsed.to,
          token_address: parsed.tokenAddress,
          chain_id: CHAIN_ID,
          confirmations,
          block_number: parsed.blockNumber,
        },
      });

      if (isNew) {
        await this.kernel.processNormalizedEvent(event);
      }
    }

    if (fromUserId) {
      const { event, isNew } = await this.eventStore.recordNormalizedEvent({
        source: PROVIDER_NAME,
        domain: 'crypto',
        event_type: 'FUNDS_OUT',
        external_id: `${parsed.txHash}:${parsed.logIndex}`,
        user_id: fromUserId,
        amount_cents: Number(amountCents),
        currency: 'USDC',
        occurred_at: blockTime,
        metadata: {
          tx_hash: parsed.txHash,
          log_index: parsed.logIndex,
          from_address: parsed.from,
          to_address: parsed.to,
          token_address: parsed.tokenAddress,
          chain_id: CHAIN_ID,
          confirmations,
          block_number: parsed.blockNumber,
        },
      });

      if (isNew) {
        await this.kernel.processNormalizedEvent(event);
      }
    }
  }

  private async reconcileExecutions(headBlock: number) {
    const { data, error } = await supabaseAdmin
      .from('executions')
      .select('exec_id, user_id, status, tx_hash')
      .eq('status', 'broadcast')
      .not('tx_hash', 'is', null);

    if (error) throw error;
    const executions = (data || []) as ExecutionRow[];
    if (!executions.length) return;

    for (const execution of executions) {
      if (!execution.tx_hash) continue;
      const receipt = await this.rpc.getTxReceipt(execution.tx_hash, headBlock);
      if (!receipt) continue;

      const shouldConfirm = receipt.status === 'success' && receipt.confirmations >= confirmationsRequired();
      const eventType = receipt.status === 'failed' ? 'TX_FAILED' : (shouldConfirm ? 'TX_CONFIRMED' : null);
      if (!eventType) continue;

      const { event, isNew } = await this.eventStore.recordNormalizedEvent({
        source: PROVIDER_NAME,
        domain: 'crypto',
        event_type: eventType,
        external_id: execution.exec_id,
        user_id: execution.user_id,
        status: receipt.status,
        currency: 'USDC',
        occurred_at: receipt.blockTime,
        metadata: {
          tx_hash: execution.tx_hash,
          confirmations: receipt.confirmations,
          block_number: receipt.blockNumber,
        },
      });

      if (isNew) {
        await this.kernel.processNormalizedEvent(event);
      }
    }
  }

  async tick() {
    let head;
    try {
      head = await this.rpc.getHead();
      await upsertRpcHealth(PROVIDER_NAME, head.blockTime, head.blockNumber);
    } catch (error) {
      await markRpcFailure(PROVIDER_NAME);
      throw error;
    }

    const headBlock = head.blockNumber;
    const cursor = await this.getCursor();
    const lookback = resolveNumber('BASE_INDEXER_LOOKBACK_BLOCKS', 2000);
    const reorgBuffer = resolveNumber('BASE_INDEXER_REORG_BUFFER', 20);
    const batchSize = resolveNumber('BASE_INDEXER_BATCH_SIZE', 1500);

    const startBlock = cursor === null
      ? Math.max(0, headBlock - lookback)
      : Math.max(0, cursor - reorgBuffer);

    const walletMap = await this.loadWallets();
    const blockTimeCache = new Map<number, string>();

    const usdcAddress = normalizeAddress(process.env.USDC_BASE_ADDRESS || DEFAULT_USDC_BASE_ADDRESS);

    for (let fromBlock = startBlock; fromBlock <= headBlock; fromBlock += batchSize) {
      const toBlock = Math.min(headBlock, fromBlock + batchSize - 1);
      const logs = await this.rpc.getLogs({
        fromBlock,
        toBlock,
        address: usdcAddress,
        topics: [USDC_TRANSFER_TOPIC],
      });

      for (const log of logs || []) {
        await this.recordTransfer(log as RpcLog, headBlock, walletMap, blockTimeCache);
      }
    }

    await this.reconcileExecutions(headBlock);
    await this.setCursor(headBlock);
  }
}
