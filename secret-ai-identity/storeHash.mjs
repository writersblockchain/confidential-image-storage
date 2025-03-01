import { SecretNetworkClient, Wallet } from "secretjs";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

const wallet = new Wallet(process.env.MNEMONIC);

const secretjs = new SecretNetworkClient({
  chainId: "pulsar-3",
  url: "https://pulsar.lcd.secretnodes.com",
  wallet,
  walletAddress: wallet.address,
});

// secret contract info
const contractAddress = "secret17cmtjg3hu7yrndv9zd2tcs566svh2zxyxp9e3d";
const contractCodeHash = "325834cd289bd317715902e7448e04588e6fd09efa518410a1ab33d254253899";

export const storeHash = async (hashData) => {
  const hashString = hashData.toString("hex");

  const tx = await secretjs.tx.compute.executeContract(
    {
      sender: wallet.address,
      contract_address: contractAddress,
      msg: {
        save_i_d: { id_hash: hashString },
      },
      code_hash: contractCodeHash,
    },
    { gasLimit: 2_000_000 }
  );

  return tx;
};
