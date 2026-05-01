/**
 * Codument workflow skill installer for Codex
 * Syncs generated workflow skills into the Codex skills directory.
 */

import * as os from 'os';
import * as path from 'path';
import {
  LEGACY_CODUMENT_SKILL_NAME,
  buildWorkflowSkillDirectories,
} from '../../skills/codument-workflow';
import { syncGeneratedSkillDirectories } from './skill-sync';

const CODEX_SKILLS_DIR = path.join(os.homedir(), '.codex', 'skills');

export async function generateCodexCommands(): Promise<void> {
  syncGeneratedSkillDirectories(
    CODEX_SKILLS_DIR,
    buildWorkflowSkillDirectories('codex'),
    [LEGACY_CODUMENT_SKILL_NAME]
  );
}
