import { DEFAULT_USDC_BASE_ADDRESS, USDC_BASE_UNITS_PER_CENT } from './constants';

type RpcLog = {
  address: string;
  data: string;
  topics: string[];
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
};

export function normalizeAddress(address: string) {
  if (!address) return '';
  const trimmed = address.trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('0x')) return lower;
  return `0x${lower}`;
}

export function hexToBigInt(value: string | null | undefined): bigint {
  if (!value || value === '0x') return 0n;
  return BigInt(value);
}

export function baseUnitsToCents(amountBaseUnits: bigint): bigint {
  if (amountBaseUnits <= 0n) return 0n;
  return amountBaseUnits / USDC_BASE_UNITS_PER_CENT;
}

function padHex32(value: string) {
  const stripped = value.replace(/^0x/, '').toLowerCase();
  return stripped.padStart(64, '0');
}

export function encodeBalanceOf(address: string) {
  const methodId = '70a08231';
  const padded = padHex32(normalizeAddress(address).replace(/^0x/, ''));
  return `0x${methodId}${padded}`;
}

export function encodeTransfer(to: string, amountBaseUnits: bigint) {
  const methodId = 'a9059cbb';
  const paddedTo = padHex32(normalizeAddress(to).replace(/^0x/, ''));
  const paddedAmount = padHex32(amountBaseUnits.toString(16));
  return `0x${methodId}${paddedTo}${paddedAmount}`;
}

export function parseTransferLog(log: RpcLog) {
  const fromTopic = log.topics?.[1] || '';
  const toTopic = log.topics?.[2] || '';
  const from = normalizeAddress(`0x${fromTopic.slice(-40)}`);
  const to = normalizeAddress(`0x${toTopic.slice(-40)}`);
  const amountBaseUnits = hexToBigInt(log.data);
  return {
    from,
    to,
    amountBaseUnits,
    txHash: log.transactionHash,
    logIndex: Number(hexToBigInt(log.logIndex)),
    blockNumber: Number(hexToBigInt(log.blockNumber)),
    tokenAddress: normalizeAddress(log.address || DEFAULT_USDC_BASE_ADDRESS),
  };
}

export type { RpcLog };
