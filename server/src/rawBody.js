// Raw-body capture with size caps, gzip decode, and the X-Content-SHA256 hash.
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

export const MAX_BODY_BYTES = 512 * 1024;        // compressed/on-the-wire cap
export const MAX_UNCOMPRESSED_BYTES = 1024 * 1024;

export class BodyTooLarge extends Error {}

export function readRawBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new BodyTooLarge('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export function decodeBody(raw, contentEncoding) {
  if (String(contentEncoding || '').toLowerCase() === 'gzip') {
    return gunzipSync(raw, { maxOutputLength: MAX_UNCOMPRESSED_BYTES });
  }
  return raw;
}

export function bodyHashB64(raw) {
  return createHash('sha256').update(raw).digest('base64');
}
