import express from 'express';
import unitWebhookHandler from '../api/unit/webhook';

type RawBodyRequest = express.Request & {
  rawBody?: Buffer | string;
};

export function createApiServer() {
  const app = express();

  app.use(express.raw({ type: '*/*' }));
  app.use((req, _res, next) => {
    if (Buffer.isBuffer(req.body)) {
      (req as RawBodyRequest).rawBody = req.body;
      const text = req.body.toString('utf8');
      try {
        req.body = JSON.parse(text);
      } catch {
        req.body = text;
      }
    }
    next();
  });

  app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.post('/api/unit/webhook', (req, res) => {
    Promise.resolve(unitWebhookHandler(req, res)).catch((error) => {
      console.error('[api-only] webhook handler failed', error);
      res.status(500).json({ error: 'Webhook handler failed' });
    });
  });

  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  const app = createApiServer();
  app.listen(port, () => {
    console.log(`[api-only] listening on http://localhost:${port}`);
  });
}
