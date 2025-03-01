// imageInterpret.ts
import { ChatSecret, SECRET_AI_CONFIG } from "secretai";
import * as dotenv from "dotenv";
import * as fs from "fs";
import express, { Request, Response } from "express";
import cors from "cors";
import "express-async-errors";
import { spawn } from "child_process";
import multer, { FileFilterCallback } from "multer";
import { generateKeysIfMissing } from "./generateKeys.mjs";
import { hashData } from "./hashData.mjs";
import { storeHash } from "./storeHash.mjs";

dotenv.config();
//generateKeysIfMissing();

// Multer setup for image uploads
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req: express.Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    const filetypes = /jpeg|jpg|png/;
    const extname = filetypes.test(file.originalname.toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error("Only JPEG/JPG/PNG images are allowed"));
  },
});

// Define OCR tool
class OcrTool {
  name = "read_text_from_image";
  description = "Extract text from an uploaded image using PaddleOCR";

  async invoke(imagePath: string): Promise<string> {
    console.log("=== Starting OCR Process ===");
    console.log("Processing image at path:", imagePath);

    return new Promise((resolve, reject) => {
      console.log("Spawning PaddleOCR process...");
      const pythonProcess = spawn("python3", ["paddle_ocr.py", imagePath]);
      let extractedText = "";
      let debugOutput = "";

      if (!pythonProcess.stdout || !pythonProcess.stderr) {
        reject(new Error("Failed to create Python process streams"));
        return;
      }

      pythonProcess.stdout.on("data", (data) => {
        const output = data.toString();
        if (!output.startsWith("[202")) {
          console.log("OCR Extracted Text:", output);
          extractedText += output;
        } else {
          console.log("OCR Debug Info:", output);
        }
        debugOutput += output;
      });

      pythonProcess.stderr.on("data", (data) => {
        console.error("OCR Process Error:", data.toString());
        debugOutput += data.toString();
      });

      pythonProcess.on("close", (code) => {
        console.log("OCR Process finished with code:", code);

        if (code === 0 && extractedText.trim()) {
          console.log("=== OCR Success ===");
          console.log("Final extracted text:", extractedText.trim());
          resolve(extractedText.trim());
        } else if (code !== 0) {
          console.error("OCR Process failed. Debug output:", debugOutput);
          reject(new Error(`PaddleOCR failed: ${debugOutput}`));
        } else {
          console.log("OCR Process completed but no text was extracted");
          resolve("No text extracted from the image");
        }
      });

      pythonProcess.on("error", (err) => {
        console.error("Failed to start OCR process:", err);
        reject(new Error(`Failed to start PaddleOCR: ${err.message}`));
      });
    });
  }
}

function validateEnvironment(): void {
  const missingVars: string[] = [];
  const requiredVars = ["SECRET_AI_API_KEY"];
  requiredVars.forEach((varName) => {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  });

  if (missingVars.length > 0) {
    console.error("Error: Required environment variables are not set");
    missingVars.forEach((varName) => {
      console.error(`${varName}=your_${varName.toLowerCase()}_here`);
    });
    process.exit(1);
  }
}

validateEnvironment();

interface BlockchainTxResult {
  code: number;
  height: number;
  rawLog: string;
  transactionHash: string;
  gasUsed: number;
  gasWanted: number;
}

class Agent {
  private llm: ChatSecret;
  private ocrTool: OcrTool;

  constructor(llm: ChatSecret) {
    this.llm = llm;
    this.ocrTool = new OcrTool();
  }

  async invoke(message: string): Promise<any> {
    console.log("Processing message:", message);

    try {
      // Extract the imagePath from the message
      const imagePathMatch = message.match(/path:\s*([^\n]+)/);
      if (!imagePathMatch) {
        throw new Error("No image path found in message");
      }
      const imagePath = imagePathMatch[1].trim();

      // Execute the OCR tool
      console.log("Executing OCR tool with path:", imagePath);
      const ocrResult = await this.ocrTool.invoke(imagePath);

      // Convert newlines to spaces for cleaner processing
      const cleanOcrText = ocrResult.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
      console.log("Cleaned OCR Result:", cleanOcrText);

      // Use LLM to analyze the OCR result
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

      const llmResponse = await this.llm.chat(
        [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: `Return ONLY a JSON object containing this identity information: ${cleanOcrText}`,
          },
        ],
        {
          temperature: 0,
          max_tokens: 1000,
        }
      );

      console.log("Raw LLM Response:", llmResponse);

      try {
        // Extract the actual response content from the LLM response object
        const responseContent = llmResponse.message?.content || llmResponse.content || llmResponse;
        console.log("Response content:", responseContent);

        let parsedResponse;
        try {
          // If it's already an object, use it directly
          if (typeof responseContent === "object" && responseContent !== null) {
            parsedResponse = responseContent;
          } else if (typeof responseContent === "string") {
            // Clean any potential markdown or extra formatting
            const cleanedContent = responseContent
              .replace(/```json\n?|\n?```/g, "") // Remove markdown
              .replace(/<think>[\s\S]*?<\/think>/g, "") // Remove XML-like tags
              .trim();
            parsedResponse = JSON.parse(cleanedContent);
          } else {
            throw new Error("Invalid response type");
          }
          console.log("Successfully parsed response");
        } catch (parseError) {
          console.error("Failed to parse response:", parseError);
          throw new Error(`Failed to parse response: ${parseError.message}`);
        }

        // Validate response structure
        console.log("Validating response structure...");
        if (!parsedResponse?.response?.result?.identity) {
          console.error("Invalid response structure:", JSON.stringify(parsedResponse, null, 2));
          throw new Error("Invalid response structure");
        }
        console.log("Response structure is valid");

        return parsedResponse;
      } catch (error) {
        console.error("Failed to parse LLM response:", error);
        return {
          response: {
            debug: {
              rawOcrText: cleanOcrText,
              analysis: "Failed to parse LLM response",
              llmResponse: JSON.stringify(llmResponse, null, 2),
              error: error.message,
            },
            result: {
              identity: "Failed to parse identity information from OCR text",
              isIdentity: false,
            },
          },
        };
      }
    } catch (error) {
      console.error("Error in agent execution:", error);
      return {
        response: {
          debug: {
            rawOcrText: "",
            analysis: `Error during OCR: ${error.message}`,
            llmResponse: "",
            error: error.message,
          },
          result: {
            identity: "Unable to process image. OCR failed.",
            isIdentity: false,
          },
        },
      };
    }
  }
}

async function initializeAgent() {
  try {
    if (!process.env.SECRET_AI_API_KEY) {
      throw new Error("SECRET_AI_API_KEY environment variable is required");
    }

    const llm = new ChatSecret({
      apiKey: process.env.SECRET_AI_API_KEY,
      base_url: SECRET_AI_CONFIG.DEFAULT_LLM_URL,
      model: SECRET_AI_CONFIG.DEFAULT_LLM_MODEL,
      temperature: 0,
    });

    const agent = new Agent(llm);
    return { agent };
  } catch (error) {
    console.error("Failed to initialize agent:", error);
    throw error;
  }
}

async function main() {
  try {
    const { agent } = await initializeAgent();
    const app = express();
    app.use(
      cors({
        origin: true,
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Accept", "Origin"],
        credentials: true,
        maxAge: 86400,
      })
    );
    app.use(express.json());

    // Set timeout for requests
    app.use((req, res, next) => {
      // Set timeout to 20 minutes
      req.setTimeout(1200000);
      res.setTimeout(1200000);
      next();
    });

    app.post("/api/upload-image", upload.single("image"), async (req: Request, res: Response) => {
      let imagePath: string | null = null;
      let hasResponded = false;

      try {
        console.log("=== Received Upload Request ===");
        console.log("Request headers:", req.headers);
        console.log("Request body:", req.body);
        console.log("Request file:", req.file);

        if (!req.file) {
          throw new Error("No image uploaded");
        }

        imagePath = req.file.path;
        console.log("=== Starting Image Processing ===");
        console.log("Received image file:", req.file.originalname);
        console.log("Temporary path:", imagePath);

        const message = `Process this image by reading text from the image at path: ${imagePath}
        
        Analyze the text to find Country, ID Number, and Name fields.
        Return the results in JSON format with debug information and identity fields.`;

        console.log("Sending message to agent for processing");
        const result = await agent.invoke(message);

        if (result.response?.result?.isIdentity) {
          const { text } = result.response.result.identity;
          console.log("Extracted ID Data:", { text });

          try {
            console.log("=== Starting Blockchain Transaction ===");
            console.log("Generating hash from result data...");
            const hashResult = await hashData({ data: result.response.result });
            console.log("Hash generated:", hashResult.toString("hex"));

            console.log("Initiating hash storage transaction...");
            const txStartTime = Date.now();
            const txResult = (await storeHash(hashResult)) as unknown as BlockchainTxResult;
            const txDuration = Date.now() - txStartTime;

            console.log("=== Blockchain Transaction Details ===");
            console.log("Transaction duration:", txDuration, "ms");

            if (txResult) {
              console.log("Transaction hash:", txResult.transactionHash || "Not available");
              console.log("Gas used:", txResult.gasUsed || "Not available");
              console.log("Gas wanted:", txResult.gasWanted || "Not available");

              if (txResult.code === 0) {
                console.log("Transaction successful!");
                result.response.debug.blockchain = {
                  status: "success",
                  hash: txResult.transactionHash,
                  duration: txDuration,
                  transaction: txResult,
                };
              } else if (txResult.rawLog?.includes("ID already registered")) {
                console.log("ID already registered in the system");
                result.response.debug.blockchain = {
                  status: "already_exists",
                  message: "This ID has already been registered in the system",
                  hash: txResult.transactionHash,
                  duration: txDuration,
                  transaction: txResult,
                };
              } else {
                console.warn("Transaction completed with non-zero code:", txResult.code);
                result.response.debug.blockchain = {
                  status: "warning",
                  error: "Transaction completed with non-zero code",
                  code: txResult.code,
                  hash: txResult.transactionHash,
                  duration: txDuration,
                  transaction: txResult,
                };
              }
            }
          } catch (hashError) {
            const txEndTime = Date.now();
            console.error("=== Blockchain Transaction Error ===");
            console.error("Error details:", hashError);
            result.response.debug.blockchain = {
              status: "error",
              error: hashError instanceof Error ? hashError.message : String(hashError),
              duration: txEndTime - (result.response.debug.blockchain?.startTime || txEndTime),
            };
          }
        }

        // Clean up image file
        if (imagePath && fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
          console.log("Temporary image file deleted");
        }

        // Send success response
        console.log("Sending response:", JSON.stringify(result, null, 2));
        hasResponded = true;
        res.status(200).json(result);
      } catch (error) {
        console.error("Error processing request:", error);

        // Clean up image file on error
        if (imagePath && fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
          console.log("Cleaned up temporary image file after error");
        }

        // Send error response
        const errorResponse = {
          response: {
            debug: {
              rawOcrText: "",
              analysis: "Error processing request",
              thoughtProcess: error instanceof Error ? error.message : "Unknown error",
              blockchain: {
                status: "error",
                error: error instanceof Error ? error.message : "Unknown error",
              },
            },
            result: {
              identity: "Failed to process image",
              isIdentity: false,
            },
          },
        };

        console.log("Sending error response:", JSON.stringify(errorResponse, null, 2));
        if (!hasResponded) {
          hasResponded = true;
          res.status(500).json(errorResponse);
        }
      }
    });

    // Add error handling middleware
    app.use((err: Error, req: Request, res: Response, next: Function) => {
      console.error("=== Unhandled Error ===");
      console.error("Error details:", err);
      console.error("Stack trace:", err.stack);

      return res.status(500).json({
        response: {
          debug: {
            rawOcrText: "",
            analysis: "Unhandled server error",
            thoughtProcess: err.message || "An unexpected error occurred",
            blockchain: {
              status: "error",
              error: err.message || "An unexpected error occurred",
            },
          },
          result: {
            identity: "Server encountered an unhandled error",
            isIdentity: false,
          },
        },
      });
    });

    app.listen(3002, () => {
      console.log("Image OCR server listening on port 3002");
    });
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error:", error.message);
    }
    process.exit(1);
  }
}

if (import.meta.url === import.meta.resolve("./imageInterpret.mts")) {
  console.log("Starting Image OCR Agent with PaddleOCR...");
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
