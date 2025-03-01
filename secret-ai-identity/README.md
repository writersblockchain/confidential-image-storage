# Image Identity Interpreter

An autonomous service that intelligently extracts and analyzes identity information from images. The system combines PaddleOCR's text extraction with AI-powered analysis to automatically identify and validate identity documents, with blockchain-based verification on the Secret Network.

## Features

- Autonomous document processing without manual intervention
- Intelligent field extraction (Country, ID Number, Name)
- Self-validating identity verification
- Automatic error handling and recovery
- Real-time processing and response
- Blockchain-based identity verification on Secret Network
- Secure AI processing through SecretAI
- Privacy-preserving identity hash storage

## Setup

1. Install Conda environment:

```bash
conda create -n paddle python=3.9
conda activate paddle
pip install "paddlepaddle>=2.0.0"
pip install "paddleocr>=2.0.1"
```

2. Install Node.js dependencies:

```bash
npm install
```

3. Set up environment variables:

```bash
cp .env.example .env  # Then edit .env with your settings
```

Required environment variables:

- `SECRET_AI_API_KEY` - Your SecretAI API key
- `MNEMONIC` - Your Secret Network wallet mnemonic for blockchain transactions

## Secret Network Configuration

The service uses Secret Network's Pulsar-3 testnet for secure identity verification. The blockchain integration:

- Stores identity document hashes on-chain
- Prevents duplicate registrations
- Maintains privacy through encryption
- Provides transaction verification

Contract Details:

- Network: `pulsar-3`
- RPC URL: `https://pulsar.lcd.secretnodes.com`
- Contract Address: `secret17cmtjg3hu7yrndv9zd2tcs566svh2zxyxp9e3d`

To use the blockchain features:

1. Ensure your wallet has sufficient SCRT tokens for gas fees
2. The provided mnemonic should correspond to a funded account
3. Transactions are automatically handled by the service

## Running the Service

1. Activate the Conda environment:

```bash
conda activate paddle
```

2. Start the autonomous server:

```bash
npm run start
```

The service will automatically process requests at http://localhost:3002

## How It Works

The system operates autonomously through several stages:

1. Image Reception - Automatically handles incoming document images
2. OCR Processing - Intelligently extracts text using PaddleOCR
3. AI Analysis - Autonomously identifies and validates identity information through SecretAI
4. Blockchain Verification:
   - Generates a secure hash of the identity data
   - Checks for existing registrations
   - Stores the hash on Secret Network
   - Returns transaction verification
5. Response Generation - Self-validates and returns structured data with verification status

## Project Structure

- `imageInterpret.mts` - Core AI processing and blockchain logic
- `paddle_ocr.py` - Automated OCR implementation
- `storeHash.mjs` - Secret Network transaction handling
- `generateKeys.mjs` - Cryptographic key management
- `uploads/` - Temporary image storage
- `.env` - Environment configuration
- `requirements.txt` - Python dependencies

## API Response Format

The service returns a JSON response with the following structure:

```json
{
  "response": {
    "debug": {
      "rawOcrText": "Extracted text from image",
      "analysis": "Analysis summary",
      "blockchain": {
        "status": "success|error|already_exists",
        "hash": "Transaction hash if successful",
        "duration": "Transaction duration in ms",
        "transaction": {
          "code": 0,
          "height": "block height",
          "transactionHash": "tx hash",
          "gasUsed": "gas used",
          "gasWanted": "gas limit"
        }
      }
    },
    "result": {
      "identity": {
        "Country": "Detected country",
        "ID Number": "Extracted ID number",
        "Name": "Full name"
      },
      "isIdentity": true
    }
  }
}
```

## Blockchain Response Status Codes

- `success` - Hash successfully stored on-chain
- `already_exists` - Identity document already registered
- `error` - Transaction failed (includes error details)
- `warning` - Transaction completed with non-zero code

## Error Handling

The service includes comprehensive error handling for:

- Invalid images or unsupported formats
- OCR processing failures
- AI analysis errors
- Blockchain transaction issues:
  - Insufficient gas
  - Network connectivity
  - Contract errors
  - Account validation
- Network connectivity problems

Each error response includes detailed debug information to help identify the source of the problem.
