const { ethers } = require("hardhat");
const { hexlify } = require("ethers");
const dotenv = require("dotenv");
dotenv.config({ path: "../.env" });

async function storeEncryptedData(encryptedData) {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  if (!contractAddress) throw new Error("CONTRACT_ADDRESS not found in .env");
  
  const abi = ["function storeData(bytes encryptedData) public returns (bool)"];
  const [signer] = await ethers.getSigners();
  const contract = new ethers.Contract(contractAddress, abi, signer);
  const tx = await contract.storeData(hexlify(encryptedData));
  await tx.wait();
  console.log("Data stored successfully on chain!");
}

module.exports = { storeEncryptedData };
