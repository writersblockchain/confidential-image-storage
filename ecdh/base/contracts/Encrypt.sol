// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Encrypt {
    // Array to hold the bytes data
    bytes[] private encryptedData;

    // Event to emit when data is stored
    event DataStored(uint256 indexed id);

    // Function to store encrypted data
    function storeData(bytes memory data) public {
        encryptedData.push(data);
        emit DataStored(encryptedData.length - 1);
    }

    // Function to retrieve stored data by index
    function getStoredData(uint256 index) public view returns (bytes memory) {
        require(index < encryptedData.length, "Index out of bounds");
        return encryptedData[index];
    }
}
