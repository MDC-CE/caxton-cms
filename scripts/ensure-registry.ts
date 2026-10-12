#!/usr/bin/env tsx
/**
 * Ensure shared/schema can import site registry Zod exports.
 * Check first; on failure, hash-diff pull content from GitHub and re-check
 * in a fresh process (ESM failed modules stay cached in-process).
 *
 * Usage: npm run ensure:registry
 */

import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { config as loadDotenv } from "dotenv";

loadDotenv({ quiet: true });

process.env.LOG_LEVEL = "silent";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function runScript(
  scriptName: string,
  args: string[] = [],
): Promise<number> {
  return new Promise((resolve, reject) => {
    // Windows npm shims are *.cmd; spawn without shell cannot exec the extensionless bin.
    const tsxBin = path.join(
      root,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "tsx.cmd" : "tsx",
    );
    const child = spawn(
      tsxBin,
      [path.join(root, "scripts", scriptName), ...args],
      {
        cwd: root,
        stdio: "inherit",
        env: process.env,
        shell: process.platform === "win32",
      },
    );
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function main(): Promise<void> {
  console.log("Checking shared/schema ↔ site registry exports...\n");

  let code = await runScript("check-registry.ts");
  if (code === 0) {
    process.exit(0);
  }

  console.log("\nRegistry check failed — attempting content pull to sync site_*/...\n");

  const { requireSiteConfigs } = await import("../server/site-config");
  const { isGitHubConfigured } = await import("../server/github");
  const sites = requireSiteConfigs();
  const anyConfigured = sites.some(
    (s) => s.githubRepoUrl && isGitHubConfigured(s.githubRepoUrl),
  );

  if (!anyConfigured) {
    console.error(
      "Cannot auto-pull: no site has GITHUB_TOKEN + github_repo_url configured.\n" +
        "Set GITHUB_TOKEN in .env and github_repo_url in sites.yml, then run:\n" +
        "  npm run content:pull\n" +
        "  npm run check:registry\n",
    );
    process.exit(1);
  }

  const pullCode = await runScript("content-pull.ts", ["--required"]);
  if (pullCode !== 0) {
    console.error("\nContent pull failed — cannot ensure registry exports.\n");
    process.exit(pullCode);
  }

  console.log("\nRe-checking shared/schema after content pull...\n");
  code = await runScript("check-registry.ts");
  if (code === 0) {
    console.log("\n✓ Registry synced after content pull");
    process.exit(0);
  }

  console.error(
    "\nStill failing after content pull.\n" +
      "Remote content may also lack the export — land the schema in the content repo first,\n" +
      "or remove the premature re-export from shared/schema.ts.\n",
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
