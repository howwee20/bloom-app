import { BASE_CHAIN_ID, USDC_BASE_UNITS_PER_CENT, DEFAULT_USDC_BASE_ADDRESS } from '@/providers/base_usdc/constants';
import { normalizeAddress } from '@/providers/base_usdc/normalize';
import type { UsdcIntent } from './policy';

type DecodedTx = {
  type: 'legacy' | 'eip2930' | 'eip1559';
  to: string | null;
  data: string;
  value: bigint;
  chainId: bigint | null;
};

function hexToBytes(hex: string): Uint8Array {
  const stripped = hex.startsWith('0x') ? hex.slice(2) : hex;
  const normalized = stripped.length % 2 === 0 ? stripped : `0${stripped}`;
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  if (!bytes.length) return '0x';
  return `0x${Buffer.from(bytes).toString('hex')}`;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  if (!bytes.length) return 0n;
  return BigInt(bytesToHex(bytes));
}

type RlpData = Uint8Array | RlpData[];

type DecodeResult = {
  data: RlpData;
  newOffset: number;
};

function decodeItem(input: Uint8Array, offset: number): DecodeResult {
  const prefix = input[offset];
  if (prefix <= 0x7f) {
    return { data: input.slice(offset, offset + 1), newOffset: offset + 1 };
  }

  if (prefix <= 0xb7) {
    const length = prefix - 0x80;
    const start = offset + 1;
    const end = start + length;
    return { data: input.slice(start, end), newOffset: end };
  }

  if (prefix <= 0xbf) {
    const lengthOfLength = prefix - 0xb7;
    const lengthStart = offset + 1;
    const lengthEnd = lengthStart + lengthOfLength;
    const length = Number(bytesToBigInt(input.slice(lengthStart, lengthEnd)));
    const start = lengthEnd;
    const end = start + length;
    return { data: input.slice(start, end), newOffset: end };
  }

  if (prefix <= 0xf7) {
    const length = prefix - 0xc0;
    const start = offset + 1;
    const end = start + length;
    const items: RlpData[] = [];
    let cursor = start;
    while (cursor < end) {
      const result = decodeItem(input, cursor);
      items.push(result.data);
      cursor = result.newOffset;
    }
    return { data: items, newOffset: end };
  }

  const lengthOfLength = prefix - 0xf7;
  const lengthStart = offset + 1;
  const lengthEnd = lengthStart + lengthOfLength;
  const length = Number(bytesToBigInt(input.slice(lengthStart, lengthEnd)));
  const start = lengthEnd;
  const end = start + length;
  const items: RlpData[] = [];
  let cursor = start;
  while (cursor < end) {
    const result = decodeItem(input, cursor);
    items.push(result.data);
    cursor = result.newOffset;
  }
  return { data: items, newOffset: end };
}

function decodeRlp(input: Uint8Array): RlpData {
  const result = decodeItem(input, 0);
  return result.data;
}

function decodeRawTransaction(rawTx: string): DecodedTx | null {
  if (!rawTx || typeof rawTx !== 'string') return null;
  const bytes = hexToBytes(rawTx);
  if (!bytes.length) return null;

  const first = bytes[0];
  if (first === 0x01 || first === 0x02) {
    const list = decodeRlp(bytes.slice(1));
    if (!Array.isArray(list)) return null;
    const fields = list as Uint8Array[];
    const is1559 = first === 0x02;
    const toIndex = is1559 ? 5 : 4;
    const valueIndex = is1559 ? 6 : 5;
    const dataIndex = is1559 ? 7 : 6;
    const chainId = fields[0] ? bytesToBigInt(fields[0]) : null;
    const to = fields[toIndex] ? bytesToHex(fields[toIndex]) : '0x';
    const value = fields[valueIndex] ? bytesToBigInt(fields[valueIndex]) : 0n;
    const data = fields[dataIndex] ? bytesToHex(fields[dataIndex]) : '0x';

    return {
      type: is1559 ? 'eip1559' : 'eip2930',
      to: to && to !== '0x' ? normalizeAddress(to) : null,
      data,
      value,
      chainId,
    };
  }

  const decoded = decodeRlp(bytes);
  if (!Array.isArray(decoded)) return null;
  const legacyFields = decoded as Uint8Array[];
  const to = legacyFields[3] ? bytesToHex(legacyFields[3]) : '0x';
  const value = legacyFields[4] ? bytesToBigInt(legacyFields[4]) : 0n;
  const data = legacyFields[5] ? bytesToHex(legacyFields[5]) : '0x';

  return {
    type: 'legacy',
    to: to && to !== '0x' ? normalizeAddress(to) : null,
    data,
    value,
    chainId: null,
  };
}

function parseErc20TransferData(data: string) {
  const normalized = data.startsWith('0x') ? data.slice(2) : data;
  if (normalized.length < 8 + 64 + 64) return null;
  const selector = normalized.slice(0, 8);
  if (selector !== 'a9059cbb') return null;
  const toChunk = normalized.slice(8, 8 + 64);
  const amountChunk = normalized.slice(8 + 64, 8 + 64 + 64);
  const to = normalizeAddress(`0x${toChunk.slice(24)}`);
  const amount = BigInt(`0x${amountChunk}`);
  return { to, amount };
}

export function validateSignedTransfer(rawTx: string, intent: UsdcIntent) {
  const decoded = decodeRawTransaction(rawTx);
  if (!decoded) {
    return { ok: false, reason: 'Unable to decode signed transaction' };
  }

  if (decoded.value > 0n) {
    return { ok: false, reason: 'Signed transaction sends native value' };
  }

  const usdcAddress = normalizeAddress(process.env.USDC_BASE_ADDRESS || DEFAULT_USDC_BASE_ADDRESS);
  if (!decoded.to || normalizeAddress(decoded.to) !== usdcAddress) {
    return { ok: false, reason: 'Signed transaction does not target USDC contract' };
  }

  if (decoded.chainId && decoded.chainId !== BigInt(BASE_CHAIN_ID)) {
    return { ok: false, reason: 'Signed transaction chain_id mismatch' };
  }

  const transfer = parseErc20TransferData(decoded.data);
  if (!transfer) {
    return { ok: false, reason: 'Signed transaction is not an ERC20 transfer' };
  }

  const expectedTo = normalizeAddress(intent.to || '');
  if (!expectedTo || transfer.to !== expectedTo) {
    return { ok: false, reason: 'Signed transaction destination mismatch' };
  }

  const expectedAmount = BigInt(Math.round(intent.amount_cents)) * USDC_BASE_UNITS_PER_CENT;
  if (transfer.amount !== expectedAmount) {
    return { ok: false, reason: 'Signed transaction amount mismatch' };
  }

  return { ok: true, decoded };
}

export function buildUnsignedTransfer(intent: UsdcIntent) {
  const expectedAmount = BigInt(Math.round(intent.amount_cents)) * USDC_BASE_UNITS_PER_CENT;
  const to = normalizeAddress(intent.to || '');
  return {
    to: normalizeAddress(process.env.USDC_BASE_ADDRESS || DEFAULT_USDC_BASE_ADDRESS),
    data: `0xa9059cbb${to.slice(2).padStart(64, '0')}${expectedAmount.toString(16).padStart(64, '0')}`,
    value: '0x0',
    chain_id: BASE_CHAIN_ID,
  };
}
