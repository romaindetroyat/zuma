/**
 * BLAKE3 in pure JavaScript (hash mode, 32-byte output), no dependency (R2.0.20, plan 05-16).
 *
 * Used only as the content key the Cloudflare Pages direct-upload API expects (same as the Pages CLI `hashFile`:
 * blake3(base64(content) + extension), first 32 hex digits). No security property relies on it; it is checked
 * against the official test vectors in tests/r220-deploy.test.mjs.
 *
 * Structure follows the reference implementation: 7-round compression with the message-word permutation,
 * 1 024-byte chunks of 64-byte blocks (CHUNK_START / CHUNK_END flags), parent nodes merged through a stack of
 * chaining values, ROOT flag on the final compression; 64-bit chunk counter split into two 32-bit words.
 */

const IV = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);
const PERM = [2, 6, 3, 10, 7, 0, 4, 13, 1, 11, 12, 5, 9, 14, 15, 8];
const CHUNK_LEN = 1024;
const BLOCK_LEN = 64;
const CHUNK_START = 1;
const CHUNK_END = 2;
const PARENT = 4;
const ROOT = 8;

const rotr = (x, n) => ((x >>> n) | (x << (32 - n))) >>> 0;

function g(s, a, b, c, d, mx, my) {
  s[a] = (s[a] + s[b] + mx) >>> 0;
  s[d] = rotr(s[d] ^ s[a], 16);
  s[c] = (s[c] + s[d]) >>> 0;
  s[b] = rotr(s[b] ^ s[c], 12);
  s[a] = (s[a] + s[b] + my) >>> 0;
  s[d] = rotr(s[d] ^ s[a], 8);
  s[c] = (s[c] + s[d]) >>> 0;
  s[b] = rotr(s[b] ^ s[c], 7);
}

function round(s, m) {
  g(s, 0, 4, 8, 12, m[0], m[1]);
  g(s, 1, 5, 9, 13, m[2], m[3]);
  g(s, 2, 6, 10, 14, m[4], m[5]);
  g(s, 3, 7, 11, 15, m[6], m[7]);
  g(s, 0, 5, 10, 15, m[8], m[9]);
  g(s, 1, 6, 11, 12, m[10], m[11]);
  g(s, 2, 7, 8, 13, m[12], m[13]);
  g(s, 3, 4, 9, 14, m[14], m[15]);
}

/** Compression function: returns the 8-word chaining value (first half of the 16-word output). */
function compress(cv, words, counter, blockLen, flags) {
  const s = new Uint32Array(16);
  s.set(cv, 0);
  s.set(IV.subarray(0, 4), 8);
  s[12] = counter >>> 0;
  s[13] = Math.floor(counter / 0x100000000) >>> 0;
  s[14] = blockLen;
  s[15] = flags;
  let m = Uint32Array.from(words);
  const next = new Uint32Array(16);
  for (let r = 0; r < 7; r++) {
    round(s, m);
    if (r < 6) {
      for (let i = 0; i < 16; i++) next[i] = m[PERM[i]];
      m = Uint32Array.from(next);
    }
  }
  const out = new Uint32Array(8);
  for (let i = 0; i < 8; i++) out[i] = (s[i] ^ s[i + 8]) >>> 0;
  return out;
}

/** 16 little-endian words of the block at `offset` (zero-padded past `len`). */
function blockWords(bytes, offset, len) {
  const w = new Uint32Array(16);
  for (let i = 0; i < len; i++) w[i >> 2] |= bytes[offset + i] << ((i & 3) * 8);
  return w;
}

/**
 * Chunk at `offset` (`len` ≤ 1 024 bytes): every block but the last is compressed; the last one is returned as an
 * "output" (inputs of the final compression), so the caller can derive either a chaining value or the root.
 */
function chunkOutput(bytes, offset, len, counter) {
  let cv = IV;
  const blocks = Math.max(1, Math.ceil(len / BLOCK_LEN));
  for (let b = 0; b < blocks - 1; b++) {
    cv = compress(cv, blockWords(bytes, offset + b * BLOCK_LEN, BLOCK_LEN), counter, BLOCK_LEN, b === 0 ? CHUNK_START : 0);
  }
  const lastLen = len - (blocks - 1) * BLOCK_LEN;
  const flags = (blocks === 1 ? CHUNK_START : 0) | CHUNK_END;
  return { cv, words: blockWords(bytes, offset + (blocks - 1) * BLOCK_LEN, lastLen), counter, blockLen: lastLen, flags };
}

function parentOutput(left, right) {
  const words = new Uint32Array(16);
  words.set(left, 0);
  words.set(right, 8);
  return { cv: IV, words, counter: 0, blockLen: BLOCK_LEN, flags: PARENT };
}

const chainingValue = o => compress(o.cv, o.words, o.counter, o.blockLen, o.flags);

/** BLAKE3 hash (32 bytes) of `input` (Uint8Array / Buffer, or a string encoded as UTF-8), as lowercase hex. */
export function blake3Hex(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const chunks = Math.max(1, Math.ceil(bytes.length / CHUNK_LEN));
  const stack = [];
  // Every chunk but the last is final as soon as it is read: push its chaining value, merging completed subtrees.
  for (let c = 0; c < chunks - 1; c++) {
    let cv = chainingValue(chunkOutput(bytes, c * CHUNK_LEN, CHUNK_LEN, c));
    let total = c + 1;
    while ((total & 1) === 0) {
      cv = chainingValue(parentOutput(stack.pop(), cv));
      total /= 2;
    }
    stack.push(cv);
  }
  const lastOffset = (chunks - 1) * CHUNK_LEN;
  let output = chunkOutput(bytes, lastOffset, bytes.length - lastOffset, chunks - 1);
  while (stack.length > 0) output = parentOutput(stack.pop(), chainingValue(output));
  // Root: output block counter 0, ROOT flag; the first 8 words give the 32-byte hash.
  const root = compress(output.cv, output.words, 0, output.blockLen, output.flags | ROOT);
  let hex = '';
  for (const w of root) for (let i = 0; i < 4; i++) hex += ((w >>> (i * 8)) & 0xff).toString(16).padStart(2, '0');
  return hex;
}
