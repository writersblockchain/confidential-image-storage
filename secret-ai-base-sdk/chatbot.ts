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
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import * as dotenv from "dotenv";
import * as fs from "fs";

dotenv.config();

// Validate required environment variables
const requiredVars = ["OPENAI_API_KEY", "CDP_API_KEY_NAME", "CDP_API_KEY_PRIVATE_KEY"];
for (const varName of requiredVars) {
  if (!process.env[varName]) {
    console.error(`❌ Missing environment variable: ${varName}`);
    process.exit(1);
  }
}

// Default NETWORK_ID if not set
const NETWORK_ID = process.env.NETWORK_ID || "base-sepolia";
console.log(`🌐 Using network: ${NETWORK_ID}`);

const WALLET_DATA_FILE = "wallet_data.txt";



/**
 * Initialize the chatbot agent with Coinbase AgentKit
 */

async function initializeAgent() {
  try {
    console.log("🚀 Initializing SecretAI...");

    const secretAI = await import("secretai");
    const { ChatSecret, SECRET_AI_CONFIG } = secretAI;

    const llm = new ChatSecret({
      apiKey: process.env.SECRET_AI_API_KEY,
      base_url: SECRET_AI_CONFIG.DEFAULT_LLM_URL,
      model: SECRET_AI_CONFIG.DEFAULT_LLM_MODEL,
      temperature: 1.0,
    });

    console.log("✅ SecretAI initialized.");

    let walletDataStr: string | null = null;
    if (fs.existsSync(WALLET_DATA_FILE)) {
      try {
        walletDataStr = fs.readFileSync(WALLET_DATA_FILE, "utf8");
        console.log("✅ Wallet data loaded.");
      } catch (error) {
        console.error("⚠️ Error reading wallet data:", error);
      }
    }

    console.log("🚀 Setting up AgentKit configuration...");
    const config = {
      apiKeyName: process.env.CDP_API_KEY_NAME,
      apiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY,
      cdpWalletData: walletDataStr || undefined,
      networkId: NETWORK_ID,
    };

    console.log("✅ Config initialized:", config);

    console.log("🚀 Configuring Wallet Provider...");
    const walletProvider = await CdpWalletProvider.configureWithWallet(config);
    console.log("✅ Wallet Provider configured.");

    console.log("🚀 Initializing AgentKit...");
    const agentkit = await AgentKit.from({
      walletProvider,
      actionProviders: [
        wethActionProvider(),
        pythActionProvider(),
        walletActionProvider(),
        erc20ActionProvider(),
        cdpApiActionProvider(config),
        cdpWalletActionProvider(config),
      ],
    });

    console.log("✅ AgentKit initialized.");

    console.log("🚀 Fetching LangChain tools...");
    const tools = await getLangChainTools(agentkit);
    console.log("🔍 Available tools:", tools.map((t) => t.name));

    console.log("🚀 Binding tools to SecretAI...");
    llm.bindTools(tools);
    console.log("✅ Tools bound to SecretAI.");

    const memory = new MemorySaver();

    console.log("🚀 Creating React Agent...");
    const agent = createReactAgent({
      llm,
      tools,
      checkpointSaver: memory,
      messageModifier: `
        You are a helpful agent that can interact onchain using the Coinbase Developer Platform AgentKit.
        You can check wallet balances, interact with ERC-20 tokens, and request funds from the faucet
        if on network ID 'base-sepolia'. If the user asks for their balance, use the walletActionProvider tool.
        
        If you need funds, you can request them from the faucet when on network ID 'base-sepolia'. 
        Otherwise, provide the user's wallet address and ask them to manually fund it.
    
        If there is a 5XX error, ask the user to try again later.
        If asked to do something beyond your current tools, suggest implementing it using the CDP SDK + AgentKit.
        Be concise and helpful. Do not restate tool descriptions unless explicitly requested.
      `,
    });

    console.log("✅ React Agent created.");

    console.log("🚀 Saving wallet data...");
    fs.writeFileSync(WALLET_DATA_FILE, JSON.stringify(await walletProvider.exportWallet()));
    console.log("✅ Wallet data saved.");

    console.log("✅ Agent initialized successfully.");
    return { agent, llm, agentkit, tools };
  } catch (error) {
    console.error("❌ Failed to initialize agent:", error);
    throw error;
  }
}


/**
 * Send a hardcoded message to SecretAI
 */
async function sendHardcodedMessage(agent: any, llm: any) {
  const messages = [
    { role: "system", content: "You are a blockchain AI that assists with Coinbase Developer Platform transactions." },
    { role: "user", content: "Check my wallet balance." },
    { role: "user", content: "Request 1 tokens from the faucet." },
  ];

  console.log("📤 Sending hardcoded request to SecretAI:", JSON.stringify(messages, null, 2));

  try {
    console.time("SecretAI Response Time"); // Start timer
    const response = await llm.chat(messages);
    console.timeEnd("SecretAI Response Time"); // End timer
    console.log("✅ Response from SecretAI:", response);
  } catch (error) {
    console.error("❌ Error from SecretAI:", error);
  }
}

async function testWalletQuery(tools: any) {
  try {
    console.log("🔍 Testing manual wallet balance query...");

    // Find the ERC-20 balance tool
    const erc20BalanceTool = tools.find((t: any) => t.name === "ERC20ActionProvider_get_balance");
    if (!erc20BalanceTool) {
      console.error("❌ ERC-20 balance tool not found!");
      return;
    }

    // Call the tool
    const balance = await erc20BalanceTool.invoke({
      address: "0xYourWalletAddressHere", // Replace with actual wallet address
    });

    console.log("✅ Wallet Balance:", balance);
  } catch (error) {
    console.error("❌ Error testing wallet tool:", error);
  }
}

async function testFaucetRequest(tools: any) {
  try {
    console.log("🔍 Testing faucet fund request...");

    // Find the faucet request tool
    const faucetTool = tools.find((t: any) => t.name === "CdpApiActionProvider_request_faucet_funds");
    if (!faucetTool) {
      console.error("❌ Faucet tool not found!");
      return;
    }

    // Call the faucet request tool
    const result = await faucetTool.invoke({
      address: "0xYourWalletAddressHere", // Replace with actual wallet address
      amount: "10", // Request 10 tokens
    });

    console.log("✅ Faucet Request Result:", result);
  } catch (error) {
    console.error("❌ Error testing faucet request:", error);
  }
}


/**
 * Start the chatbot
 */
async function main() {
  try {
    console.log("🚀 Starting Agent...");
    const { agent, llm, tools } = await initializeAgent(); // ✅ Use tools instead of agentkit

    await testWalletQuery(tools); // ✅ Pass tools
    await testFaucetRequest(tools); // ✅ Pass tools
    await sendHardcodedMessage(agent, llm);
  } catch (error) {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  }
}
main()