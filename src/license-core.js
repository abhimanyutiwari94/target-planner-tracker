// Offline coupon / activation code core. Shared by the app (WebCrypto) and scripts/generate-codes.mjs (node:crypto).
// Code layout (80 bits => 16 Crockford base32 chars, shown as TPT-XXXX-XXXX-XXXX-XXXX):
//   payload 40 bits: version(3) | deviceBound(1) | days(12) | serial(24)
//   mac     40 bits: first 5 bytes of HMAC-SHA256(secret, payload [+ deviceId])
export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_VERSION = 1;
const _a = [57, 251, 193, 42, 29, 10, 22, 82, 146, 229, 230, 238, 114, 155, 60, 10, 196, 187, 166, 108, 163, 132, 42, 178, 249, 23, 103, 139, 25, 212, 143, 105];
const _b = [4, 68, 12, 178, 88, 112, 131, 141, 155, 11, 161, 148, 216, 57, 238, 131, 207, 191, 1, 195, 50, 119, 61, 138, 231, 131, 222, 30, 117, 67, 16, 191];
export function secretBytes() { return new Uint8Array(_a.map((v, i) => v ^ _b[i])); }

export function normalizeCode(input) {
  let s = String(input || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (s.startsWith('TPT')) s = s.slice(3);
  return s.replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');
}
export function formatCode(raw16) {
  return 'TPT-' + raw16.match(/.{1,4}/g).join('-');
}
export function bytesToB32(bytes) {
  let bits = 0, value = 0, out = '';
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
export function b32ToBytes(str) {
  let bits = 0, value = 0; const out = [];
  for (const ch of str) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) return null;
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}
export function encodePayload({ days, serial, deviceBound }) {
  if (!(days >= 1 && days <= 4095)) throw new Error('days must be 1..4095');
  if (!(serial >= 0 && serial <= 0xffffff)) throw new Error('serial out of range');
  const p = new Uint8Array(5);
  p[0] = (CODE_VERSION << 5) | ((deviceBound ? 1 : 0) << 4) | ((days >> 8) & 15);
  p[1] = days & 255;
  p[2] = (serial >> 16) & 255; p[3] = (serial >> 8) & 255; p[4] = serial & 255;
  return p;
}
export function decodePayload(p) {
  return {
    version: p[0] >> 5,
    deviceBound: ((p[0] >> 4) & 1) === 1,
    days: ((p[0] & 15) << 8) | p[1],
    serial: (p[2] << 16) | (p[3] << 8) | p[4],
  };
}
export function macInput(payload, deviceBound, deviceId) {
  const dev = deviceBound ? new TextEncoder().encode(String(deviceId || '').toUpperCase().replace(/[^0-9A-Z]/g, '')) : new Uint8Array(0);
  const m = new Uint8Array(payload.length + dev.length);
  m.set(payload, 0); m.set(dev, payload.length);
  return m;
}
// The visible payload is XOR-scrambled with a mask derived from the MAC so codes look random.
const MASK_TAG = new TextEncoder().encode('TPT-MASK');
export function maskInput(mac) {
  const m = new Uint8Array(MASK_TAG.length + mac.length);
  m.set(MASK_TAG, 0); m.set(mac, MASK_TAG.length);
  return m;
}
export function xor5(a, b) { const o = new Uint8Array(5); for (let i = 0; i < 5; i++) o[i] = a[i] ^ b[i]; return o; }
/** Build a code. hmac(keyBytes, dataBytes) => Uint8Array|Promise<Uint8Array> */
export async function buildCode({ days, serial, deviceId = '' }, hmac) {
  const key = secretBytes();
  const deviceBound = !!deviceId;
  const payload = encodePayload({ days, serial, deviceBound });
  const mac = (await hmac(key, macInput(payload, deviceBound, deviceId))).slice(0, 5);
  const mask = (await hmac(key, maskInput(mac))).slice(0, 5);
  const all = new Uint8Array(10); all.set(xor5(payload, mask), 0); all.set(mac, 5);
  return formatCode(bytesToB32(all));
}
/** Verify a code. Returns {ok, days, serial, deviceBound, reason} */
export async function verifyCode(input, deviceId, hmac) {
  const raw = normalizeCode(input);
  if (raw.length !== 16) return { ok: false, reason: 'Code must have 16 characters after TPT-' };
  const bytes = b32ToBytes(raw);
  if (!bytes || bytes.length !== 10) return { ok: false, reason: 'Invalid characters in code' };
  const key = secretBytes();
  const mac = bytes.slice(5, 10);
  const mask = (await hmac(key, maskInput(mac))).slice(0, 5);
  const payload = xor5(bytes.slice(0, 5), mask);
  const info = decodePayload(payload);
  if (info.version !== CODE_VERSION) return { ok: false, reason: 'Invalid code' };
  const expect = (await hmac(key, macInput(payload, info.deviceBound, deviceId))).slice(0, 5);
  for (let i = 0; i < 5; i++) if (expect[i] !== mac[i]) {
    return { ok: false, reason: info.deviceBound ? 'This code is not valid for this phone (Device ID mismatch)' : 'Invalid code' };
  }
  return { ok: true, ...info, code: formatCode(raw) };
}
