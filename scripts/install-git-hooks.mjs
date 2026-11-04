#!/usr/bin/env node
// `prepare` hook: install the lefthook Git hooks after `pnpm install`. Builds
// without Git metadata (Vercel, EAS, a tarball) or on CI skip it instead of
// failing.
//
// Clones made before the move still carry husky's `core.hooksPath`
// (`.husky/_`), which lefthook refuses by default. In the main checkout the
// stale path is reset; in a linked worktree the shared config is left alone
// (another checkout may still be on husky) and the hooks go into the
// worktree's own, self-ignored `.husky/_`.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const HUSKY_HOOKS_PATH = ".husky/_";

const skip = (reason) => {
  process.stdout.write(`Skipping Git hooks: ${reason}.\n`);
  process.exit(0);
};

if (process.env.CI) {
  skip("running on CI");
}
const git = (...args) =>
  spawnSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
const gitDir = git("rev-parse", "--path-format=absolute", "--git-dir");
if (gitDir.error || gitDir.status !== 0) {
  skip("Git metadata is unavailable");
}

const [command, ...install] = ["pnpm", "exec", "lefthook", "install"];
const hooksPath = git("config", "--local", "core.hooksPath").stdout.trim();
if (hooksPath === HUSKY_HOOKS_PATH) {
  const commonDir = git(
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir"
  ).stdout.trim();
  if (gitDir.stdout.trim() === commonDir) {
    install.push("--reset-hooks-path");
  } else {
    fs.mkdirSync(HUSKY_HOOKS_PATH, { recursive: true });
    fs.writeFileSync(path.join(HUSKY_HOOKS_PATH, ".gitignore"), "*\n");
    install.push("--force");
  }
}
const lefthook = spawnSync(command, install, { stdio: "inherit" });
process.exit(lefthook.status ?? 1);
