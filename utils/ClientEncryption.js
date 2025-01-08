// backend/utils/ClientEncryption.js

const crypto = require('crypto');
require('dotenv').config();

/**
 * Decrypts data encrypted with client-side encryption.
 * 
 * Expects Buffer structure:
 *   salt (64 bytes) + IV (16 bytes) + authTag (16 bytes) + ciphertext (N bytes)
 *
 * @param {Buffer} encryptedBuffer - The encrypted data.
 * @returns {Buffer} The decrypted data.
 */
function clientDecrypt(encryptedBuffer) {
  try {
    // Extract components
    const salt = encryptedBuffer.slice(0, 64);
    const iv = encryptedBuffer.slice(64, 80);
    const tag = encryptedBuffer.slice(80, 96);
    const ciphertext = encryptedBuffer.slice(96);

    // Retrieve client encryption key from environment variables
    const clientKey = process.env.CLIENT_ENCRYPTION_KEY;
    if (!clientKey) {
      throw new Error('Client encryption key is not defined in environment variables.');
    }

    // Derive the same 256-bit key used during client-side encryption (PBKDF2 with SHA-512)
    const key = crypto.pbkdf2Sync(clientKey, salt, 100000, 32, 'sha512');

    // Create decipher
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    // Decrypt
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted;
  } catch (error) {
    console.error('Client-side Decryption Error:', error.message);
    throw new Error('Client-side decryption failed.');
  }
}

module.exports = {
  clientDecrypt,
};
