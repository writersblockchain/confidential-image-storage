const miscreant = require("miscreant");
const { toUtf8 } = require("@cosmjs/encoding");
const secp256k1 = require("secp256k1/elliptic.js");
const dotenv = require("dotenv");
dotenv.config({ path: "../.env" });

const provider = new miscreant.PolyfillCryptoProvider();
const publicKey = new Uint8Array(process.env.SECRET_PUBLIC_KEY.split(",").map(Number));
const privateKey = new Uint8Array(process.env.ECC_PRIVATE_KEY.split(",").map(Number));
const keyData = Uint8Array.from(secp256k1.ecdh(publicKey, privateKey));

async function encryptData(msg, associatedData = []) {
  const siv = await miscreant.SIV.importKey(keyData, "AES-SIV", provider);
  const plaintext = toUtf8(JSON.stringify(msg));
  return await siv.seal(plaintext, associatedData);
}

module.exports = { encryptData };
