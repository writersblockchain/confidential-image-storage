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
  import Tesseract from 'tesseract.js';
  import multer, { FileFilterCallback } from 'multer';
  
  dotenv.config();
  
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
  
  // Custom OCR action provider
  const customOcrAction = customActionProvider<CdpWalletProvider>({
    name: 'read_text_from_image',
    description: 'Extract text from an uploaded image using OCR',
    schema: z.object({
      imagePath: z.string().describe('Path to the uploaded image file'),
    }),
    invoke: async (walletProvider, args: any) => {
      const { imagePath } = args;
  
      try {
        // Extract text using Tesseract.js
        const { data } = await Tesseract.recognize(imagePath, 'eng', {
          logger: (m) => console.log(m),
        });
        const extractedText = data.text.trim();
  
        // Clean up the temporary file
        fs.unlink(imagePath, (err) => {
          if (err) console.error('Error deleting temp file:', err);
        });
  
        if (!extractedText) {
          return 'No text extracted from the image';
        }
  
        return extractedText; // Return raw text for the agent to summarize
      } catch (error) {
        console.error('OCR error:', error);
        return `Failed to extract text: ${(error as Error).message}`;
      }
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
          You are an agent that processes image uploads and extracts text using OCR tools. When given an image path,
          use the 'read_text_from_image' tool to extract the text, then format the response as:
          - Full extracted text: "<text>"
          - Summary: "<brief summary of the text>"
          Provide concise and helpful responses. If a task requires capabilities beyond your current tools, inform the 
          user and suggest they implement it using the CDP SDK + AgentKit, referring them to docs.cdp.coinbase.com.
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
  
          // Clean up the file (already handled in customOcrAction, but ensure it’s gone)
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
          }
  
          res.json({ message: response });
        } catch (error) {
          console.error('Error processing image:', error);
          res.status(500).json({ error: 'Internal server error' });
  
          // Clean up on error
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
    console.log('Starting Image OCR Agent...');
    main().catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
  }