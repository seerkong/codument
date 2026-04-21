import { describe, expect, it } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("generateSparrowCommands", () => {
  it("installs the generated codument workflow skill into the workspace Sparrow skill directory", async () => {
    const repoRoot = path.resolve(__dirname, "../../..");
    const tempWorkspace = makeTempDir("sparrow-workspace-");
    const proc = Bun.spawn(
      [
        "bun",
        "-e",
        `import { setWorkspaceDir } from './src/cli/utils'; import { generateSparrowCommands } from './src/cli/generators/sparrow'; setWorkspaceDir(${JSON.stringify(tempWorkspace)}); await generateSparrowCommands();`,
      ],
      {
        cwd: repoRoot,
        stdout: "pipe",
        stderr: "pipe",
        env: process.env,
      }
    );

    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");

    const skillRoot = path.join(tempWorkspace, ".sparrow", "skill", "codument-workflow");
    expect(fs.existsSync(path.join(skillRoot, "manifest.yml"))).toBe(true);
    expect(fs.existsSync(path.join(skillRoot, "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(skillRoot, "shared", "subagent-model.md"))).toBe(true);
    expect(fs.existsSync(path.join(skillRoot, "shared", "target-capabilities.md"))).toBe(true);
    expect(fs.existsSync(path.join(skillRoot, "subskills", "implement", "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(skillRoot, "subskills", "gap-loop", "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(skillRoot, "agents", "openai.yaml"))).toBe(false);
    expect(fs.readFileSync(path.join(skillRoot, "manifest.yml"), "utf-8")).toContain("\"name\": \"codument-workflow\"");
    expect(fs.readFileSync(path.join(skillRoot, "SKILL.md"), "utf-8")).toContain("## Command Routing Table");
    expect(fs.readFileSync(path.join(skillRoot, "SKILL.md"), "utf-8")).toContain("| `codument:track` | `subskills/track/SKILL.md` |");
    expect(fs.readFileSync(path.join(skillRoot, "SKILL.md"), "utf-8")).toContain("| `codument:verify` | `subskills/verify/SKILL.md` |");
    expect(fs.readFileSync(path.join(skillRoot, "shared", "target-capabilities.md"), "utf-8")).toContain("Sparrow");
    expect(fs.readFileSync(path.join(skillRoot, "shared", "target-capabilities.md"), "utf-8")).toContain("`task`");
    const gapLoopRef = fs.readFileSync(path.join(skillRoot, "subskills", "gap-loop", "SKILL.md"), "utf-8");
    expect(gapLoopRef.startsWith("---\nname: codument-workflow-gap-loop\n")).toBe(true);
    expect(gapLoopRef).toContain("上层封装运行环境优先级");
    expect(gapLoopRef).toContain("gap_loop_round");
    expect(gapLoopRef).toContain("首轮 + 无历史报告 + NO_GAP");
    expect(gapLoopRef).toContain("如果用户显式执行 `codument:gap-loop <track-id>`");
    expect(gapLoopRef).toContain("必须先把 `plan.xml` 补齐并切换到 gap-loop 模式");
    expect(gapLoopRef).toContain("上层封装运行环境**的实现为主");
    expect(fs.readFileSync(path.join(skillRoot, "subskills", "implement", "SKILL.md"), "utf-8")).toContain("gap-loop 子代理或等价的 fresh child context");
  });
});
