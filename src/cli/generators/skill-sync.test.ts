import { describe, expect, it } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { syncGeneratedSkillDirectories } from "./skill-sync";

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("syncGeneratedSkillDirectories", () => {
  it("removes legacy codument skill directories without deleting same-name files", () => {
    const skillsRoot = makeTempDir("codument-skill-sync-");
    const legacyDir = path.join(skillsRoot, "codument");
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, "SKILL.md"), "legacy\n", "utf-8");

    syncGeneratedSkillDirectories(
      skillsRoot,
      {
        "codument-workflow": { "SKILL.md": "workflow\n" },
        "codument-gap-loop": { "SKILL.md": "gap loop\n" },
      },
      ["codument"]
    );

    expect(fs.existsSync(legacyDir)).toBe(false);
    expect(fs.readFileSync(path.join(skillsRoot, "codument-workflow", "SKILL.md"), "utf-8")).toBe("workflow\n");
    expect(fs.readFileSync(path.join(skillsRoot, "codument-gap-loop", "SKILL.md"), "utf-8")).toBe("gap loop\n");

    fs.writeFileSync(path.join(skillsRoot, "codument"), "user file\n", "utf-8");

    syncGeneratedSkillDirectories(
      skillsRoot,
      {
        "codument-workflow": { "SKILL.md": "updated workflow\n" },
        "codument-verify": { "SKILL.md": "verify\n" },
      },
      ["codument"]
    );

    expect(fs.readFileSync(path.join(skillsRoot, "codument"), "utf-8")).toBe("user file\n");
    expect(fs.readFileSync(path.join(skillsRoot, "codument-workflow", "SKILL.md"), "utf-8")).toBe("updated workflow\n");
    expect(fs.readFileSync(path.join(skillsRoot, "codument-verify", "SKILL.md"), "utf-8")).toBe("verify\n");
  });
});
