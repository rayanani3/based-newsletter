# based-newsletter

Self-hosted, double-opt-in newsletter infrastructure. No SendGrid, no Mailchimp, no Substack. You own the box, the data, and the deliverability.

**Stack:** Fastify (Node 20) · SQLite (WAL) · AWS SES (SMTP fallback) · Caddy (auto-HTTPS) · systemd · cron. Runs on a single small VPS.

---

## Why double opt-in

It's the only pattern that protects sender reputation. A confirmed list bounces less, gets marked spam less, and keeps the SES account out of the penalty box. The confirm step is the difference between a list that lands in the inbox and one that lands in junk.

## Flow

1. `POST /api/subscribe` — validates email, writes a `pending` row with a UUID token, sends a confirmation email via SES.
2. Recipient clicks the link → `GET /confirm?token=…` flips the row to `confirmed`.
3. Daily cron purges `pending` rows older than 48h, so stale tokens can't be confirmed and the table stays clean.

Identical responses whether or not an email already exists — no enumeration leak. Rate limited to 5 req/min/IP.

## Endpoints

| Method | Path             | Purpose                          |
|--------|------------------|----------------------------------|
| POST   | `/api/subscribe` | Create pending + send confirm    |
| GET    | `/confirm`       | Confirm via token                |
| GET    | `/api/stats`     | `{ confirmed, pending }`         |
| GET    | `/api/health`    | Liveness                         |

---

## Deploy (Ubuntu/Debian VPS)

```bash
# 1. Node 20 + build deps for better-sqlite3
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential python3

# 2. App
sudo useradd -r -m -d /opt/based-newsletter newsletter
sudo git clone <your-repo> /opt/based-newsletter
cd /opt/based-newsletter
sudo -u newsletter npm ci --omit=dev
sudo mkdir -p /var/lib/based-newsletter && sudo chown newsletter: /var/lib/based-newsletter

# 3. Config
sudo -u newsletter cp .env.example .env && sudo -u newsletter nano .env

# 4. Service
sudo cp deploy/based-newsletter.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now based-newsletter

# 5. HTTPS (Caddy installed separately)
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy

# 6. Cron prune
sudo -u newsletter crontab deploy/crontab
```

## SES notes

- Verify the sending domain + DKIM/SPF before going live, or everything lands in spam.
- New SES accounts are sandboxed (verified recipients only) until you request production access.
- `MAIL_DRIVER=smtp` lets you run on any SMTP provider while SES production access is pending.

## Local dev

```bash
npm install
cp .env.example .env   # set MAIL_DRIVER=smtp with a test inbox (e.g. Mailpit)
npm run dev
```

## Scaling past this

This handles a single-box list comfortably. Past ~100k sends/campaign the natural path is SES + a queue (SQS/Redis) for send fan-out, a separate sender worker honoring SES rate limits, and Postgres if you outgrow SQLite. The architecture here is the honest small-scale version of exactly that.
