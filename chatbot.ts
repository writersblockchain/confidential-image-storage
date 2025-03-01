import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import cors from "cors";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

import {
  AgentKit,
  CdpWalletProvider,
  wethActionProvider,
  walletActionProvider,
  erc20ActionProvider,
  cdpApiActionProvider,
  cdpWalletActionProvider,
  pythActionProvider,
} from "@coinbase/agentkit";

import { getLangChainTools } from "@coinbase/agentkit-langchain";
import { HumanMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";

dotenv.config();
const WALLET_DATA_FILE = "wallet_data.txt";

// Validate environment variables
function validateEnvironment(): void {
  const requiredVars = ["OPENAI_API_KEY", "CDP_API_KEY_NAME", "CDP_API_KEY_PRIVATE_KEY"];
  const missing = requiredVars.filter((v) => !process.env[v]);

  if (missing.length) {
    missing.forEach((v) => console.error(`${v}=your_${v.toLowerCase()}_here`));
    process.exit(1);
  }

  if (!process.env.NETWORK_ID) {
    console.warn("Warning: NETWORK_ID not set, defaulting to base-sepolia testnet");
  }
}
validateEnvironment();

// Initialize agent and wallet
async function initializeAgent() {
  const llm = new ChatOpenAI({ model: "gpt-4o-mini" });
  let walletDataStr: string | undefined;
  const walletPath = path.resolve(WALLET_DATA_FILE);

  if (fs.existsSync(walletPath)) {
    try {
      walletDataStr = fs.readFileSync(walletPath, "utf8");
    } catch (error) {
      console.error("Error reading wallet data:", error);
    }
  }

  const config = {
    apiKeyName: process.env.CDP_API_KEY_NAME as string,
    apiKeyPrivateKey: (process.env.CDP_API_KEY_PRIVATE_KEY as string)?.replace(/\\n/g, "\n"),
    cdpWalletData: walletDataStr || undefined,
    networkId: process.env.NETWORK_ID || "base-sepolia",
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
        apiKeyName: process.env.CDP_API_KEY_NAME as string,
        apiKeyPrivateKey: (process.env.CDP_API_KEY_PRIVATE_KEY as string)?.replace(/\\n/g, "\n"),
      }),
      cdpWalletActionProvider({
        apiKeyName: process.env.CDP_API_KEY_NAME as string,
        apiKeyPrivateKey: (process.env.CDP_API_KEY_PRIVATE_KEY as string)?.replace(/\\n/g, "\n"),
      }),
    ],
  });

  const tools = await getLangChainTools(agentkit);
  const memory = new MemorySaver();
  const agentConfig = { configurable: { thread_id: "CDP AgentKit Chatbot Example!" } };

  const agent = createReactAgent({
    llm,
    tools,
    checkpointSaver: memory,
    messageModifier:
      "You are a helpful agent that can interact onchain using the Coinbase Developer Platform AgentKit. If funds are needed and you're on network ID 'base-sepolia', request from the faucet. Otherwise, ask the user for wallet details. In case of 5XX errors, advise retry. If a requested action isn't available via your tools, state so and suggest implementing via the CDP SDK. Be concise and helpful.",
  });

  const exportedWallet = await walletProvider.exportWallet();
  fs.writeFileSync(walletPath, JSON.stringify(exportedWallet));

  return { agent, agentConfig };
}

// Create Express server and endpoint
async function startServer() {
  const { agent, agentConfig } = await initializeAgent();
  const app = express();
  app.use(cors());
  app.use(bodyParser.json());

  const PORT = process.env.PORT || 3001;

  app.post("/api/execute-intent", async (req: Request, res: Response) => {
    console.log("API entry");
    const { message } = req.body;
    if (!message) {
      res.json({ success: false, error: "No message provided" });
      return;
    }

    try {
      let output = "";
      console.log("Starting agent stream with message:", message);
      const stream = await agent.stream({ messages: [new HumanMessage(message)] }, agentConfig);

      for await (const chunk of stream) {
        console.log("Received chunk:", chunk);
        if ("agent" in chunk) {
          output += chunk.agent.messages[0].content;
        } else if ("tools" in chunk) {
          output += chunk.tools.messages[0].content;
        }
      }

      console.log("Final output from agent:", output);
      const txMatch = output.match(/Transaction Sent:\s*([^\s]+)/);
      if (txMatch) {
        res.json({ success: true, txHash: txMatch[1] });
      } else {
        res.json({ success: false, error: output });
      }
    } catch (error) {
      console.error("Error in /api/execute-intent:", error);
      res.json({ success: false, error: (error as Error).message || "Unknown error" });
    }
  });

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
