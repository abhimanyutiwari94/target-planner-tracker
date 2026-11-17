// Generate activation (coupon) codes for Target Planner & Tracker.
// Usage:
//   node scripts/generate-codes.mjs --count 12 --days 30 --start 1              -> universal codes (work on any phone, once per phone)
//   node scripts/generate-codes.mjs --days 365 --serial 5001 --device ABCDE-FGHJK  -> code locked to one phone's Device ID
// Every code with a different serial can be applied once per phone. Never reuse serial numbers.
import { createHmac } from 'node:crypto';
import { buildCode, verifyCode } from '../src/license-core.js';

const argv = process.argv.slice(2);
const arg = (name, def) => { const i = argv.indexOf('--' + name); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def; };
const days = Number(arg('days', 30));
const count = Number(arg('count', 1));
const start = Number(arg('serial', arg('start', 1)));
const device = arg('device', '');
const hmac = (key, data) => new Uint8Array(createHmac('sha256', Buffer.from(key)).update(Buffer.from(data)).digest());
for (let i = 0; i < count; i++) {
  const serial = start + i;
  const code = await buildCode({ days, serial, deviceId: device }, hmac);
  const check = await verifyCode(code, device, hmac);
  if (!check.ok || check.days !== days || check.serial !== serial) throw new Error('self-check failed for ' + code);
  console.log(`${String(i + 1).padStart(2, ' ')}. ${code}   (${days} days, serial ${serial}${device ? ', device ' + device : ''})`);
}
