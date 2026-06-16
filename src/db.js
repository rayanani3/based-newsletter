import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

const db = new Database(process.env.DB_PATH || './subscribers.db');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS subscribers (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    token         TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending',  -- pending | confirmed | unsubscribed
    source        TEXT,
    created_at    INTEGER NOT NULL,
    confirmed_at  INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_status ON subscribers(status);
  CREATE INDEX IF NOT EXISTS idx_token  ON subscribers(token);
`);

const stmts = {
  insert: db.prepare(`
    INSERT INTO subscribers (id, email, token, status, source, created_at)
    VALUES (@id, @email, @token, 'pending', @source, @created_at)
    ON CONFLICT(email) DO UPDATE SET
      token = excluded.token,
      created_at = excluded.created_at,
      status = CASE WHEN subscribers.status = 'confirmed'
                    THEN 'confirmed' ELSE 'pending' END
  `),
  findByToken: db.prepare(`SELECT * FROM subscribers WHERE token = ?`),
  confirm: db.prepare(`
    UPDATE subscribers SET status = 'confirmed', confirmed_at = ?
    WHERE token = ? AND status = 'pending'
  `),
  findByEmail: db.prepare(`SELECT * FROM subscribers WHERE email = ?`),
  prunePending: db.prepare(`
    DELETE FROM subscribers WHERE status = 'pending' AND created_at < ?
  `),
  stats: db.prepare(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed,
      COUNT(*) FILTER (WHERE status = 'pending')   AS pending
    FROM subscribers
  `)
};

export function createPending(email, source = 'web') {
  const token = randomUUID();
  stmts.insert.run({
    id: randomUUID(),
    email: email.toLowerCase().trim(),
    token,
    source,
    created_at: Date.now()
  });
  return token;
}

export function confirmToken(token) {
  const row = stmts.findByToken.get(token);
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.status === 'confirmed') return { ok: true, already: true, email: row.email };
  const res = stmts.confirm.run(Date.now(), token);
  return res.changes === 1
    ? { ok: true, email: row.email }
    : { ok: false, reason: 'invalid_state' };
}

export function findByEmail(email) {
  return stmts.findByEmail.get(email.toLowerCase().trim());
}

export function prunePending(olderThanMs) {
  return stmts.prunePending.run(Date.now() - olderThanMs).changes;
}

export function getStats() {
  return stmts.stats.get();
}

export default db;
