/**
 * Codument workflow skill installer for Sparrow
 * Syncs generated workflow skills into the workspace Sparrow skill directory.
 */

import * as path from 'path';
import { getWorkspaceDir } from '../utils';
import {
  LEGACY_CODUMENT_SKILL_NAME,
  buildWorkflowSkillDirectories,
} from '../../skills/codument-workflow';
import { syncGeneratedSkillDirectories } from './skill-sync';

export async function generateSparrowCommands(): Promise<void> {
  const skillsRootDir = path.join(getWorkspaceDir(), '.sparrow', 'skill');
  syncGeneratedSkillDirectories(
    skillsRootDir,
    buildWorkflowSkillDirectories('sparrow'),
    [LEGACY_CODUMENT_SKILL_NAME]
  );
}
