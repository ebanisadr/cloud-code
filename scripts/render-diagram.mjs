#!/usr/bin/env node

/**
 * Renders the architecture Mermaid diagram to PNG using @mermaid-js/mermaid-cli.
 *
 * Usage:
 *   node scripts/render-diagram.mjs
 *
 * Requires: @mermaid-js/mermaid-cli (installed globally or via npx)
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const input = resolve(projectRoot, "docs/img/architecture.mmd");
const output = resolve(projectRoot, "docs/img/architecture.png");

if (!existsSync(input)) {
  console.error(`Input file not found: ${input}`);
  process.exit(1);
}

console.log(`Rendering ${input} -> ${output}`);

try {
  execFileSync(
    "npx",
    [
      "--package=@mermaid-js/mermaid-cli",
      "mmdc",
      "-i", input,
      "-o", output,
      "-b", "white",
      "-s", "2",
    ],
    {
      stdio: "inherit",
      cwd: projectRoot,
      timeout: 120_000,
    },
  );

  if (existsSync(output)) {
    console.log(`Done. Image written to ${output}`);
  } else {
    console.error("mmdc exited successfully but the output file was not created.");
    process.exit(1);
  }
} catch (err) {
  console.error("Failed to render diagram:", err.message);
  process.exit(1);
}
