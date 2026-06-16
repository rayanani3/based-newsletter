import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createPending, confirmToken, findByEmail, getStats } from './db.js';
import { sendConfirmation } from './mailer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL || 'info' },
  trustProxy: true
});

// Registered non-global: the limit applies only to routes that opt in via
// `config.rateLimit` (just /api/subscribe). Health/stats stay unthrottled so
// uptime monitors don't get 429'd.
await app.register(rateLimit, {
  global: false,
  max: 5,
  timeWindow: '1 minute',
  keyGenerator: (req) => req.ip
});

await app.register(fastifyStatic, {
  root: join(__dirname, '..', 'public'),
  prefix: '/'
});

// POST /api/subscribe  { email }  — rate limited 5/min/IP (opt-in)
app.post('/api/subscribe', {
  config: { rateLimit: { max: 5, timeWindow: '1 minute' } }
}, async (req, reply) => {
  const email = (req.body?.email || '').toString();
  if (!EMAIL_RE.test(email)) {
    return reply.code(400).send({ ok: false, error: 'invalid_email' });
  }

  const existing = findByEmail(email);
  if (existing?.status === 'confirmed') {
    // Don't leak which emails are subscribed; respond identically.
    return reply.send({ ok: true, message: 'check_inbox' });
  }

  try {
    const token = createPending(email, 'web');
    await sendConfirmation(email, token);
    req.log.info({ email }, 'pending subscriber created + confirmation sent');
    return reply.send({ ok: true, message: 'check_inbox' });
  } catch (err) {
    req.log.error({ err }, 'subscribe failed');
    return reply.code(500).send({ ok: false, error: 'send_failed' });
  }
});

// GET /confirm?token=...
app.get('/confirm', async (req, reply) => {
  const token = (req.query?.token || '').toString();
  const result = confirmToken(token);
  reply.type('text/html');
  if (result.ok) {
    return reply.send(resultPage('confirmed', "you're in.", 'subscription confirmed. welcome.'));
  }
  return reply.send(resultPage('failed', 'link invalid', 'this link is expired or already used.'));
});

// GET /api/stats  (handy for the demo + ops visibility)
app.get('/api/stats', async () => getStats());

app.get('/api/health', async () => ({ ok: true, ts: Date.now() }));

function resultPage(kind, heading, sub) {
  const accent = kind === 'confirmed' ? '#4ade80' : '#f87171';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${heading}</title>
  <style>body{margin:0;height:100vh;display:grid;place-items:center;background:#0a0a0a;color:#e8e8e8;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif}
  .c{text-align:center;max-width:380px;padding:0 24px}.d{width:8px;height:8px;border-radius:50%;background:${accent};margin:0 auto 20px;box-shadow:0 0 16px ${accent}}
  h1{font-size:24px;font-weight:600;margin:0 0 10px;color:#fff;text-transform:lowercase}p{color:#888;font-size:14px;margin:0}</style></head>
  <body><div class="c"><div class="d"></div><h1>${heading}</h1><p>${sub}</p></div></body></html>`;
}

try {
  await app.listen({ port: PORT, host: HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
