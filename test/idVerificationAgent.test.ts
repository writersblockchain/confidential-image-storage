import axios from "axios";
import * as fs from "fs";
import * as FormData from "form-data";
import { expect } from "chai";
import { describe, it, before, after } from "mocha";

const BASE_URL = "http://localhost:3001";

describe("ID Verification Agent Tests", () => {
  before(async () => {
    // Ensure the server is running before tests
    try {
      await axios.get(BASE_URL);
    } catch (error) {
      console.log("Please ensure the server is running on port 3001 before running tests");
      process.exit(1);
    }
  });

  describe("Chat Endpoint Tests", () => {
    it("should handle chat messages successfully", async () => {
      const response = await axios.post(`${BASE_URL}/api/execute-intent`, {
        message: "I need to verify my ID",
      });

      expect(response.status).to.equal(200);
      expect(response.data).to.have.property("message");
    });

    it("should handle empty messages appropriately", async () => {
      try {
        await axios.post(`${BASE_URL}/api/execute-intent`, {
          message: "",
        });
      } catch (error: any) {
        expect(error.response.status).to.equal(400);
        expect(error.response.data).to.have.property("error");
      }
    });
  });

  describe("ID Registration Endpoint Tests", () => {
    it("should handle ID image upload", async () => {
      // Create a test image file
      const testImagePath = "test-id.jpg";
      fs.writeFileSync(testImagePath, "fake image data");

      const formData = new FormData();
      formData.append("file", fs.createReadStream(testImagePath));

      try {
        const response = await axios.post(`${BASE_URL}/api/register-id`, formData, {
          headers: formData.getHeaders(),
        });

        expect(response.status).to.equal(200);
        expect(response.data).to.have.property("ocrResult");
      } finally {
        // Cleanup test file
        fs.unlinkSync(testImagePath);
      }
    });

    it("should handle missing file upload", async () => {
      const formData = new FormData();
      try {
        await axios.post(`${BASE_URL}/api/register-id`, formData, {
          headers: formData.getHeaders(),
        });
      } catch (error: any) {
        expect(error.response.status).to.equal(400);
        expect(error.response.data.error).to.equal("No file uploaded");
      }
    });
  });
});
