import { SecretNetworkClient, Wallet } from "secretjs";
import dotenv from "dotenv";
dotenv.config({ path: "../../polygon/.env" });

const wallet = new Wallet(process.env.MNEMONIC);

const secretjs = new SecretNetworkClient({
  chainId: "pulsar-3",
  url: "https://lcd.pulsar-3.secretsaturn.net",
  wallet: wallet,
  walletAddress: wallet.address,
});

// secret contract info
let contractCodeHash = process.env.CODE_HASH;
let contractAddress = process.env.SECRET_ADDRESS;
let encrypted_data;
let other_public_key = process.env.ECC_PUBLIC_KEY.split(",").map((num) =>
  parseInt(num, 10)
);

const data =
  "0x04a5e7631dac1665acab943cc2f8f32cbabfdd2158d34ea23f3d3227aab3bc89a8d31c";

function hexToArray(hexString) {
  // Check if the string starts with '0x' and remove it
  const hex = hexString.startsWith("0x") ? hexString.slice(2) : hexString;

  const numberArray = [];

  for (let i = 0; i < hex.length; i += 2) {
    numberArray.push(parseInt(hex.substr(i, 2), 16));
  }

  return numberArray;
}

let to_decrypt = hexToArray(data);

let get_decrypted_query = async () => {
  let query = await secretjs.query.compute.queryContract({
    contract_address: contractAddress,
    query: {
      decrypt_query: {
        public_key: [
          3, 118, 120, 142, 29, 35, 3, 21, 172, 209, 97, 236, 216, 110, 118, 24,
          11, 161, 53, 45, 56, 193, 141, 235, 56, 13, 177, 99, 213, 172, 58, 4,
          124,
        ],
        encrypted_message: to_decrypt,
      },
    },
    code_hash: contractCodeHash,
  });

  console.log(query);
};

get_decrypted_query();
