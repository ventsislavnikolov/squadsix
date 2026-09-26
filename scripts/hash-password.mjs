// Prints an ADMIN_PASSWORD_HASH for the given password.
//   node scripts/hash-password.mjs 'the password'
import { randomBytes, scryptSync } from "node:crypto";

const password = process.argv[2];
if (!password) {
  console.error("usage: node scripts/hash-password.mjs '<password>'");
  process.exit(1);
}
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 32);
console.log(`scrypt:${salt.toString("hex")}:${hash.toString("hex")}`);
