import { describe, expect, it } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("generateSparrowCommands", () => {
  it("installs generated codument skills into the workspace Sparrow skill directory", async () => {
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

    const workflowSkillRoot = path.join(tempWorkspace, ".sparrow", "skills", "codument-workflow");
    const legacySkillRoot = path.join(tempWorkspace, ".sparrow", "skills", "codument");
    const oldSkillRoot = path.join(tempWorkspace, ".sparrow", "skill");
    const gapLoopSkillRoot = path.join(tempWorkspace, ".sparrow", "skills", "codument-gap-loop");
    expect(fs.existsSync(legacySkillRoot)).toBe(false);
    expect(fs.existsSync(workflowSkillRoot)).toBe(false);
    expect(fs.existsSync(path.join(oldSkillRoot, "codument-workflow"))).toBe(false);
    expect(fs.existsSync(path.join(oldSkillRoot, "codument-gap-loop"))).toBe(false);
    expect(fs.existsSync(path.join(gapLoopSkillRoot, "manifest.yml"))).toBe(true);
    expect(fs.readFileSync(path.join(gapLoopSkillRoot, "manifest.yml"), "utf-8")).toContain("\"name\": \"codument-gap-loop\"");
    const gapLoopRef = fs.readFileSync(path.join(gapLoopSkillRoot, "SKILL.md"), "utf-8");
    expect(gapLoopRef.startsWith("---\nname: codument-gap-loop\n")).toBe(true);
    expect(gapLoopRef).toContain("Trigger aliases: `codument:gap-loop`, `codument-gap-loop`.");
    expect(fs.readFileSync(path.join(gapLoopSkillRoot, "shared", "target-capabilities.md"), "utf-8")).toContain("Sparrow");
    expect(fs.readFileSync(path.join(gapLoopSkillRoot, "shared", "target-capabilities.md"), "utf-8")).toContain("`task`");
    expect(gapLoopRef).toContain("上层封装运行环境优先级");
    expect(gapLoopRef).toContain("gap_loop_round");
    expect(gapLoopRef).toContain("首轮 + 无历史报告 + NO_GAP");
    expect(gapLoopRef).toContain("如果用户显式执行 `codument:gap-loop <track-id>`");
    expect(gapLoopRef).toContain("必须先把 `plan.xml` 补齐并切换到 gap-loop 模式");
    expect(gapLoopRef).toContain("上层封装运行环境**的实现为主");
    expect(fs.readFileSync(path.join(tempWorkspace, ".sparrow", "skills", "codument-implement", "SKILL.md"), "utf-8")).toContain("gap-loop 子代理或等价的 fresh child context");
  });
});
