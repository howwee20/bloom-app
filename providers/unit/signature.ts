import crypto from 'crypto';

type UnitSignatureParts = {
  timestamp?: string;
  signatures: string[];
};

function parseUnitSignatureHeader(header: string | string[] | undefined): UnitSignatureParts {
  if (!header) return { signatures: [] };
  const value = Array.isArray(header) ? header[0] : header;
  const parts = value.split(',');
  const signatures: string[] = [];
  let timestamp: string | undefined;

  for (const part of parts) {
    const [rawKey, rawValue] = part.split('=');
    if (!rawKey || !rawValue) continue;
    const key = rawKey.trim();
    const val = rawValue.trim();
    if (key === 't' || key === 'ts' || key === 'timestamp') {
      timestamp = val;
    } else if (key.startsWith('v') || key === 'sig' || key === 'signature') {
      signatures.push(val);
    }
  }

  return { timestamp, signatures };
}

function timingSafeEqualHex(a: string, b: string) {
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

export function verifyUnitWebhookSignature(
  rawBody: string,
  config: { secret?: string; signatureHeader?: string | string[]; timestampHeader?: string | string[] }
) {
  const secret = config.secret;
  if (!secret) return true;

  const { timestamp: headerTimestamp, signatures } = parseUnitSignatureHeader(config.signatureHeader);
  const timestamp = headerTimestamp
    || (Array.isArray(config.timestampHeader) ? config.timestampHeader[0] : config.timestampHeader);

  if (!signatures.length) {
    return false;
  }

  if (timestamp) {
    const tolerance = Number(process.env.UNIT_WEBHOOK_TOLERANCE_SECONDS || 300);
    const timestampNum = Number(timestamp);
    if (!Number.isFinite(timestampNum)) return false;
    const tsSeconds = timestampNum > 1_000_000_000_000
      ? Math.floor(timestampNum / 1000)
      : Math.floor(timestampNum);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - tsSeconds) > tolerance) {
      return false;
    }
  }

  const base = timestamp ? `${timestamp}.${rawBody}` : rawBody;
  const computed = crypto.createHmac('sha256', secret).update(base).digest('hex');

  return signatures.some((sig) => timingSafeEqualHex(computed, sig));
}
