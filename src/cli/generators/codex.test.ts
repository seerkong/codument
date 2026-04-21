import { describe, expect, it } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const DEPRECATED_CONFIRM_PROTOCOL = ["yield", "ai-confirm"].join("-");

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("generateCodexCommands", () => {
  it("installs the generated codument workflow skill into the Codex skill directory", async () => {
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

    const skillRoot = path.join(tempHome, ".codex", "skills", "codument-workflow");
    expect(fs.existsSync(path.join(skillRoot, "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(skillRoot, "agents", "openai.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(skillRoot, "shared", "subagent-model.md"))).toBe(true);
    expect(fs.existsSync(path.join(skillRoot, "shared", "target-capabilities.md"))).toBe(true);
    expect(fs.existsSync(path.join(skillRoot, "shared", "workflow-routing.md"))).toBe(true);
    expect(fs.existsSync(path.join(skillRoot, "subskills", "implement", "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(skillRoot, "subskills", "gap-loop", "SKILL.md"))).toBe(true);
    expect(fs.readFileSync(path.join(skillRoot, "SKILL.md"), "utf-8")).toContain("Codument Workflow");
    expect(fs.readFileSync(path.join(skillRoot, "SKILL.md"), "utf-8")).toContain("subskills/gap-loop/SKILL.md");
    expect(fs.readFileSync(path.join(skillRoot, "SKILL.md"), "utf-8")).toContain("## Command Routing Table");
    expect(fs.readFileSync(path.join(skillRoot, "SKILL.md"), "utf-8")).toContain("| `codument:init` | `subskills/init/SKILL.md` |");
    expect(fs.readFileSync(path.join(skillRoot, "SKILL.md"), "utf-8")).toContain("| `codument:gap-loop` | `subskills/gap-loop/SKILL.md` |");
    const gapLoopRef = fs.readFileSync(path.join(skillRoot, "subskills", "gap-loop", "SKILL.md"), "utf-8");
    expect(gapLoopRef.startsWith("---\nname: codument-workflow-gap-loop\n")).toBe(true);
    expect(gapLoopRef).toContain("prefer model `gpt-5.4` with `high` reasoning");
    expect(gapLoopRef).toContain("yield-gap-loop");
    expect(gapLoopRef).toContain("## 0.0 总纲");
    expect(gapLoopRef).toContain("上层封装运行环境优先级");
    expect(gapLoopRef).toContain("父层编排代理章节");
    expect(gapLoopRef).toContain("Fresh 子代理章节");
    expect(gapLoopRef).toContain("gap_loop_round");
    expect(gapLoopRef).toContain("首轮 + 无历史报告 + NO_GAP");
    expect(gapLoopRef).toContain("如果用户显式执行 `codument:gap-loop <track-id>`");
    expect(gapLoopRef).toContain("必须先把 `plan.xml` 补齐并切换到 gap-loop 模式");
    expect(fs.readFileSync(path.join(skillRoot, "shared", "target-capabilities.md"), "utf-8")).toContain("spawn_agent");
    expect(fs.readFileSync(path.join(skillRoot, "shared", "target-capabilities.md"), "utf-8")).toContain("gpt-5.4");
    expect(fs.readFileSync(path.join(skillRoot, "subskills", "implement", "SKILL.md"), "utf-8")).not.toContain(DEPRECATED_CONFIRM_PROTOCOL);
  });
});
