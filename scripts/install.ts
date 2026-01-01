#!/usr/bin/env bun
/**
 * Cross-platform install script for codument
 * Supports: Windows (PowerShell/MinGW), Linux, macOS
 */

import { existsSync, mkdirSync, copyFileSync, symlinkSync, unlinkSync, statSync } from "fs";
import { join, resolve } from "path";
import { homedir, platform } from "os";

const isWindows = platform() === "win32";
const projectRoot = resolve(import.meta.dir, "..");
const exeName = isWindows ? "codument.exe" : "codument";
const sourcePath = join(projectRoot, "dist", exeName);

// Determine target bin directory
function getTargetBinDir(): string {
  // Check for custom install path via environment variable
  if (process.env.CODUMENT_BIN_DIR) {
    return process.env.CODUMENT_BIN_DIR;
  }

  // Default paths
  if (isWindows) {
    // Windows: ~/.local/bin (works for both PowerShell and MinGW)
    return join(homedir(), ".local", "bin");
  } else {
    // Linux/macOS: ~/.local/bin (user-level, no sudo needed)
    return join(homedir(), ".local", "bin");
  }
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
}

function isSymlink(path: string): boolean {
  try {
    const stats = statSync(path, { throwIfNoEntry: false });
    return stats?.isSymbolicLink() ?? false;
  } catch {
    return false;
  }
}

function install(): void {
  // Verify source exists
  if (!existsSync(sourcePath)) {
    console.error(`Error: Source file not found: ${sourcePath}`);
    console.error("Please run 'bun run build' first.");
    process.exit(1);
  }

  const targetDir = getTargetBinDir();
  const targetPath = join(targetDir, exeName);

  console.log(`Installing codument...`);
  console.log(`  Source: ${sourcePath}`);
  console.log(`  Target: ${targetPath}`);

  // Ensure target directory exists
  ensureDir(targetDir);

  // Remove existing file/symlink if present
  if (existsSync(targetPath)) {
    unlinkSync(targetPath);
    console.log(`  Removed existing: ${targetPath}`);
  }

  if (isWindows) {
    // Windows: Copy the file (symlinks require admin or developer mode)
    copyFileSync(sourcePath, targetPath);
    console.log(`  Copied successfully.`);
  } else {
    // Linux/macOS: Create symlink
    try {
      symlinkSync(sourcePath, targetPath);
      console.log(`  Symlink created successfully.`);
    } catch (err: any) {
      if (err.code === "EPERM") {
        // Fallback to copy if symlink fails
        console.log(`  Symlink failed, copying instead...`);
        copyFileSync(sourcePath, targetPath);
        console.log(`  Copied successfully.`);
      } else {
        throw err;
      }
    }
  }

  // Check if target directory is in PATH
  const pathEnv = process.env.PATH || "";
  const pathDirs = pathEnv.split(isWindows ? ";" : ":");
  const isInPath = pathDirs.some((dir) => {
    try {
      return resolve(dir) === resolve(targetDir);
    } catch {
      return false;
    }
  });

  console.log();
  if (isInPath) {
    console.log(`Done! You can now run 'codument' from anywhere.`);
  } else {
    console.log(`Done! Add this directory to your PATH to use 'codument' globally:`);
    console.log();
    if (isWindows) {
      console.log(`  PowerShell (current session):`);
      console.log(`    $env:PATH += ";${targetDir}"`);
      console.log();
      console.log(`  PowerShell (permanent, user-level):`);
      console.log(`    [Environment]::SetEnvironmentVariable("PATH", $env:PATH + ";${targetDir}", "User")`);
      console.log();
      console.log(`  MinGW/Git Bash (~/.bashrc or ~/.bash_profile):`);
      console.log(`    export PATH="$PATH:${targetDir.replace(/\\/g, "/")}"`);
    } else {
      console.log(`  Add to ~/.bashrc or ~/.zshrc:`);
      console.log(`    export PATH="$PATH:${targetDir}"`);
    }
  }
}

// Run
install();
