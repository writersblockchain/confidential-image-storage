import { CdpWalletProvider } from "@coinbase/agentkit";

interface TransactionResult {
  code: number;
  transactionHash: string;
  height?: number;
  rawLog?: string;
}

export async function storeHash(hash: Buffer): Promise<TransactionResult> {
  try {
    // Convert hash to hex string
    const hashHex = hash.toString("hex");

    // Initialize CDP wallet provider
    const config = {
      apiKeyName: process.env.CDP_API_KEY_NAME!,
      apiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY!.replace(/\\n/g, "\n"),
      networkId: process.env.NETWORK_ID || "base-sepolia",
    };

    const walletProvider = await CdpWalletProvider.configure(config);

    // Create and send transaction
    const tx = await walletProvider.sendTransaction({
      to: "0x0000000000000000000000000000000000000000", // Contract address for storing hashes
      data: hashHex,
      value: "0",
    });

    return {
      code: 0,
      transactionHash: tx.hash,
      height: tx.blockNumber,
      rawLog: tx.logs?.join("\n"),
    };
  } catch (error) {
    console.error("Error storing hash:", error);
    return {
      code: 1,
      transactionHash: "",
      rawLog: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
