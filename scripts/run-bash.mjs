#!/usr/bin/env node

/**
 * Cross-platform bash invoker.
 *
 * Finds bash via:
 *   1. `where bash` (PATH) - handles .cmd wrappers (Cygwin)
 *   2. Common Git-for-Windows locations
 *   3. Common Cygwin locations
 *
 * Usage:
 *   node scripts/run-bash.mjs <script.sh> [args...]
 *   node scripts/run-bash.mjs -c "<command>"
 */

import { execFileSync, execSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

function findBash() {
  // 1. Try `where bash` (works if bash is in PATH)
  try {
    const out = spawnSync(process.platform === "win32" ? "where" : "which", ["bash"], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    if (out.status === 0) {
      const lines = out.stdout.trim().split(/\r?\n/);
      for (const line of lines) {
        const p = line.trim();
        if (!p) {
          continue;
        }
        // Prefer .exe over .cmd wrappers
        if (p.toLowerCase().endsWith(".cmd")) {
          continue;
        }
        if (existsSync(p)) {
          return { path: p, isCmd: false };
        }
      }
      // If no .exe found, try .cmd wrappers (Cygwin) - need cmd.exe /c
      for (const line of lines) {
        const p = line.trim();
        if (!p) {
          continue;
        }
        if (p.toLowerCase().endsWith(".cmd") && existsSync(p)) {
          return { path: p, isCmd: true };
        }
      }
    }
  } catch {
    // ignore
  }

  // 2. Common Git-for-Windows locations
  const programFiles = process.env["ProgramFiles"] || "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const localAppData = process.env["LOCALAPPDATA"] || "";

  const gitCandidates = [
    join(programFiles, "Git", "bin", "bash.exe"),
    join(programFilesX86, "Git", "bin", "bash.exe"),
    join(localAppData, "Programs", "Git", "bin", "bash.exe"),
    join(
      process.env["USERPROFILE"] || "",
      "AppData",
      "Local",
      "Programs",
      "Git",
      "bin",
      "bash.exe",
    ),
  ];

  for (const candidate of gitCandidates) {
    if (candidate && existsSync(candidate)) {
      return { path: candidate, isCmd: false };
    }
  }

  // 3. Common Cygwin locations
  const cygwinCandidates = ["C:\\cygwin64\\bin\\bash.exe", "C:\\cygwin\\bin\\bash.exe"];

  for (const candidate of cygwinCandidates) {
    if (existsSync(candidate)) {
      return { path: candidate, isCmd: false };
    }
  }

  return null;
}

function runBash(bashInfo, scriptArgs) {
  try {
    if (bashInfo.isCmd) {
      // .cmd wrapper (Cygwin) - need to invoke via cmd.exe
      const quoted = scriptArgs.map((a) => `"${a}"`).join(" ");
      execSync(`cmd.exe /c "${bashInfo.path}" ${quoted}`, { stdio: "inherit" });
    } else {
      execFileSync(bashInfo.path, scriptArgs, { stdio: "inherit" });
    }
  } catch {
    process.exit(1);
  }
}

const scriptArgs = process.argv.slice(2);
if (scriptArgs.length === 0) {
  console.error("Usage: node scripts/run-bash.mjs <script.sh> [args...]");
  console.error('       node scripts/run-bash.mjs -c "<command>"');
  process.exit(1);
}

// On non-Windows, just invoke bash directly
if (process.platform !== "win32") {
  runBash({ path: "bash", isCmd: false }, scriptArgs);
} else {
  // Windows: find bash first
  const bashInfo = findBash();
  if (!bashInfo) {
    console.error("Error: bash not found. Please install Git for Windows or Cygwin.");
    console.error("Git: https://git-scm.com/download/win");
    console.error("Cygwin: https://www.cygwin.com/install.html");
    process.exit(1);
  }

  runBash(bashInfo, scriptArgs);
}
