import { ActionProvider, ActionParameters } from "@coinbase/agentkit";
import crypto from "crypto";

// ✅ Extend ActionProvider
export class EncryptInformationActionProvider extends ActionProvider {
  constructor() {
    super({
      name: "EncryptInformation",
      parameters: {
        plaintext: "string", // The text to encrypt
        secretKey: "string", // The secret key (must be 256-bit in hex format)
        dryRun: "boolean", // Optional: If true, returns simulated data
      },
    });
  }

  // ✅ Define the execute function with correct types
  async execute({ parameters }: { parameters: ActionParameters }) {
    const { plaintext, secretKey, dryRun } = parameters as {
      plaintext: string;
      secretKey: string;
      dryRun?: boolean;
    };

    if (!plaintext || !secretKey) {
      throw new Error("Missing required parameters: plaintext and secretKey");
    }

    // ✅ If dryRun is enabled, return a mock response
    if (dryRun) {
      return {
        success: true,
        message: "Dry run successful. Action was selected but not executed.",
        simulatedData: {
          encryptedData: "[SIMULATED]",
          iv: "[SIMULATED]",
        },
      };
    }

    try {
      // Generate a random IV (Initialization Vector)
      const iv = crypto.randomBytes(16);

      // Create an AES cipher
      const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(secretKey, "hex"), iv);
      let encrypted = cipher.update(plaintext, "utf8", "hex");
      encrypted += cipher.final("hex");

      return {
        success: true,
        encryptedData: encrypted,
        iv: iv.toString("hex"),
        message: "Data successfully encrypted.",
      };
    } catch (error) {
      throw new Error("Encryption failed: " + error.message);
    }
  }
}
