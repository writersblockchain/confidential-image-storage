const crypto = require('crypto');

/**
 * Hashes the input message using SHA-256 without a salt.
 * @param msg - The message to hash (can be any type that JSON.stringify supports).
 * @returns A Promise that resolves to a Buffer containing the SHA-256 hash.
 */
async function hashData(msg) {
  // Serialize the message to a string using JSON.stringify
  const serialized = JSON.stringify(msg);
  // Convert the serialized string to a UTF-8 encoded buffer
  const buffer = Buffer.from(serialized, 'utf8');
  // Compute the SHA-256 hash of the buffer and get the result as a Buffer
  const hash = crypto.createHash('sha256').update(buffer).digest();
  // Return the hash wrapped in a Promise
  return hash;
}

module.exports = { hashData };