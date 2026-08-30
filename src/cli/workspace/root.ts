import * as fs from 'fs';
import * as path from 'path';

export type CodumentRootKind = 'missing' | 'directory' | 'linked-directory';

export interface CodumentRootInspection {
  kind: CodumentRootKind;
  logicalPath: string;
  realPath?: string;
}

export interface AssertCodumentRootOptions {
  allowMissing?: boolean;
}

export function inspectCodumentRoot(workspaceRoot = process.cwd()): CodumentRootInspection {
  const logicalPath = path.join(path.resolve(workspaceRoot), 'codument');
  let rootStat: fs.Stats;
  try {
    rootStat = fs.lstatSync(logicalPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { kind: 'missing', logicalPath };
    }
    throw error;
  }

  if (rootStat.isSymbolicLink()) {
    let targetStat: fs.Stats;
    try {
      targetStat = fs.statSync(logicalPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Codument root is a broken directory link: ${logicalPath}`);
      }
      throw error;
    }
    if (!targetStat.isDirectory()) {
      throw new Error(`Codument root link target is not a directory: ${logicalPath}`);
    }
    return {
      kind: 'linked-directory',
      logicalPath,
      realPath: fs.realpathSync(logicalPath),
    };
  }

  if (!rootStat.isDirectory()) {
    throw new Error(`Codument root must be a directory or directory link: ${logicalPath}`);
  }
  return {
    kind: 'directory',
    logicalPath,
    realPath: fs.realpathSync(logicalPath),
  };
}

export function assertCodumentRootUsable(
  workspaceRoot = process.cwd(),
  options: AssertCodumentRootOptions = {},
): CodumentRootInspection {
  const inspection = inspectCodumentRoot(workspaceRoot);
  if (inspection.kind === 'missing' && !options.allowMissing) {
    throw new Error(`Codument root does not exist: ${inspection.logicalPath}`);
  }
  return inspection;
}

export function codumentRootExists(workspaceRoot = process.cwd()): boolean {
  return inspectCodumentRoot(workspaceRoot).kind !== 'missing';
}
