import { createHash } from "crypto";

export function hashData({ data }: { data: any }): Buffer {
  // Convert data to a consistent string format
  const dataString = JSON.stringify(data);

  // Create a SHA-256 hash
  const hash = createHash("sha256");
  hash.update(dataString);

  return hash.digest();
}
