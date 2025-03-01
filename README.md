# Coinbase Agent with ID Verification

An AI-powered agent that can handle ID verification using PaddleOCR and LangChain.

## Features

- Chat interface with AI agent
- ID verification using PaddleOCR
- Secure file upload handling
- Integration with Coinbase CDP

## Prerequisites

- Node.js
- Python 3.9+
- Conda (for managing Python environment)

## Setup

1. Clone the repository:

   ```bash
   git clone https://github.com/zenopie/coinbase-agent.git
   cd coinbase-agent
   ```

2. Install Node.js dependencies:

   ```bash
   npm install
   ```

3. Set up Python environment:

   ```bash
   conda create -n paddle_env python=3.9
   conda activate paddle_env
   pip install paddlepaddle paddleocr
   ```

4. Create a `.env` file with required environment variables:

   ```
   OPENAI_API_KEY=your_openai_api_key
   CDP_API_KEY_NAME=your_cdp_key_name
   CDP_API_KEY_PRIVATE_KEY=your_cdp_private_key
   ```

5. Start the server:
   ```bash
   npm start
   ```

## Usage

1. Start a chat by sending a POST request to `/api/execute-intent`
2. When prompted for ID verification, upload an image to `/api/upload-image`

## API Endpoints

- POST `/api/execute-intent`: Chat with the agent
- POST `/api/upload-image`: Upload ID images for verification

## License

This project is licensed under the Apache-2.0 License.
