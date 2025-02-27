import { SecretNetworkClient, Wallet } from "secretjs";
import dotenv from "dotenv";
dotenv.config({ path: "../../../.env" });

const wallet = new Wallet(process.env.MNEMONIC);

const secretjs = new SecretNetworkClient({
  chainId: "pulsar-3",
  url: "https://pulsar.lcd.secretnodes.com",
  wallet: wallet,
  walletAddress: wallet.address,
});

// secret contract info
let contractCodeHash = process.env.CODE_HASH;
let contractAddress = process.env.SECRET_ADDRESS;
let encrypted_data;
// let other_public_key = process.env.ECC_PUBLIC_KEY.split(",").map((num) =>
//   parseInt(num, 10)
// );

const data =
  "0xcebce23aa4f60794e90c5cfd7a2b6b594eeb4b7f2a57d44e291a301ed7b4acc226cc8c1bc06b823a80a33717ed520eb7113395deffd6cd65032f626b0b2e743acf2b19126030babe2fcc4b3b8102b70bdc4f7ce06956908c2a3bbe3472832aa3038e";

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
          2,158,40,180,227,59,125,101,33,30,158,139,229,120,219,184,50,129,208,49,16,53,208,46,11,32,33,154,178,186,122,81,248
        ],
        encrypted_message: to_decrypt,
      },
    },
    code_hash: contractCodeHash,
  });

  console.log(query);
};

get_decrypted_query();
