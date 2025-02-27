// imageInterpret.ts
import {
  AgentKit,
  CdpWalletProvider,
  wethActionProvider,
  walletActionProvider,
  erc20ActionProvider,
  cdpApiActionProvider,
  cdpWalletActionProvider,
  pythActionProvider,
  customActionProvider,
} from '@coinbase/agentkit';
import { getLangChainTools } from '@coinbase/agentkit-langchain';
import { HumanMessage } from '@langchain/core/messages';
import { MemorySaver } from '@langchain/langgraph';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import express, { Request, Response } from 'express';
import cors from 'cors';
import 'express-async-errors';
import { z } from 'zod';
import { spawn } from 'child_process';
import multer, { FileFilterCallback } from 'multer';

const { generateKeysIfMissing } = require("./generateKeys");
const { hashData } = require("./hashData");
const { storeHash } = require("./storeHash.js");

dotenv.config({ path: "../.env" });
generateKeysIfMissing();

const WALLET_DATA_FILE = 'wallet_data.txt';

// Multer setup for image uploads
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req: express.Request, file: Express.Multer.File, cb: FileFilterCallback) => {
      const filetypes = /jpeg|jpg|png/;
      const extname = filetypes.test(file.originalname.toLowerCase());
      const mimetype = filetypes.test(file.mimetype);
      if (extname && mimetype) {
          return cb(null, true);
      }
      cb(new Error('Only JPEG/JPG/PNG images are allowed'));
  },
});

const customOcrAction = customActionProvider<CdpWalletProvider>({
  name: 'read_text_from_image',
  description: 'Extract text from an uploaded image using PaddleOCR',
  schema: z.object({
      imagePath: z.string().describe('Path to the uploaded image file'),
  }),
  invoke: async (walletProvider, args: any) => {
      const { imagePath } = args;

      return new Promise((resolve, reject) => {
          const pythonProcess = spawn('python3', ['paddle_ocr.py', imagePath]);
          let extractedText = '';
          let debugOutput = '';

          // Log PaddleOCR debug info and text
          pythonProcess.stdout.on('data', (data) => {
              const output = data.toString();
              console.log('PaddleOCR Output:', output); // Log all stdout (debug + text)
              if (!output.startsWith('[202')) { // Filter out debug logs for extracted text
                  extractedText += output;
              }
              debugOutput += output; // Keep full output for debugging
          });

          pythonProcess.stderr.on('data', (data) => {
              console.error('PaddleOCR Debug/Error:', data.toString()); // Log errors or debug
              debugOutput += data.toString();
          });

          pythonProcess.on('close', (code) => {
              fs.unlink(imagePath, (err) => {
                  if (err) console.error('Error deleting temp file:', err);
              });

              if (code === 0 && extractedText.trim()) {
                  console.log('Extracted Text for Agent:', extractedText.trim()); // Log clean text
                  resolve(extractedText.trim());
              } else if (code !== 0) {
                  console.error('PaddleOCR failed with code:', code, 'Output:', debugOutput);
                  reject(new Error(`PaddleOCR failed: ${debugOutput}`));
              } else {
                  console.log('No text extracted from the image');
                  resolve('No text extracted from the image');
              }
          });

          pythonProcess.on('error', (err) => {
              console.error('Failed to spawn Python process:', err);
              reject(new Error(`Failed to start PaddleOCR: ${err.message}`));
          });
      });
  },
});

function validateEnvironment(): void {
  const missingVars: string[] = [];
  const requiredVars = [
      'OPENAI_API_KEY',
      'CDP_API_KEY_NAME',
      'CDP_API_KEY_PRIVATE_KEY',
  ];
  requiredVars.forEach((varName) => {
      if (!process.env[varName]) {
          missingVars.push(varName);
      }
  });

  if (missingVars.length > 0) {
      console.error('Error: Required environment variables are not set');
      missingVars.forEach((varName) => {
          console.error(`${varName}=your_${varName.toLowerCase()}_here`);
      });
      process.exit(1);
  }

  if (!process.env.NETWORK_ID) {
      console.warn('Warning: NETWORK_ID not set, defaulting to base-sepolia testnet');
  }
}

validateEnvironment();

async function initializeAgent() {
  try {
      const llm = new ChatOpenAI({
          model: 'gpt-4o-mini',
      });

      let walletDataStr: string | null = null;
      if (fs.existsSync(WALLET_DATA_FILE)) {
          try {
              walletDataStr = fs.readFileSync(WALLET_DATA_FILE, 'utf8');
          } catch (error) {
              console.error('Error reading wallet data:', error);
          }
      }

      const config = {
          apiKeyName: process.env.CDP_API_KEY_NAME,
          apiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          cdpWalletData: walletDataStr || undefined,
          networkId: process.env.NETWORK_ID || 'base-sepolia',
      };

      const walletProvider = await CdpWalletProvider.configureWithWallet(config);

      const agentkit = await AgentKit.from({
          walletProvider,
          actionProviders: [
              wethActionProvider(),
              pythActionProvider(),
              walletActionProvider(),
              erc20ActionProvider(),
              cdpApiActionProvider({
                  apiKeyName: process.env.CDP_API_KEY_NAME,
                  apiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY?.replace(/\\n/g, '\n'),
              }),
              cdpWalletActionProvider({
                  apiKeyName: process.env.CDP_API_KEY_NAME,
                  apiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY?.replace(/\\n/g, '\n'),
              }),
              customOcrAction,
          ],
      });

      const tools = await getLangChainTools(agentkit);
      const memory = new MemorySaver();
      const agentConfig = {
          configurable: { thread_id: 'Image OCR Agent Example' },
      };

      const agent = createReactAgent({
          llm,
          tools,
          checkpointSaver: memory,
          messageModifier: `
              You are an agent that processes image uploads and extracts text using OCR tools. When given an image path, follow these steps exactly:
          
              1. Use the 'read_text_from_image' tool to extract text. If it fails or returns unreadable text, respond with "Unable to extract text from the image."
              
              2. Analyze the extracted text for ID fields: country (or nation/origin), ID number, and name.

              3. **PLEASE The output MUST start with the exact string "JSON:" and include no additional text.**
              
              4. If all four fields are extracted with non-empty values, output exactly and ONLY the following:
                 JSON:{
                   "identity": {
                     "Country": "<country>",
                     "ID Number": "<id>",
                     "Name": "<name>"
                   },
                   "isIdentity": true
                 }
              
              5. If fewer than three fields are found, output exactly and ONLY:
                 JSON:{
                   "identity": "Unable to interpret text as a complete ID. Some required fields (country, ID number, name) may be missing or unreadable.",
                   "isIdentity": false
                 }

              6. **PLEASE The output MUST start with the exact string "JSON:" and include no additional text.**
          `,
      });

      const exportedWallet = await walletProvider.exportWallet();
      fs.writeFileSync(WALLET_DATA_FILE, JSON.stringify(exportedWallet));

      return { agent, config: agentConfig };
  } catch (error) {
      console.error('Failed to initialize agent:', error);
      throw error;
  }
}

async function main() {
  try {
      const { agent, config } = await initializeAgent();
      const app = express();
      app.use(cors({
          origin: 'http://localhost:3000',
          methods: ['POST'],
          allowedHeaders: ['Content-Type'],
      }));
      app.use(express.json());

      app.post('/api/upload-image', upload.single('image'), async (req: Request, res: Response) => {
        if (!req.file) {
            res.status(400).json({ error: 'No image uploaded' });
            return;
        }
    
        const imagePath = req.file.path;
        const message = `read text from image: ${imagePath}`;
    
        try {
            const stream = await agent.stream(
                { messages: [new HumanMessage(message)] },
                config
            );
    
            let response = '';
            for await (const chunk of stream) {
                if ('agent' in chunk) {
                    response += chunk.agent.messages[0].content;
                } else if ('tools' in chunk) {
                    response += chunk.tools.messages[0].content;
                }
            }
    
            console.log('Full Agent Response:', response); // Already logging this
    
            // Extract JSON
            const jsonPrefix = "JSON:";
            const jsonStartIndex = response.indexOf(jsonPrefix);
            if (jsonStartIndex === -1) {
                console.error('No JSON found in response:', response);
                throw new Error('JSON object not found in response');
            }
    
            const jsonString = response.substring(jsonStartIndex + jsonPrefix.length).trim();
            console.log('Extracted JSON String:', jsonString); // Log for debugging
    
            let parsed;
            try {
                parsed = JSON.parse(jsonString);
                console.log('Parsed JSON:', parsed); // Log the parsed object
            } catch (e) {
                console.error('JSON Parse Error:', e, 'Raw JSON String:', jsonString);
                throw new Error('Invalid JSON response format');
            }
    
            if (!('identity' in parsed) || !('isIdentity' in parsed)) {
                console.error('Invalid JSON structure:', parsed);
                throw new Error('Invalid response format');
            }
    
            if (parsed.isIdentity) {
                const { Country, "ID Number": idNumber, Name } = parsed.identity;
                console.log('Extracted ID Data:', { Country, idNumber, Name });
                hashData({ data: parsed })
                    .then(async (hashData: Buffer) => {
                        console.log("Hash Data:", hashData.toString('hex'));
                        await storeHash(hashData);
                    })
                    .catch((err: Error) => console.error("Hashing/Store error:", err));
            } else {
                console.log('Response does not contain a valid identity:', parsed.identity);
            }
    
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
    
            res.json({ message: parsed });
    
            // Option 2: Send raw JSON 
            //res.json(parsed);
    
        } catch (error) {
            console.error('Error processing image:', error);
            res.status(500).json({ error: 'Internal server error' });
    
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        }
    });

      app.listen(3002, () => {
          console.log('Image OCR server listening on port 3002');
      });
  } catch (error) {
      if (error instanceof Error) {
          console.error('Error:', error.message);
      }
      process.exit(1);
  }
}

if (require.main === module) {
  console.log('Starting Image OCR Agent with PaddleOCR...');
  main().catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
  });
}