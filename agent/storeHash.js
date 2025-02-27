const { SecretNetworkClient, Wallet } = require("secretjs");
const dotenv = require("dotenv");
dotenv.config({ path: "../.env" });

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

let storeHash = async (hashData) => {

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

  console.log(tx);
};

module.exports = { storeHash };
