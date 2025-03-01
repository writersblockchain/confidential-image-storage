const hre = require("hardhat");

async function main() {
  let EncryptFactory = await hre.ethers.getContractFactory("Encrypt");
  let encrypt = await EncryptFactory.deploy();

  console.log("Encrypt deployed to: ", encrypt.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
