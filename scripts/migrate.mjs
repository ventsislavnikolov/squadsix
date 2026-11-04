// Applies a SQL file to DATABASE_URL, one statement at a time (Neon's HTTP driver runs
// single statements). Statements are split on ";" at the end of a line.
//   DATABASE_URL=… node scripts/migrate.mjs db/002_signups.sql
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const [, , file] = process.argv;
if (!(file && process.env.DATABASE_URL)) {
  console.error("usage: DATABASE_URL=… node scripts/migrate.mjs <file.sql>");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);
const statements = readFileSync(file, "utf8")
  .split(/;\s*$/mu)
  .map((s) => s.replace(/^\s*--.*$/gmu, "").trim())
  .filter(Boolean);

for (const statement of statements) {
  // biome-ignore lint/performance/noAwaitInLoops: a migration runs its statements in order, each after the last.
  await sql.query(statement);
  console.log("ok:", statement.split("\n")[0].slice(0, 80));
}
