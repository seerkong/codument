/**
 * Codument standalone lifecycle skill installer for Sparrow.
 * Syncs generated codument-* skills into the workspace Sparrow skills directory.
 */

import * as path from 'path';
import * as fs from 'fs';
import { getWorkspaceDir } from '../utils';
import {
  CODUMENT_WORKFLOW_SKILL_NAME,
  LEGACY_DOCS_SYNC_TRACK_SKILL_NAME,
  LEGACY_CODUMENT_SKILL_NAME,
  buildWorkflowSkillDirectories,
} from '../../skills/codument-lifecycle';
import { syncGeneratedSkillDirectories } from './skill-sync';

function cleanupOldSparrowSkillRoot(oldSkillsRootDir: string): void {
  if (!fs.existsSync(oldSkillsRootDir)) {
    return;
  }

  for (const entry of fs.readdirSync(oldSkillsRootDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    if (
      entry.name === LEGACY_CODUMENT_SKILL_NAME ||
      entry.name === CODUMENT_WORKFLOW_SKILL_NAME ||
      entry.name.startsWith('codument-')
    ) {
      fs.rmSync(path.join(oldSkillsRootDir, entry.name), { recursive: true, force: true });
    }
  }
}

export async function generateSparrowCommands(): Promise<void> {
  cleanupOldSparrowSkillRoot(path.join(getWorkspaceDir(), '.sparrow', 'skill'));

  const skillsRootDir = path.join(getWorkspaceDir(), '.sparrow', 'skills');
  syncGeneratedSkillDirectories(
    skillsRootDir,
    buildWorkflowSkillDirectories('sparrow'),
    [LEGACY_CODUMENT_SKILL_NAME, CODUMENT_WORKFLOW_SKILL_NAME, LEGACY_DOCS_SYNC_TRACK_SKILL_NAME]
  );
}
