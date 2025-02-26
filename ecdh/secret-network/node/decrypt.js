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
  "0xe3d4072f137e1c22d608bd6808d620360d8959c4ed68895355a839b8606c2e7f966883b1f8f76814a8042c4dd7f6dabb7bb197938a64a7f9470114c19c39770c550f28dee3c0c5a87e02a5dd6bdeb890ac7fb835b2667274a7ced6c1d88b1ccec1eb3f";

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
