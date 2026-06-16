import { prunePending } from './db.js';

// Removes pending (unconfirmed) signups older than the cutoff.
// Keeps the table clean and prevents stale-token confirmations.
// Run via cron, e.g.: 0 3 * * *  (daily at 03:00)

const HOURS = Number(process.env.PRUNE_AFTER_HOURS || 48);
const removed = prunePending(HOURS * 60 * 60 * 1000);

console.log(`[prune] removed ${removed} unconfirmed signup(s) older than ${HOURS}h at ${new Date().toISOString()}`);
process.exit(0);
