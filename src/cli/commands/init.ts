import { parseOptions, codumentExists } from '../utils';
import {
  installSkillTemplates,
  installTemplates,
  ensureCodumentGitignoreRules,
  injectAgentsBlock,
  parseAgents,
  resolveSkillsTargets,
  writeCliToolsConfig,
} from '../utils/install';

/**
 * `codument init` — pure text copy of the embedded templates into the project.
 *
 * No interactive prompts, no template rendering, no per-agent prompt variants,
 * no commands: just copies codument/** into the workspace and the skill shells
 * into the agent skills directory, then injects the AGENTS.md managed block.
 *
 * Options:
 *   --agent <names>       comma-separated target agent skills dirs (claude|codex|opencode|eidolon|codeflicker|sparrow; default claude)
 *   --skills-dir <path>   explicit skills destination (overrides --agent as a single target)
 *   --force               overwrite existing codument/** files (default: preserve existing)
 */
export async function initCommand(args: string[]): Promise<void> {
  const { options } = parseOptions(args);
  const selectedTools = parseAgents(typeof options['agent'] === 'string' ? String(options['agent']) : undefined);
  const targets = resolveSkillsTargets(options, selectedTools);
  const [firstTarget, ...additionalTargets] = targets;
  const force = options['force'] === true;

  const result = installTemplates({ skillsDir: firstTarget.skillsDir, overwriteStd: false, force });
  const skillResults = [{ ...firstTarget, skillsWritten: result.skillsWritten, skillsRemoved: result.skillsRemoved }];
  for (const target of additionalTargets) {
    skillResults.push({ ...target, ...installSkillTemplates(target.skillsDir) });
  }
  injectAgentsBlock();
  const gitignoreRulesAdded = ensureCodumentGitignoreRules();

  console.log('Codument initialized.');
  console.log(`  codument/ : ${result.workspaceWritten} written, ${result.workspaceSkipped} kept`);
  for (const skillResult of skillResults) {
    const removed = skillResult.skillsRemoved ? `, ${skillResult.skillsRemoved} deprecated removed` : '';
    console.log(`  skills    : ${skillResult.skillsWritten} → ${skillResult.skillsDir} (agent: ${skillResult.agent}${removed})`);
  }
  writeCliToolsConfig(selectedTools);
  console.log('  config/cli-tools.json: tools updated');
  console.log('  AGENTS.md : managed block written');
  if (gitignoreRulesAdded > 0) {
    console.log(`  .gitignore: ${gitignoreRulesAdded} codument rule(s) added`);
  }
  if (codumentExists()) {
    console.log('\nNext: edit codument/attractors/{project,product}.md, then use the codument-plan-track skill.');
  }
}
