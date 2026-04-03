/**
 * Codument workflow skill installer for Codex
 * Syncs the generated workflow skill into ~/.codex/skills/codument-workflow/
 */

import * as os from 'os';
import * as path from 'path';
import {
  CODUMENT_WORKFLOW_SKILL_NAME,
  buildWorkflowSkillFiles,
} from '../../skills/codument-workflow';
import { syncGeneratedSkillDirectory } from './skill-sync';

const CODEX_SKILLS_DIR = path.join(os.homedir(), '.codex', 'skills');

export async function generateCodexCommands(): Promise<void> {
  const skillDir = path.join(CODEX_SKILLS_DIR, CODUMENT_WORKFLOW_SKILL_NAME);
  syncGeneratedSkillDirectory(skillDir, buildWorkflowSkillFiles('codex'));
}
