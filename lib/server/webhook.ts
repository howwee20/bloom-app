import crypto from 'crypto';

export type WebhookVerificationConfig = {
  secret: string | undefined;
  signature: string | undefined;
  timestamp: string | undefined;
  toleranceSeconds?: number;
  legacyBodyOnly?: boolean;
};

export function verifyWebhookSignature(rawBody: string, config: WebhookVerificationConfig) {
  if (!config.secret) return true;
  if (!config.signature) return false;

  const tolerance = config.toleranceSeconds ?? 300;
  if (config.timestamp) {
    const timestamp = Number(config.timestamp);
    if (!Number.isFinite(timestamp)) return false;
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > tolerance) {
      return false;
    }
  }

  const base = config.timestamp && !config.legacyBodyOnly
    ? `${config.timestamp}.${rawBody}`
    : rawBody;
  const computed = crypto.createHmac('sha256', config.secret).update(base).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(config.signature));
  } catch {
    return false;
  }
}
