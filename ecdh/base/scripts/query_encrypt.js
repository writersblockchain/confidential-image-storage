const fs = require("fs");
const { ethers } = require("hardhat");
require("dotenv").config();

async function query_encrypt() {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  const contractName = "Encrypt"; // Replace with your contract's name

  const ContractJson = require("../artifacts/contracts/Encrypt.sol/Encrypt.json");
  const abi = ContractJson.abi;

  // Setup provider and contract
  const provider = ethers.provider;
  const contract = new ethers.Contract(contractAddress, abi, provider);

  // Query the contract
  const index = 0; // Adjust based on the data you want to query
  const data = await contract.getStoredData(index);
  console.log("Encrypted Data:", data);
}

query_encrypt().catch(console.error);
