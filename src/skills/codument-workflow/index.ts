import * as path from "path";
import {
  archivePrompt,
  discussPrompt,
  executeWavePrompt,
  gapLoopPrompt,
  implementPrompt,
  initPrompt,
  planWavePrompt,
  statusPrompt,
  trackPrompt,
  validatePrompt,
  verifyPrompt,
} from "../../prompts";

export const CODUMENT_WORKFLOW_SKILL_NAME = "codument-workflow";

export type WorkflowTarget = "claude" | "codeflicker" | "codex" | "eidolon" | "opencode" | "sparrow";

export interface WorkflowTargetProfile {
  id: WorkflowTarget;
  displayName: string;
  skillDisplayPath: string;
  commandDisplayPath?: string;
  preferredFreshChildTerms: string[];
  gapLoopRoundPreference?: string;
  wrapperNote?: string;
}

const SKILL_ENTRY_FILES = {
  root: "SKILL.md",
  sharedSubagentModel: path.join("shared", "subagent-model.md"),
  sharedTargetCapabilities: path.join("shared", "target-capabilities.md"),
  sharedWorkflowRouting: path.join("shared", "workflow-routing.md"),
} as const;

const SUBSKILL_SOURCES = [
  { name: "archive", prompt: archivePrompt, description: "Archive a completed track and merge spec deltas." },
  { name: "discuss", prompt: discussPrompt, description: "Discuss a phase and persist implementation decisions into context.md." },
  { name: "execute-wave", prompt: executeWavePrompt, description: "Execute tasks by wave DAG scheduling." },
  { name: "gap-loop", prompt: gapLoopPrompt, description: "Run a fresh gap analysis and repair loop for a track or phase." },
  { name: "implement", prompt: implementPrompt, description: "Implement a track sequentially from plan.xml." },
  { name: "init", prompt: initPrompt, description: "Initialize or resume Codument project setup." },
  { name: "plan-wave", prompt: planWavePrompt, description: "Convert a phase into wave DAG execution groups." },
  { name: "status", prompt: statusPrompt, description: "Show project status and summarize tracks or tasks." },
  { name: "track", prompt: trackPrompt, description: "Create a new track, proposal, spec, or plan." },
  { name: "validate", prompt: validatePrompt, description: "Validate track or spec structure and strict-mode checks." },
  { name: "verify", prompt: verifyPrompt, description: "Verify implemented work with issues-first reporting." },
] as const;

export const CLAUDE_WORKFLOW_SKILL_DISPLAY_PATH = `.claude/skills/${CODUMENT_WORKFLOW_SKILL_NAME}/`;
export const CLAUDE_WORKFLOW_COMMAND_DISPLAY_PATH = ".claude/commands/codument/";
export const CODEFLICKER_WORKFLOW_SKILL_DISPLAY_PATH = `.codeflicker/skills/${CODUMENT_WORKFLOW_SKILL_NAME}/`;
export const CODEFLICKER_WORKFLOW_COMMAND_DISPLAY_PATH = ".codeflicker/commands/codument/";
export const CODEX_WORKFLOW_SKILL_DISPLAY_PATH = `~/.codex/skills/${CODUMENT_WORKFLOW_SKILL_NAME}/`;
export const EIDOLON_WORKFLOW_SKILL_DISPLAY_PATH = `.eidolon/skills/${CODUMENT_WORKFLOW_SKILL_NAME}/`;
export const EIDOLON_WORKFLOW_COMMAND_DISPLAY_PATH = ".eidolon/commands/codument/";
export const OPENCODE_WORKFLOW_SKILL_DISPLAY_PATH = `.opencode/skills/${CODUMENT_WORKFLOW_SKILL_NAME}/`;
export const OPENCODE_WORKFLOW_COMMAND_DISPLAY_PATH = ".opencode/command/";
export const SPARROW_WORKFLOW_SKILL_DISPLAY_PATH = `.sparrow/skill/${CODUMENT_WORKFLOW_SKILL_NAME}/`;

const WORKFLOW_TARGET_PROFILES: Record<WorkflowTarget, WorkflowTargetProfile> = {
  claude: {
    id: "claude",
    displayName: "Claude Code",
    skillDisplayPath: CLAUDE_WORKFLOW_SKILL_DISPLAY_PATH,
    commandDisplayPath: CLAUDE_WORKFLOW_COMMAND_DISPLAY_PATH,
    preferredFreshChildTerms: [
      "a newly created child agent",
      "a brand-new child agent for each review round",
    ],
    wrapperNote: "This target also keeps slash-command wrappers for compatibility.",
  },
  codeflicker: {
    id: "codeflicker",
    displayName: "CodeFlicker",
    skillDisplayPath: CODEFLICKER_WORKFLOW_SKILL_DISPLAY_PATH,
    commandDisplayPath: CODEFLICKER_WORKFLOW_COMMAND_DISPLAY_PATH,
    preferredFreshChildTerms: [
      "a newly created child agent",
      "a brand-new child agent for each review round",
    ],
    wrapperNote: "This target also keeps slash-command wrappers for compatibility.",
  },
  codex: {
    id: "codex",
    displayName: "OpenAI Codex CLI",
    skillDisplayPath: CODEX_WORKFLOW_SKILL_DISPLAY_PATH,
    preferredFreshChildTerms: [
      "`spawn_agent`",
      "a fresh delegated subagent thread",
    ],
    gapLoopRoundPreference:
      "When you spawn a fresh gap-loop child and the environment lets you choose model and reasoning explicitly, prefer model `gpt-5.4` with `high` reasoning.",
  },
  eidolon: {
    id: "eidolon",
    displayName: "Eidolon",
    skillDisplayPath: EIDOLON_WORKFLOW_SKILL_DISPLAY_PATH,
    commandDisplayPath: EIDOLON_WORKFLOW_COMMAND_DISPLAY_PATH,
    preferredFreshChildTerms: [
      "a new agent",
      "a fresh session",
    ],
    wrapperNote: "This target also keeps TOML command wrappers for compatibility.",
  },
  opencode: {
    id: "opencode",
    displayName: "OpenCode",
    skillDisplayPath: OPENCODE_WORKFLOW_SKILL_DISPLAY_PATH,
    commandDisplayPath: OPENCODE_WORKFLOW_COMMAND_DISPLAY_PATH,
    preferredFreshChildTerms: [
      "a fresh task",
      "a fresh session",
    ],
    wrapperNote: "This target also keeps markdown command wrappers for compatibility.",
  },
  sparrow: {
    id: "sparrow",
    displayName: "Sparrow",
    skillDisplayPath: SPARROW_WORKFLOW_SKILL_DISPLAY_PATH,
    preferredFreshChildTerms: [
      "`task`",
      "a brand-new subagent task for each round",
    ],
  },
};

function injectSkillPrelude(content: string, lines: string[]): string {
  if (lines.length === 0) {
    return content;
  }

  const prelude = `${lines.map((line) => `> ${line}`).join("\n")}\n\n`;
  const frontmatterMatch = content.match(/^---\n[\s\S]*?\n---\n?/);
  if (!frontmatterMatch) {
    return `${prelude}${content}`;
  }

  const frontmatter = frontmatterMatch[0];
  const body = content.slice(frontmatter.length);
  return `${frontmatter}\n${prelude}${body}`;
}

function buildSubskillSkill(
  subskill: (typeof SUBSKILL_SOURCES)[number],
  preludeLines: string[]
): string {
  const prelude = preludeLines.map((line) => `> ${line}`).join("\n");
  return `---
name: codument-workflow-${subskill.name}
description: ${subskill.description}
---

${prelude}

${subskill.prompt}
`;
}

function buildSparrowManifest(): string {
  return `${JSON.stringify(
    {
      name: CODUMENT_WORKFLOW_SKILL_NAME,
      description: "Codument lifecycle and track workflows for Sparrow local skill loading.",
      entry_file: "SKILL.md",
      briefInfo: {
        name: CODUMENT_WORKFLOW_SKILL_NAME,
        description: "Codument lifecycle and track workflows",
        entry_file: "SKILL.md",
      },
    },
    null,
    2
  )}\n`;
}

function buildRootSkillTemplate(): string {
  return `---
name: codument-workflow
description: Use when the user wants to initialize, operate, validate, inspect, discuss, plan, execute, verify, or archive a Codument-based project workflow. Trigger for requests involving \`codument/\` directories, tracks, \`tracks.md\`, \`plan.xml\`, \`spec.md\`, wave execution, track creation, Codument status, or migrating an existing repo onto the Codument methodology.
---

# Codument Workflow

## Overview

This skill consolidates the old \`codument:*\` lifecycle entrypoints into one workflow skill. Use it whenever the user's request maps to a Codument lifecycle action.

Keep the active instruction set small. First determine the user's intent, then load only the matching sub-skill from \`subskills/\`.

Before loading a sub-skill, also check:

- \`shared/workflow-routing.md\` for the generated routing map
- \`shared/target-capabilities.md\` for target-specific loading and fresh-child guidance
- \`shared/subagent-model.md\` for the common fresh-child capability model

## Intent Router

Choose the narrowest matching workflow:

- Project bootstrap or resume Codument setup: read \`subskills/init/SKILL.md\`
- Create a new track, proposal, spec, or plan: read \`subskills/track/SKILL.md\`
- Show project progress or summarize tracks/tasks: read \`subskills/status/SKILL.md\`
- Validate Codument track/spec structure or strict mode output: read \`subskills/validate/SKILL.md\`
- Implement a track sequentially from \`plan.xml\`: read \`subskills/implement/SKILL.md\`
- Discuss a phase and persist implementation decisions into \`context.md\`: read \`subskills/discuss/SKILL.md\`
- Convert a phase into wave DAG execution groups: read \`subskills/plan-wave/SKILL.md\`
- Orchestrate wave execution across phases/tasks: read \`subskills/execute-wave/SKILL.md\`
- Independently verify completed work with issues-first reporting: read \`subskills/verify/SKILL.md\`
- Run a fresh gap analysis and repair loop for a track or phase: read \`subskills/gap-loop/SKILL.md\`
- Archive a completed track and merge spec deltas: read \`subskills/archive/SKILL.md\`

If a request spans multiple lifecycle steps, load only the current step first. Pull adjacent sub-skills only when the current step explicitly depends on them.

## Command Routing Table

If the user explicitly invokes a \`codument:*\` command, route directly to the matching sub-skill below instead of staying at the root skill layer.

${buildCommandRoutingTable()}

## Working Rules

- Treat the selected sub-skill as the authoritative procedure for that Codument action.
- Preserve Codument's explicit stop conditions. If required files are missing or the workflow says to stop, do not improvise hidden recovery logic.
- Prefer direct file inspection over assumptions. Read the actual \`codument/\` files before proposing next steps.
- Use the environment's structured question tools when the selected sub-skill requires user choice or confirmation.
- Keep outputs aligned with the original workflow's intent. Do not silently collapse interactive checkpoints that were designed to capture requirements or approval.
- When implementing or verifying, keep the user's repo changes intact and operate only on the target track or files the workflow requires.

## Common Paths

- Project root: \`codument/\`
- Track registry: \`codument/tracks.md\`
- Track folder: \`codument/tracks/<track_id>/\`
- Shared workflow standards: \`codument/std/\`
- Project-specific workflow config: \`codument/workflows/workflow.md\`

## Output Expectations

- For status/validation/verification, prefer concise structured results over narration.
- For verification, keep an issues-first order.
- For workflow steps that create or update files, explain what changed and what state transition happened.
- When a workflow references commands like \`codument:init\`, interpret that as "load the matching \`codument-workflow\` sub-skill or wrapper entrypoint for this target".
`;
}

function buildOpenAiAgentConfig(): string {
  return `interface:
  display_name: "Codument Workflow"
  short_description: "Codument lifecycle and track workflows"
  default_prompt: "Use $codument-workflow to run the right Codument lifecycle step for this project."
`;
}

function buildSharedSubagentModel(): string {
  return `# Fresh Child Capability Model

Gap-loop and similar review loops rely on one invariant:

- Each round must run in a fresh child context.

The exact API differs by target, but the semantics do not. The following are equivalent when they create a brand-new child context for the current round:

- \`spawn_agent\`
- \`task\` / fresh task
- delegate worker / child worker
- fresh session / fresh thread
- any other explicit child-agent creation mechanism

## Required Behavior

- If the environment exposes any fresh child mechanism, you must use it for each gap-loop round.
- Do not reuse the previous child context, session, thread, or task ID.
- The parent orchestrator decides whether another round is needed.
- The child for the current round must not silently continue into the next round on its own.

## Fallback Rule

- If the environment cannot create any fresh child context for the required workflow, return \`BLOCKED\` instead of collapsing the loop into the current top-level context.
`;
}

function buildCommandRoutingTable(): string {
  return [
    "| Command | Route To | Purpose |",
    "| --- | --- | --- |",
    ...SUBSKILL_SOURCES.map(
      (subskill) =>
        `| \`codument:${subskill.name}\` | \`subskills/${subskill.name}/SKILL.md\` | ${subskill.description} |`
    ),
  ].join("\n");
}

function buildWorkflowRouting(): string {
  return [
    "# Workflow Routing",
    "",
    "Use this routing map when the user's request is ambiguous and you need the narrowest Codument lifecycle step.",
    "",
    ...SUBSKILL_SOURCES.map(
      (subskill) => `- \`${subskill.name}\`: ${subskill.description}`
    ),
    "",
  ].join("\n");
}

function buildTargetCapabilities(profile: WorkflowTargetProfile): string {
  const lines = [
    `# Target Capabilities: ${profile.displayName}`,
    "",
    `- Generated skill location: \`${profile.skillDisplayPath}\``,
    profile.commandDisplayPath
      ? `- Compatibility wrapper location: \`${profile.commandDisplayPath}\``
      : undefined,
    profile.wrapperNote ? `- ${profile.wrapperNote}` : undefined,
    "- Preferred fresh-child mechanisms for this target:",
    ...profile.preferredFreshChildTerms.map((term) => `  - ${term}`),
    profile.gapLoopRoundPreference
      ? `- Gap-loop round preference: ${profile.gapLoopRoundPreference}`
      : undefined,
    "- Follow the common fresh-child capability model from `shared/subagent-model.md` before adding target-specific assumptions.",
    "",
  ];

  return `${lines.filter(Boolean).join("\n")}\n`;
}

function buildSubskillFiles(profile: WorkflowTargetProfile): Record<string, string> {
  return Object.fromEntries(
    SUBSKILL_SOURCES.map((subskill) => {
      const preludeLines = [
        "Shared fresh-child capability model: `../../shared/subagent-model.md`",
        "Target-specific loading and child-agent guidance: `../../shared/target-capabilities.md`",
      ];

      if (
        profile.gapLoopRoundPreference &&
        (subskill.name === "gap-loop" ||
          subskill.name === "implement" ||
          subskill.name === "execute-wave")
      ) {
        preludeLines.push(
          `Codex-specific gap-loop preference: ${profile.gapLoopRoundPreference}`
        );
      }

      const withPrelude = buildSubskillSkill(subskill, preludeLines);

      return [path.join("subskills", subskill.name, "SKILL.md"), withPrelude];
    })
  );
}

function buildBaseSkillFiles(profile: WorkflowTargetProfile): Record<string, string> {
  const rootSkill = injectSkillPrelude(buildRootSkillTemplate(), [
    `Generated for ${profile.displayName}.`,
    `Target-specific guidance: \`shared/target-capabilities.md\``,
    "Common fresh-child capability model: `shared/subagent-model.md`",
  ]);

  return {
    [SKILL_ENTRY_FILES.root]: rootSkill,
    [SKILL_ENTRY_FILES.sharedSubagentModel]: buildSharedSubagentModel(),
    [SKILL_ENTRY_FILES.sharedTargetCapabilities]: buildTargetCapabilities(profile),
    [SKILL_ENTRY_FILES.sharedWorkflowRouting]: buildWorkflowRouting(),
    ...buildSubskillFiles(profile),
  };
}

function buildAdditionalFiles(profile: WorkflowTargetProfile): Record<string, string> {
  if (profile.id === "codex") {
    return {
      "agents/openai.yaml": buildOpenAiAgentConfig(),
    };
  }

  if (profile.id === "sparrow") {
    return {
      "manifest.yml": buildSparrowManifest(),
    };
  }

  return {};
}

export function getWorkflowTargetProfile(target: WorkflowTarget): WorkflowTargetProfile {
  return WORKFLOW_TARGET_PROFILES[target];
}

export function buildWorkflowSkillFiles(target: WorkflowTarget): Record<string, string> {
  const profile = getWorkflowTargetProfile(target);
  return {
    ...buildBaseSkillFiles(profile),
    ...buildAdditionalFiles(profile),
  };
}
