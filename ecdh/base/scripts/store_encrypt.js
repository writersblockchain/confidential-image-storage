const { fromBase64, fromHex, toUtf8 } = require("@cosmjs/encoding");
const { ethers } = require("hardhat");
const { encrypt } = require("./encrypt.js");
require("dotenv").config();

const encryptAddress = process.env.CONTRACT_ADDRESS; // Replace with your deployed contract's address

async function store_encrypt() {
  let msg = {
    message: "this is a secret message - feb 25 - 2:34pm",
    salt: Math.random(),
  };

  let my_encrypted_message = await encrypt(msg);
  let Encrypt = await hre.ethers.getContractFactory("Encrypt");
  const to_encrypt = await Encrypt.attach(encryptAddress);

  const tx = await to_encrypt.storeData(my_encrypted_message);

  console.log(`Transaction hash: ${tx.hash}`);
  await tx.wait();

  console.log("encrypt function executed successfully!");
}
store_encrypt();
