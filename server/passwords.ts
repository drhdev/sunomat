import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(scryptCallback);
const dummyPassword = `${randomBytes(16).toString("hex")}:${"00".repeat(64)}`;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(
  password: string,
  encoded?: string,
): Promise<boolean> {
  // Missing/malformed credentials still perform the same password derivation.
  const valid =
    typeof encoded === "string" && /^[a-f0-9]{32}:[a-f0-9]{128}$/.test(encoded);
  const [salt, stored] = (valid ? encoded : dummyPassword).split(":");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return timingSafeEqual(key, Buffer.from(stored, "hex")) && valid;
}
