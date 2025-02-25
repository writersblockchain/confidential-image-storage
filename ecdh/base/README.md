npx hardhat compile

npx hardhat run scripts/deploy.js --network base
npx hardhat --network base run ./scripts/create_keys.js

npx hardhat --network base run ./scripts/store_encrypt.js
npx hardhat --network base run ./scripts/query_encrypt.js

