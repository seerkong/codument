/**
 * Codument standalone lifecycle skill installer for Codex.
 * Syncs generated codument-* skills into the Codex skills directory.
 */

import * as os from 'os';
import * as path from 'path';
import {
  CODUMENT_WORKFLOW_SKILL_NAME,
  LEGACY_CODUMENT_SKILL_NAME,
  buildWorkflowSkillDirectories,
} from '../../skills/codument-lifecycle';
import { syncGeneratedSkillDirectories } from './skill-sync';

const CODEX_SKILLS_DIR = path.join(os.homedir(), '.codex', 'skills');

export async function generateCodexCommands(): Promise<void> {
  syncGeneratedSkillDirectories(
    CODEX_SKILLS_DIR,
    buildWorkflowSkillDirectories('codex'),
    [LEGACY_CODUMENT_SKILL_NAME, CODUMENT_WORKFLOW_SKILL_NAME]
  );
}
