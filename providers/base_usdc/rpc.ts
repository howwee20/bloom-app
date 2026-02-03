import { BASE_CHAIN_NAME, DEFAULT_USDC_BASE_ADDRESS } from './constants';
import { encodeBalanceOf, normalizeAddress } from './normalize';

export type HeadBlock = {
  blockNumber: number;
  blockTime: string;
  blockTimestamp: number;
};

export type TxReceipt = {
  status: 'success' | 'failed';
  blockNumber: number;
  blockTime: string;
  confirmations: number;
};

export class BaseUsdcRpcClient {
  private url: string;

  constructor(url?: string) {
    const resolved = url || process.env.BASE_RPC_URL;
    if (!resolved) {
      throw new Error('Missing BASE_RPC_URL');
    }
    this.url = resolved;
  }

  private async request<T>(method: string, params: unknown[] = []): Promise<T> {
    const payload = {
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    };

    const response = await fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Base RPC ${method} failed with ${response.status}`);
    }

    const body = await response.json();
    if (body.error) {
      throw new Error(body.error.message || `Base RPC ${method} failed`);
    }
    return body.result as T;
  }

  private toRpcHex(value: number) {
    return `0x${value.toString(16)}`;
  }

  async getHead(): Promise<HeadBlock> {
    const block = await this.request<{ number: string; timestamp: string }>('eth_getBlockByNumber', ['latest', false]);
    const blockNumber = Number(BigInt(block.number));
    const timestamp = Number(BigInt(block.timestamp));
    const blockTime = new Date(timestamp * 1000).toISOString();
    return { blockNumber, blockTime, blockTimestamp: timestamp };
  }

  async getBlockTime(blockNumber: number) {
    const block = await this.request<{ timestamp: string }>('eth_getBlockByNumber', [this.toRpcHex(blockNumber), false]);
    const timestamp = Number(BigInt(block.timestamp));
    return {
      timestamp,
      blockTime: new Date(timestamp * 1000).toISOString(),
    };
  }

  async getBalanceOfUSDC(address: string): Promise<bigint> {
    const to = normalizeAddress(process.env.USDC_BASE_ADDRESS || DEFAULT_USDC_BASE_ADDRESS);
    const data = encodeBalanceOf(address);
    const response = await this.request<string>('eth_call', [{ to, data }, 'latest']);
    return response ? BigInt(response) : 0n;
  }

  async getTxReceipt(txHash: string, headBlockNumber?: number): Promise<TxReceipt | null> {
    const receipt = await this.request<any>('eth_getTransactionReceipt', [txHash]);
    if (!receipt) return null;

    const blockNumber = Number(BigInt(receipt.blockNumber));
    const status = receipt.status === '0x1' ? 'success' : 'failed';
    const headBlock = typeof headBlockNumber === 'number' ? headBlockNumber : (await this.getHead()).blockNumber;
    const confirmations = Math.max(0, headBlock - blockNumber + 1);

    const block = await this.getBlockTime(blockNumber);
    return {
      status,
      blockNumber,
      blockTime: block.blockTime,
      confirmations,
    };
  }

  async sendRawTransaction(rawTx: string): Promise<string> {
    return this.request<string>('eth_sendRawTransaction', [rawTx]);
  }

  async getLogs(params: { fromBlock: number; toBlock: number; address: string; topics: string[] }) {
    return this.request<any[]>('eth_getLogs', [{
      fromBlock: this.toRpcHex(params.fromBlock),
      toBlock: this.toRpcHex(params.toBlock),
      address: normalizeAddress(params.address),
      topics: params.topics,
    }]);
  }
}

export const BASE_RPC_PROVIDER = BASE_CHAIN_NAME;
