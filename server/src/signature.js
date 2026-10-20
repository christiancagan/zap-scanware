// Optional per-device ECDSA P-256 batch signature verification (Phase 4).
import { createPublicKey, createVerify } from 'node:crypto';

/**
 * @param {string} publicKeyB64 - base64 SPKI DER (EC P-256).
 * @param {Buffer} data - the raw (as-received) request body bytes.
 * @param {string} signatureB64 - base64 DER ECDSA signature.
 * @returns {boolean}
 */
export function verifyBatchSignature(publicKeyB64, data, signatureB64) {
  try {
    const key = createPublicKey({ key: Buffer.from(publicKeyB64, 'base64'), format: 'der', type: 'spki' });
    const verifier = createVerify('SHA256');
    verifier.update(data);
    verifier.end();
    return verifier.verify({ key, dsaEncoding: 'der' }, Buffer.from(signatureB64, 'base64'));
  } catch {
    return false;
  }
}
