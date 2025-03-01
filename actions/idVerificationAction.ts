import { customActionProvider, CdpWalletProvider } from "@coinbase/agentkit";
import { z } from "zod";
import multer from "multer";
import { spawn } from "child_process";
import * as fs from "fs";
import express from "express";
import { hashData } from "../hashData.ts";
import { storeHash } from "../storeHash.ts";

// Multer setup for image uploads
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req: express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const filetypes = /jpeg|jpg|png/;
    const extname = filetypes.test(file.originalname.toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error("Only JPEG/JPG/PNG images are allowed"));
  },
});

export const idVerificationAction = customActionProvider<CdpWalletProvider>({
  name: "verify_id",
  description:
    "Verify an ID document by processing an uploaded image, extracting information using OCR, and storing it on the blockchain",
  schema: z.object({
    requestUpload: z.boolean().optional().describe("Set to true to request a file upload from the user"),
    imagePath: z.string().optional().describe("Path to the uploaded image file"),
  }),
  invoke: async (walletProvider, args: { requestUpload?: boolean; imagePath?: string }) => {
    if (args.requestUpload || !args.imagePath) {
      return {
        status: "upload_required",
        message: "Please upload an image of your ID document.",
        uploadEndpoint: "/api/upload-image",
      };
    }

    // Process the image with OCR
    const ocrResult = await new Promise<string>((resolve, reject) => {
      const pythonProcess = spawn("python3", ["paddle_ocr.py", args.imagePath]);
      let extractedText = "";
      let debugOutput = "";

      pythonProcess.stdout.on("data", (data) => {
        const output = data.toString();
        if (!output.startsWith("[202")) {
          extractedText += output;
        }
        debugOutput += output;
      });

      pythonProcess.stderr.on("data", (data) => {
        debugOutput += data.toString();
      });

      pythonProcess.on("close", (code) => {
        fs.unlink(args.imagePath!, (err) => {
          if (err) console.error("Error deleting temp file:", err);
        });

        if (code === 0 && extractedText.trim()) {
          resolve(extractedText.trim());
        } else if (code !== 0) {
          reject(new Error(`OCR processing failed: ${debugOutput}`));
        } else {
          resolve("No text extracted from the image");
        }
      });
    });

    // Parse the OCR result
    const idData = parseIdData(ocrResult);

    if (!idData.isValid) {
      return {
        status: "error",
        message: "Could not extract valid ID information from the image",
        details: idData.error,
      };
    }

    // Store on blockchain
    try {
      const hashResult = await hashData({ data: idData.data });
      const txResult = await storeHash(hashResult);

      if (txResult.code === 0) {
        return {
          status: "success",
          message: "ID verified and stored successfully",
          data: idData.data,
          transaction: {
            hash: txResult.transactionHash,
            blockHeight: txResult.height,
          },
        };
      } else {
        return {
          status: "error",
          message: "Failed to store ID on blockchain",
          error: txResult.rawLog,
        };
      }
    } catch (error) {
      return {
        status: "error",
        message: "Error during blockchain storage",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

function parseIdData(ocrText: string) {
  // Extract common ID fields using regex patterns
  const countryMatch = ocrText.match(/(?:COUNTRY|NATION|NATIONALITY)[:\s]+([A-Za-z\s]+)/i);
  const idNumberMatch = ocrText.match(/(?:ID|IDENTIFICATION|NUMBER)[:\s]+([A-Z0-9-]+)/i);
  const nameMatch = ocrText.match(/(?:NAME|FULL NAME)[:\s]+([A-Za-z\s]+)/i);

  if (!countryMatch || !idNumberMatch || !nameMatch) {
    return {
      isValid: false,
      error: "Missing required ID fields",
    };
  }

  return {
    isValid: true,
    data: {
      country: countryMatch[1].trim(),
      idNumber: idNumberMatch[1].trim(),
      name: nameMatch[1].trim(),
    },
  };
}
