const secp256k1 = require("secp256k1/elliptic.js");
const { randomBytes } = require("crypto");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

function generateKeysIfMissing() {
  // If keys already exist in process.env, do nothing.
  if (process.env.ECC_PUBLIC_KEY && process.env.ECC_PRIVATE_KEY) {
    console.log("ECC keys already set.");
    return;
  }
  
  const envPath = path.join(__dirname, "../.env");
  let envContents = fs.existsSync(envPath)
    ? fs.readFileSync(envPath, "utf8")
    : "";
  
  // Generate keys
  const privateKey = (() => {
    while (true) {
      const key = randomBytes(32);
      if (secp256k1.privateKeyVerify(key)) return key;
    }
  })();
  const publicKey = secp256k1.publicKeyCreate(privateKey);

  // Update or append keys in the .env content
  function updateEnvVariable(key, value) {
    const keyRegex = new RegExp(`^${key}=.*$`, "m");
    if (keyRegex.test(envContents)) {
      envContents = envContents.replace(keyRegex, `${key}=${value}`);
    } else {
      envContents += `\n${key}=${value}`;
    }
  }

  updateEnvVariable("ECC_PUBLIC_KEY", publicKey.toString("hex"));
  updateEnvVariable("ECC_PRIVATE_KEY", privateKey.toString("hex"));
  fs.writeFileSync(envPath, envContents);

  // Reload environment variables
  dotenv.config({ path: envPath, override: true });
  console.log("Generated ECC keys and reloaded environment.");
}

module.exports = { generateKeysIfMissing };
