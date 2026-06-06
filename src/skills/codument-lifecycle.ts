import * as path from "path";
import {
  archivePrompt,
  discussPrompt,
  executeWavePrompt,
  gapLoopPrompt,
  docsBootstrapPrompt,
  artifactSyncPrompt,
  migrateArchivePrompt,
  migrateSpecsPrompt,
  implementPrompt,
  initPrompt,
  planWavePrompt,
  reviseTrackPrompt,
  statusPrompt,
  trackPrompt,
  validatePrompt,
  verifyPrompt,
} from "../prompts";

export const CODUMENT_WORKFLOW_SKILL_NAME = "codument-workflow";
export const LEGACY_CODUMENT_SKILL_NAME = "codument";
export const LEGACY_DOCS_SYNC_TRACK_SKILL_NAME = "codument-docs-sync-track";
export const CODUMENT_SKILL_PREFIX = "codument";

export type WorkflowTarget = "claude" | "codeflicker" | "codex" | "eidolon" | "sparrow" | "opencode";

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
  { name: "docs-bootstrap", prompt: docsBootstrapPrompt, description: "Summarize an existing project into docs/modeling and docs/impl." },
  { name: "artifact-sync", prompt: artifactSyncPrompt, description: "Sync an explicitly selected artifact from codument/config/artifacts.xml." },
  { name: "implement", prompt: implementPrompt, description: "Implement a track sequentially from plan.xml." },
  { name: "migrate-archive", prompt: migrateArchivePrompt, description: "Migrate legacy Codument archive layouts to the current archive directory convention." },
  { name: "migrate-specs", prompt: migrateSpecsPrompt, description: "Migrate legacy Markdown specs to XML spec registry files or folders." },
  { name: "init", prompt: initPrompt, description: "Initialize or resume Codument project setup." },
  { name: "plan-wave", prompt: planWavePrompt, description: "Convert a phase into wave DAG execution groups." },
  { name: "revise-track", prompt: reviseTrackPrompt, description: "Revise an existing track's self-contained artifacts during non-linear work." },
  { name: "status", prompt: statusPrompt, description: "Show project status and summarize tracks or tasks." },
  { name: "track", prompt: trackPrompt, description: "Create a new track, proposal, spec, or plan." },
  { name: "validate", prompt: validatePrompt, description: "Validate track or spec structure and strict-mode checks." },
  { name: "verify", prompt: verifyPrompt, description: "Verify implemented work with issues-first reporting." },
] as const;

const NO_FRESH_CHILD_PRELUDE = new Set<string>([
  "docs-bootstrap",
  "artifact-sync",
  "migrate-archive",
  "migrate-specs",
]);

export const CLAUDE_WORKFLOW_SKILL_DISPLAY_PATH = `.claude/skills/`;
export const CLAUDE_WORKFLOW_COMMAND_DISPLAY_PATH = ".claude/commands/codument/";
export const CODEFLICKER_WORKFLOW_SKILL_DISPLAY_PATH = `.codeflicker/skills/`;
export const CODEFLICKER_WORKFLOW_COMMAND_DISPLAY_PATH = ".codeflicker/commands/codument/";
export const CODEX_WORKFLOW_SKILL_DISPLAY_PATH = `~/.codex/skills/`;
export const EIDOLON_WORKFLOW_SKILL_DISPLAY_PATH = `.eidolon/skills/`;
export const EIDOLON_WORKFLOW_COMMAND_DISPLAY_PATH = ".eidolon/commands/codument/";
export const OPENCODE_WORKFLOW_SKILL_DISPLAY_PATH = `.opencode/skills/`;
export const OPENCODE_WORKFLOW_COMMAND_DISPLAY_PATH = ".opencode/command/";
export const SPARROW_WORKFLOW_SKILL_DISPLAY_PATH = `.sparrow/skills/`;

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
      "When you spawn a fresh gap-loop child and the environment lets you choose model and reasoning explicitly, prefer model `gpt-5.5` or higher with `high` reasoning.",
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
  sparrow: {
    id: "sparrow",
    displayName: "Sparrow",
    skillDisplayPath: SPARROW_WORKFLOW_SKILL_DISPLAY_PATH,
    preferredFreshChildTerms: [
      "`task`",
      "a brand-new subagent task for each round",
    ],
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
};

function buildSubskillSkill(
  subskill: (typeof SUBSKILL_SOURCES)[number],
  preludeLines: string[]
): string {
  const prelude = preludeLines.map((line) => `> ${line}`).join("\n");
  const commandName = `${CODUMENT_SKILL_PREFIX}:${subskill.name}`;
  const aliasName = `${CODUMENT_SKILL_PREFIX}-${subskill.name}`;
  return `---
name: ${aliasName}
description: ${subskill.description} Trigger this skill for ${commandName} or ${aliasName} requests.
---

${prelude}

> Trigger aliases: \`${commandName}\`, \`${aliasName}\`.

${subskill.prompt}
`;
}

function buildSparrowManifest(
  name: string,
  description: string = "Codument lifecycle and track workflows for Sparrow local skill loading."
): string {
  return `${JSON.stringify(
    {
      name,
      description,
      entry_file: "SKILL.md",
      briefInfo: {
        name,
        description,
        entry_file: "SKILL.md",
      },
    },
    null,
    2
  )}\n`;
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
  const skillPrefix = CODUMENT_SKILL_PREFIX;
  return [
    "| Command | Route To | Purpose |",
    "| --- | --- | --- |",
    ...SUBSKILL_SOURCES.map(
      (subskill) =>
        `| \`${skillPrefix}:${subskill.name}\` / \`${skillPrefix}-${subskill.name}\` | \`subskills/${subskill.name}/SKILL.md\` or standalone skill \`${skillPrefix}-${subskill.name}\` | ${subskill.description} |`
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
      const withPrelude = buildSubskillSkill(
        subskill,
        getSubskillPreludeLines(profile, subskill, "../../")
      );

      return [path.join("subskills", subskill.name, "SKILL.md"), withPrelude];
    })
  );
}

function getSubskillPreludeLines(
  profile: WorkflowTargetProfile,
  subskill: (typeof SUBSKILL_SOURCES)[number],
  sharedPrefix: string
): string[] {
  if (NO_FRESH_CHILD_PRELUDE.has(subskill.name)) {
    return [];
  }

  const preludeLines = [
    `Shared fresh-child capability model: \`${sharedPrefix}shared/subagent-model.md\``,
    `Target-specific loading and child-agent guidance: \`${sharedPrefix}shared/target-capabilities.md\``,
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

  return preludeLines;
}

function buildStandaloneSubskillSkillFiles(
  target: WorkflowTarget,
  subskill: (typeof SUBSKILL_SOURCES)[number]
): Record<string, string> {
  const profile = getWorkflowTargetProfile(target);
  const aliasName = `${CODUMENT_SKILL_PREFIX}-${subskill.name}`;
  const files: Record<string, string> = {
    [SKILL_ENTRY_FILES.root]: buildSubskillSkill(subskill, [
      ...getSubskillPreludeLines(profile, subskill, ""),
      `Standalone Codument lifecycle skill for \`${CODUMENT_SKILL_PREFIX}:${subskill.name}\` / \`${aliasName}\`.`,
      "For lifecycle routing guidance, use `shared/workflow-routing.md`.",
    ]),
    [SKILL_ENTRY_FILES.sharedSubagentModel]: buildSharedSubagentModel(),
    [SKILL_ENTRY_FILES.sharedTargetCapabilities]: buildTargetCapabilities(profile),
    [SKILL_ENTRY_FILES.sharedWorkflowRouting]: buildWorkflowRouting(),
  };

  if (target === "sparrow") {
    files["manifest.yml"] = buildSparrowManifest(aliasName, subskill.description);
  }

  return files;
}

export function getWorkflowTargetProfile(target: WorkflowTarget): WorkflowTargetProfile {
  return WORKFLOW_TARGET_PROFILES[target];
}

export function buildWorkflowSkillDirectories(target: WorkflowTarget): Record<string, Record<string, string>> {
  return Object.fromEntries(
    SUBSKILL_SOURCES.map((subskill) => [
      `${CODUMENT_SKILL_PREFIX}-${subskill.name}`,
      buildStandaloneSubskillSkillFiles(target, subskill),
    ])
  );
}
