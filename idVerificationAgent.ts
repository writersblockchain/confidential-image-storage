import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import { spawn } from "child_process";
import "express-async-errors";
import {
  AgentKit,
  CdpWalletProvider,
  customActionProvider,
  wethActionProvider,
  walletActionProvider,
  erc20ActionProvider,
  cdpApiActionProvider,
  cdpWalletActionProvider,
  pythActionProvider,
} from "@coinbase/agentkit";
import { getLangChainTools } from "@coinbase/agentkit-langchain";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MemorySaver } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import * as dotenv from "dotenv";

dotenv.config();
const PORT = process.env.PORT || 3001;

/** In-memory map: ticket -> callback function */
const uploadTickets = new Map<string, { isOpen: boolean; callback: (filePath: string) => Promise<any> }>();

/* -------------------------------------------------------------------------
   1. Validate Environment
------------------------------------------------------------------------- */
function validateEnvironment(): void {
  const required = ["OPENAI_API_KEY", "CDP_API_KEY_NAME", "CDP_API_KEY_PRIVATE_KEY"];
  const missing = required.filter((v) => !process.env[v]);
  if (missing.length) {
    console.error("🚨 Missing .env variables:", missing.join(", "));
    process.exit(1);
  }
}
validateEnvironment();

/* -------------------------------------------------------------------------
   2. Logging
------------------------------------------------------------------------- */
function logStep(step: string, data: any = {}) {
  console.log(`✅ [${new Date().toISOString()}] ${step}`, data);
}

/* -------------------------------------------------------------------------
   3. Helper Functions
------------------------------------------------------------------------- */
function createTicket(callback: (filePath: string) => Promise<any>): string {
  const ticket = uuidv4();
  uploadTickets.set(ticket, { isOpen: true, callback });
  setTimeout(() => {
    if (uploadTickets.get(ticket)?.isOpen) {
      uploadTickets.delete(ticket);
      logStep("Cleaned up expired ticket", { ticket });
    }
  }, 1000 * 60 * 5); // 5 minute timeout
  return ticket;
}

// Replace only the performOCR function in your existing server file:
async function performOCR(filePath: string): Promise<string> {
  return new Promise(async (resolve, reject) => {
    // Step 1: Perform PaddleOCR
    const pythonProcess = spawn("python3", ["paddle_ocr.py", filePath]);
    let extractedText = "";
    let debugOutput = "";

    pythonProcess.stdout.on("data", (data) => {
      const output = data.toString();
      logStep("PaddleOCR Output", { output });
      if (!output.startsWith("[202")) { // Filter out PaddleOCR debug logs
        extractedText += output;
      }
      debugOutput += output;
    });

    pythonProcess.stderr.on("data", (data) => {
      logStep("PaddleOCR Error", { error: data.toString() });
      debugOutput += data.toString();
    });

    pythonProcess.on("error", (err) => {
      reject(new Error(`Failed to start PaddleOCR: ${err.message}`));
    });

    pythonProcess.on("close", async (code) => {
      // Clean up the file
      fs.unlink(filePath, (err) => {
        if (err) console.error("Error deleting temp file:", err);
      });

      if (code !== 0) {
        reject(new Error(`PaddleOCR failed: ${debugOutput}`));
        return;
      }

      if (!extractedText.trim()) {
        resolve("No text extracted from the image");
        return;
      }

      // Step 2: Interpret with LLM
      try {
        const llm = new ChatOpenAI({
          model: "gpt-4o-mini",
          openAIApiKey: process.env.OPENAI_API_KEY,
        });

        const cleanOcrText = extractedText.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
        logStep("Cleaned OCR Text", { text: cleanOcrText });

        const systemPrompt = `IMPORTANT: You are a JSON-only responder. You must output NOTHING except a JSON object.
DO NOT include any markdown formatting, XML tags, or explanatory text.
DO NOT use \`\`\`json or any other markers.
DO NOT include any thinking or explanation.
ONLY output the exact JSON structure shown below:

{
  "response": {
    "debug": {
      "rawOcrText": "text as single line with no special characters",
      "analysis": "one line summary"
    },
    "result": {
      "identity": {
        "Country": "country name",
        "ID Number": "ID number",
        "Name": "full name"
      },
      "isIdentity": true
    }
  }
}`;

        const response = await llm.invoke([
          { role: "system", content: systemPrompt },
          { 
            role: "user", 
            content: `Return ONLY a JSON object containing this identity information: ${cleanOcrText}` 
          }
        ]);

        const parsedResponse = JSON.parse(response.content as string);
        logStep("LLM Response", { response: parsedResponse });

        if (parsedResponse.response?.result?.isIdentity) {
          const { Country, "ID Number": idNumber, Name } = parsedResponse.response.result.identity;
          resolve(JSON.stringify({
            Country,
            "ID Number": idNumber,
            Name
          }));
        } else {
          resolve("Unable to interpret text as a complete ID");
        }
      } catch (error) {
        logStep("LLM Interpretation Error", { error: error.message });
        resolve(`OCR succeeded but interpretation failed: ${extractedText.trim()}`);
      }
    });
  });
}

/* -------------------------------------------------------------------------
   4. Custom Action: ID Verification
------------------------------------------------------------------------- */
const registerIdAction = customActionProvider<CdpWalletProvider>({
  name: "register_id_action",
  description: `
    Use this tool to create an ephemeral ticket for image upload.
    
    When invoked, this action generates a unique ticket and stores a callback that will be 
    used to process the uploaded image using PaddleOCR.
  `,
  schema: z.object({}),
  invoke: async (_walletProvider, _args) => {
    const callback = async (filePath: string) => {
      return await performOCR(filePath);
    };

    const ticket = createTicket(callback);
    return {
      success: true,
      action: "request_image_upload",
      ticket: ticket,
      message: `Please upload your image using the provided button.`,
      uploadUrl: `/api/upload-image?ticket=${ticket}`
    };
  },
});

/* -------------------------------------------------------------------------
   5. Initialize Agent & Endpoints
------------------------------------------------------------------------- */
async function main() {
  logStep("Starting Agent Initialization...");

  const walletProvider = await CdpWalletProvider.configureWithWallet({
    apiKeyName: process.env.CDP_API_KEY_NAME!,
    apiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY!.replace(/\\n/g, "\n"),
    networkId: "base-sepolia",
  });

  const agentKit = await AgentKit.from({
    walletProvider,
    actionProviders: [
      wethActionProvider(),
      pythActionProvider(),
      walletActionProvider(),
      erc20ActionProvider(),
      cdpApiActionProvider({
        apiKeyName: process.env.CDP_API_KEY_NAME!,
        apiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY!.replace(/\\n/g, "\n"),
      }),
      cdpWalletActionProvider({
        apiKeyName: process.env.CDP_API_KEY_NAME!,
        apiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY!.replace(/\\n/g, "\n"),
      }),
      registerIdAction,
    ],
  });

  const tools = await getLangChainTools(agentKit);
  console.log("Available tools:", tools.map((t) => t.name));

  const memory = new MemorySaver();
  const agent = createReactAgent({
    llm: new ChatOpenAI({ model: "gpt-4o-mini" }),
    tools,
    checkpointSaver: memory,
    configurable: { thread_id: "id_verification_session" },
  });

  const app = express();
  app.use(cors());
  app.use(express.json());

  // Multer setup for image uploads
  const upload = multer({
    dest: "uploads/",
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
      const filetypes = /jpeg|jpg|png/;
      const extname = filetypes.test(file.originalname.toLowerCase());
      const mimetype = filetypes.test(file.mimetype);
      if (extname && mimetype) {
        cb(null, true);
      } else {
        cb(new Error("Only JPEG/JPG/PNG images are allowed"));
      }
    },
  });

  // 1) Normal conversation endpoint
  app.post("/api/execute-intent", async (req, res) => {
    try {
      const { message } = req.body;
      if (!message) {
        return res.status(400).json({ error: "No message provided" });
      }
      logStep("Chat request", { message });

      let fullResponse = "";
      const stream = await agent.stream(
        { messages: [new HumanMessage(message)] },
        { configurable: { thread_id: "id_verification_session" } }
      );
      for await (const chunk of stream) {
        fullResponse += "agent" in chunk
          ? chunk.agent.messages[0].content
          : chunk.tools.messages[0].content;
      }

      logStep("Agent response", { fullResponse });
      res.json({ message: fullResponse });
    } catch (err) {
      console.error("❌ Chat error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // 2) Image upload endpoint
  app.post("/api/upload-image", upload.single("file"), async (req, res) => {
    try {
      const ticket = req.query.ticket as string || req.body.ticket;
      if (!ticket) {
        return res.status(400).json({ error: "Missing ticket" });
      }
      if (!uploadTickets.has(ticket) || !uploadTickets.get(ticket)?.isOpen) {
        return res.status(400).json({ error: "Invalid or expired ticket" });
      }
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      logStep("File received for OCR", { ticket, path: req.file.path });

      const ticketData = uploadTickets.get(ticket)!;
      const result = await ticketData.callback(req.file.path);
      
      uploadTickets.set(ticket, { ...ticketData, isOpen: false });
      
      logStep("OCR complete", { result });
      res.json({ 
        success: true,
        ocrResult: result 
      });
    } catch (error) {
      console.error("❌ File upload error:", error);
      res.status(500).json({ 
        success: false,
        error: "Failed to process image" 
      });
    }
  });

  app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
}

main().catch((err) => {
  console.error("❌ Fatal Error:", err);
  process.exit(1);
});