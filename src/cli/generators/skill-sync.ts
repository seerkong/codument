import * as fs from 'fs';
import * as path from 'path';

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function hasExpectedDescendants(relativeDir: string, expectedPaths: Set<string>): boolean {
  for (const expectedPath of expectedPaths) {
    if (expectedPath.startsWith(`${relativeDir}/`)) {
      return true;
    }
  }

  return false;
}

function removeUnexpectedEntries(rootDir: string, relativeDir: string, expectedPaths: Set<string>): void {
  if (!fs.existsSync(rootDir)) {
    return;
  }

  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
    const absolutePath = path.join(rootDir, entry.name);

    if (entry.isDirectory()) {
      if (!hasExpectedDescendants(relativePath, expectedPaths)) {
        fs.rmSync(absolutePath, { recursive: true, force: true });
        continue;
      }

      removeUnexpectedEntries(absolutePath, relativePath, expectedPaths);
      continue;
    }

    if (!expectedPaths.has(relativePath)) {
      fs.rmSync(absolutePath, { force: true });
    }
  }
}

export function syncGeneratedSkillDirectory(skillDir: string, files: Record<string, string>): void {
  ensureDir(skillDir);

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(skillDir, relativePath);
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, content);
  }

  removeUnexpectedEntries(skillDir, '', new Set(Object.keys(files)));
}

export function syncGeneratedSkillDirectories(
  skillsRootDir: string,
  directories: Record<string, Record<string, string>>,
  legacySkillNames: string[] = []
): void {
  ensureDir(skillsRootDir);

  for (const legacySkillName of legacySkillNames) {
    if (directories[legacySkillName]) {
      continue;
    }

    const legacySkillPath = path.join(skillsRootDir, legacySkillName);
    if (fs.existsSync(legacySkillPath) && fs.statSync(legacySkillPath).isDirectory()) {
      fs.rmSync(legacySkillPath, { recursive: true, force: true });
    }
  }

  for (const [skillName, files] of Object.entries(directories)) {
    syncGeneratedSkillDirectory(path.join(skillsRootDir, skillName), files);
  }
}
