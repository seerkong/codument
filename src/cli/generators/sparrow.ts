/**
 * Codument workflow skill installer for Sparrow
 * Syncs the generated workflow skill into <workspace>/.sparrow/skill/codument-workflow/
 */

import * as path from 'path';
import { getWorkspaceDir } from '../utils';
import {
  CODUMENT_WORKFLOW_SKILL_NAME,
  buildWorkflowSkillFiles,
} from '../../skills/codument-workflow';
import { syncGeneratedSkillDirectory } from './skill-sync';

export async function generateSparrowCommands(): Promise<void> {
  const skillDir = path.join(getWorkspaceDir(), '.sparrow', 'skill', CODUMENT_WORKFLOW_SKILL_NAME);
  syncGeneratedSkillDirectory(skillDir, buildWorkflowSkillFiles('sparrow'));
}
