// backend/utils/Encryption.js

const crypto = require('crypto');
require('dotenv').config();

/**
 * Encrypts a given buffer using AES-256-GCM.
 * 
 * Structure of the returned Buffer:
 *   salt (64 bytes) + IV (16 bytes) + authTag (16 bytes) + ciphertext (N bytes)
 *
 * @param {Buffer} buffer - The original data to encrypt.
 * @param {string} masterKey - The master key for encryption.
 * @returns {Buffer} A single buffer containing salt, IV, tag, and ciphertext.
 */
function serverEncrypt(buffer, masterKey) {
    try {
        // Generate random salt (64 bytes) and IV (16 bytes)
        const salt = crypto.randomBytes(64);
        const iv = crypto.randomBytes(16);

        // Derive a 256-bit key using PBKDF2 with 100,000 iterations of SHA-512
        const key = crypto.pbkdf2Sync(masterKey, salt, 100000, 32, 'sha512');

        // Create cipher with AES-256-GCM
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

        // Encrypt
        const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);

        // Authentication tag
        const tag = cipher.getAuthTag();

        // Concatenate all pieces: salt + iv + tag + ciphertext
        return Buffer.concat([salt, iv, tag, ciphertext]);
    } catch (error) {
        console.error('Encryption error:', error);
        throw new Error('Encryption failed.');
    }
}

/**
 * Decrypts a buffer produced by `serverEncrypt`.
 * 
 * Expects Buffer structure:
 *   salt (64 bytes) + IV (16 bytes) + authTag (16 bytes) + ciphertext (N bytes)
 *
 * @param {Buffer} encryptedBuffer - The encrypted data (as above).
 * @param {string} masterKey - The master key used during encryption.
 * @returns {Buffer} The decrypted data.
 */
function serverDecrypt(encryptedBuffer, masterKey) {
    try {
        // Extract components
        const salt = encryptedBuffer.slice(0, 64);
        const iv = encryptedBuffer.slice(64, 80);
        const tag = encryptedBuffer.slice(80, 96);
        const ciphertext = encryptedBuffer.slice(96);

        // Derive the same 256-bit key used during encryption
        const key = crypto.pbkdf2Sync(masterKey, salt, 100000, 32, 'sha512');

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
        console.error('Decryption error:', error);
        throw new Error('Decryption failed.');
    }
}

module.exports = {
    serverEncrypt,
    serverDecrypt,
};
