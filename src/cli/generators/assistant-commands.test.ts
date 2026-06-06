import { describe, expect, it } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { generateClaudeCommands } from "./claude";
import { generateCodeFlickerCommands } from "./codeflicker";
import { generateEidolonCommands } from "./eidolon";
import { generateOpenCodeCommands } from "./opencode";

const DEPRECATED_CONFIRM_PROTOCOL = ["yield", "ai-confirm"].join("-");

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function collectFiles(rootDir: string): string[] {
  const results: string[] = [];

  function visit(currentDir: string): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }
      results.push(absolutePath);
    }
  }

  if (fs.existsSync(rootDir)) {
    visit(rootDir);
  }

  return results.sort();
}

describe("assistant command generators", () => {
  it("generate gap-loop commands and remove deprecated confirm references", async () => {
    const tempWorkspace = makeTempDir("codument-generators-");
    const originalCwd = process.cwd();

    try {
      process.chdir(tempWorkspace);
      fs.mkdirSync(path.join(tempWorkspace, ".claude", "skills", "codument-docs-sync-track"), { recursive: true });
      fs.writeFileSync(path.join(tempWorkspace, ".claude", "skills", "codument-docs-sync-track", "SKILL.md"), "OLD\n");
      fs.mkdirSync(path.join(tempWorkspace, ".codeflicker", "skills", "codument-docs-sync-track"), { recursive: true });
      fs.writeFileSync(path.join(tempWorkspace, ".codeflicker", "skills", "codument-docs-sync-track", "SKILL.md"), "OLD\n");
      fs.mkdirSync(path.join(tempWorkspace, ".eidolon", "skills", "codument-docs-sync-track"), { recursive: true });
      fs.writeFileSync(path.join(tempWorkspace, ".eidolon", "skills", "codument-docs-sync-track", "SKILL.md"), "OLD\n");
      fs.mkdirSync(path.join(tempWorkspace, ".opencode", "skills", "codument-docs-sync-track"), { recursive: true });
      fs.writeFileSync(path.join(tempWorkspace, ".opencode", "skills", "codument-docs-sync-track", "SKILL.md"), "OLD\n");

      await generateClaudeCommands();
      await generateCodeFlickerCommands();
      await generateEidolonCommands();
      await generateOpenCodeCommands();

      expect(fs.existsSync(path.join(tempWorkspace, ".claude", "commands", "codument", "gap-loop.md"))).toBe(true);
      expect(fs.existsSync(path.join(tempWorkspace, ".claude", "commands", "codument", "artifact-sync.md"))).toBe(true);
      expect(fs.existsSync(path.join(tempWorkspace, ".claude", "commands", "codument", "docs-sync-track.md"))).toBe(false);
      expect(fs.existsSync(path.join(tempWorkspace, ".claude", "skills", "codument"))).toBe(false);
      expect(fs.existsSync(path.join(tempWorkspace, ".claude", "skills", "codument-workflow"))).toBe(false);
      expect(fs.existsSync(path.join(tempWorkspace, ".claude", "skills", "codument-gap-loop", "SKILL.md"))).toBe(true);
      expect(fs.existsSync(path.join(tempWorkspace, ".claude", "skills", "codument-artifact-sync", "SKILL.md"))).toBe(true);
      expect(fs.existsSync(path.join(tempWorkspace, ".claude", "skills", "codument-docs-sync-track"))).toBe(false);
      expect(fs.existsSync(path.join(tempWorkspace, ".codeflicker", "commands", "codument", "gap-loop.md"))).toBe(true);
      expect(fs.existsSync(path.join(tempWorkspace, ".codeflicker", "commands", "codument", "artifact-sync.md"))).toBe(true);
      expect(fs.existsSync(path.join(tempWorkspace, ".codeflicker", "commands", "codument", "docs-sync-track.md"))).toBe(false);
      expect(fs.existsSync(path.join(tempWorkspace, ".codeflicker", "skills", "codument"))).toBe(false);
      expect(fs.existsSync(path.join(tempWorkspace, ".codeflicker", "skills", "codument-workflow"))).toBe(false);
      expect(fs.existsSync(path.join(tempWorkspace, ".codeflicker", "skills", "codument-gap-loop", "SKILL.md"))).toBe(true);
      expect(fs.existsSync(path.join(tempWorkspace, ".codeflicker", "skills", "codument-artifact-sync", "SKILL.md"))).toBe(true);
      expect(fs.existsSync(path.join(tempWorkspace, ".codeflicker", "skills", "codument-docs-sync-track"))).toBe(false);
      expect(fs.existsSync(path.join(tempWorkspace, ".eidolon", "commands", "codument", "gap-loop.toml"))).toBe(true);
      expect(fs.existsSync(path.join(tempWorkspace, ".eidolon", "commands", "codument", "artifact-sync.toml"))).toBe(true);
      expect(fs.existsSync(path.join(tempWorkspace, ".eidolon", "commands", "codument", "docs-sync-track.toml"))).toBe(false);
      expect(fs.existsSync(path.join(tempWorkspace, ".eidolon", "skills", "codument"))).toBe(false);
      expect(fs.existsSync(path.join(tempWorkspace, ".eidolon", "skills", "codument-workflow"))).toBe(false);
      expect(fs.existsSync(path.join(tempWorkspace, ".eidolon", "skills", "codument-gap-loop", "SKILL.md"))).toBe(true);
      expect(fs.existsSync(path.join(tempWorkspace, ".eidolon", "skills", "codument-artifact-sync", "SKILL.md"))).toBe(true);
      expect(fs.existsSync(path.join(tempWorkspace, ".eidolon", "skills", "codument-docs-sync-track"))).toBe(false);
      expect(fs.existsSync(path.join(tempWorkspace, ".opencode", "command", "codument-gap-loop.md"))).toBe(true);
      expect(fs.existsSync(path.join(tempWorkspace, ".opencode", "command", "codument-artifact-sync.md"))).toBe(true);
      expect(fs.existsSync(path.join(tempWorkspace, ".opencode", "command", "codument-docs-sync-track.md"))).toBe(false);
      expect(fs.existsSync(path.join(tempWorkspace, ".opencode", "skills", "codument"))).toBe(false);
      expect(fs.existsSync(path.join(tempWorkspace, ".opencode", "skills", "codument-workflow"))).toBe(false);
      expect(fs.existsSync(path.join(tempWorkspace, ".opencode", "skills", "codument-gap-loop", "SKILL.md"))).toBe(true);
      expect(fs.existsSync(path.join(tempWorkspace, ".opencode", "skills", "codument-artifact-sync", "SKILL.md"))).toBe(true);
      expect(fs.existsSync(path.join(tempWorkspace, ".opencode", "skills", "codument-docs-sync-track"))).toBe(false);

      const generatedFiles = [
        ...collectFiles(path.join(tempWorkspace, ".claude")),
        ...collectFiles(path.join(tempWorkspace, ".codeflicker")),
        ...collectFiles(path.join(tempWorkspace, ".eidolon")),
        ...collectFiles(path.join(tempWorkspace, ".opencode")),
      ];

      expect(generatedFiles.length).toBeGreaterThan(0);

      for (const filePath of generatedFiles) {
        const content = fs.readFileSync(filePath, "utf-8");
        expect(content.includes(DEPRECATED_CONFIRM_PROTOCOL)).toBe(false);
      }

      const claudeGapLoop = fs.readFileSync(path.join(tempWorkspace, ".claude", "commands", "codument", "gap-loop.md"), "utf-8");
      const claudeArtifactSync = fs.readFileSync(path.join(tempWorkspace, ".claude", "commands", "codument", "artifact-sync.md"), "utf-8");
      const codeFlickerGapLoop = fs.readFileSync(path.join(tempWorkspace, ".codeflicker", "commands", "codument", "gap-loop.md"), "utf-8");
      const codeFlickerArtifactSync = fs.readFileSync(path.join(tempWorkspace, ".codeflicker", "commands", "codument", "artifact-sync.md"), "utf-8");
      const eidolonGapLoop = fs.readFileSync(path.join(tempWorkspace, ".eidolon", "commands", "codument", "gap-loop.toml"), "utf-8");
      const eidolonArtifactSync = fs.readFileSync(path.join(tempWorkspace, ".eidolon", "commands", "codument", "artifact-sync.toml"), "utf-8");
      const openCodeGapLoop = fs.readFileSync(path.join(tempWorkspace, ".opencode", "command", "codument-gap-loop.md"), "utf-8");
      const openCodeArtifactSync = fs.readFileSync(path.join(tempWorkspace, ".opencode", "command", "codument-artifact-sync.md"), "utf-8");

      expect(claudeGapLoop).toContain(".claude/skills/codument-gap-loop/shared/target-capabilities.md");
      expect(claudeArtifactSync).toContain(".claude/skills/codument-artifact-sync/SKILL.md");
      expect(claudeGapLoop).toContain(".claude/skills/codument-gap-loop/SKILL.md");
      expect(claudeGapLoop).toContain("preferred fresh-child mechanism is a newly created child agent");
      expect(claudeGapLoop).not.toContain("you MUST create a newly created child agent before reading code");
      expect(codeFlickerGapLoop).toContain(".codeflicker/skills/codument-gap-loop/shared/target-capabilities.md");
      expect(codeFlickerArtifactSync).toContain(".codeflicker/skills/codument-artifact-sync/SKILL.md");
      expect(codeFlickerGapLoop).toContain(".codeflicker/skills/codument-gap-loop/SKILL.md");
      expect(codeFlickerGapLoop).toContain("preferred fresh-child mechanism is a newly created child agent");
      expect(codeFlickerGapLoop).not.toContain("you MUST create a newly created child agent before reading code");
      expect(eidolonGapLoop).toContain(".eidolon/skills/codument-gap-loop/shared/target-capabilities.md");
      expect(eidolonArtifactSync).toContain(".eidolon/skills/codument-artifact-sync/SKILL.md");
      expect(eidolonGapLoop).toContain(".eidolon/skills/codument-gap-loop/SKILL.md");
      expect(eidolonGapLoop).toContain("preferred fresh-child mechanism is a new agent or fresh session");
      expect(eidolonGapLoop).not.toContain("you MUST start a new agent or fresh session before any substantive review");
      expect(openCodeGapLoop).toContain(".opencode/skills/codument-gap-loop/shared/target-capabilities.md");
      expect(openCodeArtifactSync).toContain(".opencode/skills/codument-artifact-sync/SKILL.md");
      expect(openCodeGapLoop).toContain(".opencode/skills/codument-gap-loop/SKILL.md");
      expect(openCodeGapLoop).toContain("Do not reuse a previous task ID");
      expect(openCodeGapLoop).not.toContain("you MUST start a fresh task or fresh session before any substantive review");
    } finally {
      process.chdir(originalCwd);
    }
  });
});
