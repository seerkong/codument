import { describe, expect, it } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const DEPRECATED_CONFIRM_PROTOCOL = ["yield", "ai-confirm"].join("-");

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("generateCodexCommands", () => {
  it("installs generated codument skills into the Codex skill directory", async () => {
    const repoRoot = path.resolve(__dirname, "../../..");
    const tempHome = makeTempDir("codex-home-");
    const proc = Bun.spawn(
      [
        "bun",
        "-e",
        "import { generateCodexCommands } from './src/cli/generators/codex'; await generateCodexCommands();",
      ],
      {
        cwd: repoRoot,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          HOME: tempHome,
        },
      }
    );

    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");

    const workflowSkillRoot = path.join(tempHome, ".codex", "skills", "codument-workflow");
    const legacySkillRoot = path.join(tempHome, ".codex", "skills", "codument");
    const gapLoopSkillRoot = path.join(tempHome, ".codex", "skills", "codument-gap-loop");
    expect(fs.existsSync(legacySkillRoot)).toBe(false);
    expect(fs.existsSync(workflowSkillRoot)).toBe(false);
    expect(fs.existsSync(path.join(gapLoopSkillRoot, "SKILL.md"))).toBe(true);
    const standaloneGapLoopRef = fs.readFileSync(path.join(gapLoopSkillRoot, "SKILL.md"), "utf-8");
    expect(standaloneGapLoopRef.startsWith("---\nname: codument-gap-loop\n")).toBe(true);
    expect(standaloneGapLoopRef).toContain("Trigger aliases: `codument:gap-loop`, `codument-gap-loop`.");
    expect(standaloneGapLoopRef).toContain("prefer model `gpt-5.5` or higher with `high` reasoning");
    expect(standaloneGapLoopRef).toContain("yield-gap-loop");
    expect(standaloneGapLoopRef).toContain("## 0.0 总纲");
    expect(standaloneGapLoopRef).toContain("上层封装运行环境优先级");
    expect(standaloneGapLoopRef).toContain("父层编排代理章节");
    expect(standaloneGapLoopRef).toContain("Fresh 子代理章节");
    expect(standaloneGapLoopRef).toContain("gap_loop_round");
    expect(standaloneGapLoopRef).toContain("首轮 + 无历史报告 + NO_GAP");
    expect(standaloneGapLoopRef).toContain("如果用户显式执行 `codument:gap-loop <track-id>`");
    expect(standaloneGapLoopRef).toContain("必须先把 `plan.xml` 补齐并切换到 gap-loop 模式");
    expect(fs.readFileSync(path.join(gapLoopSkillRoot, "shared", "target-capabilities.md"), "utf-8")).toContain("spawn_agent");
    expect(fs.readFileSync(path.join(gapLoopSkillRoot, "shared", "target-capabilities.md"), "utf-8")).toContain("gpt-5.5");
    const implementRef = fs.readFileSync(path.join(tempHome, ".codex", "skills", "codument-implement", "SKILL.md"), "utf-8");
    expect(implementRef).not.toContain(DEPRECATED_CONFIRM_PROTOCOL);
  });
});
