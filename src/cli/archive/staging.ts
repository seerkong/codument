import * as fs from 'fs';
import * as path from 'path';
import { CODUMENT_DIR } from '../utils';

export type RegistryStageKind = 'behavior' | 'spec' | 'modeling' | 'engineering';

export interface RegistryStagingTransaction {
  rootDir: string;
}

export interface StagedRegistry {
  kind: RegistryStageKind;
  liveDir: string;
  stagedDir: string;
  changedFiles: string[];
}

export interface StagedRegistryResult<T> {
  stage: StagedRegistry;
  result: T;
}

export function createRegistryStagingTransaction(): RegistryStagingTransaction {
  fs.mkdirSync(CODUMENT_DIR, { recursive: true });
  return {
    rootDir: fs.mkdtempSync(path.join(CODUMENT_DIR, '.archive-staging-')),
  };
}

function collectFiles(rootDir: string): string[] {
  const files: string[] = [];

  function visit(dir: string): void {
    if (!fs.existsSync(dir)) {
      return;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
      } else if (entry.isFile()) {
        files.push(path.relative(rootDir, entryPath));
      }
    }
  }

  visit(rootDir);
  return files.sort();
}

function changedFiles(liveDir: string, stagedDir: string): string[] {
  const candidates = new Set([...collectFiles(liveDir), ...collectFiles(stagedDir)]);
  return [...candidates].filter((relFile) => {
    const liveFile = path.join(liveDir, relFile);
    const stagedFile = path.join(stagedDir, relFile);
    if (!fs.existsSync(liveFile) || !fs.existsSync(stagedFile)) {
      return true;
    }
    if (!fs.statSync(liveFile).isFile() || !fs.statSync(stagedFile).isFile()) {
      return true;
    }
    return !fs.readFileSync(liveFile).equals(fs.readFileSync(stagedFile));
  }).sort();
}

export function stageRegistry<T>(
  transaction: RegistryStagingTransaction,
  kind: RegistryStageKind,
  liveDir: string,
  mutate: (stagedDir: string) => T,
): StagedRegistryResult<T> {
  const stagedDir = path.join(transaction.rootDir, kind);
  if (fs.existsSync(liveDir)) {
    fs.cpSync(liveDir, stagedDir, { recursive: true });
  } else {
    fs.mkdirSync(stagedDir, { recursive: true });
  }

  const result = mutate(stagedDir);
  return {
    stage: {
      kind,
      liveDir,
      stagedDir,
      changedFiles: changedFiles(liveDir, stagedDir),
    },
    result,
  };
}

export function commitStagedRegistry(stage: StagedRegistry): void {
  const deletions = stage.changedFiles.filter(
    (relFile) => !fs.existsSync(path.join(stage.stagedDir, relFile)),
  );
  for (const relFile of deletions.sort((a, b) => b.length - a.length)) {
    fs.rmSync(path.join(stage.liveDir, relFile), { recursive: true, force: true });
  }

  const writes = stage.changedFiles.filter(
    (relFile) => fs.existsSync(path.join(stage.stagedDir, relFile)),
  );
  for (const relFile of writes) {
    const source = path.join(stage.stagedDir, relFile);
    const target = path.join(stage.liveDir, relFile);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
}

interface RegistryBackup {
  stage: StagedRegistry;
  existed: boolean;
  backupDir: string;
}

export interface RegistryCommitReceipt {
  transaction: RegistryStagingTransaction;
  applied: RegistryBackup[];
  settled: boolean;
}

interface PreservedTransactionError extends Error {
  preserveRegistryStagingTransaction?: boolean;
  cause?: unknown;
}

/**
 * Commit all changed registry stages as one rollback-capable unit. Every target
 * is backed up before the first live write; any later failure restores every
 * target already attempted, in reverse order.
 */
export function commitRegistryStages(
  transaction: RegistryStagingTransaction,
  stages: Iterable<StagedRegistry | null | undefined>,
): RegistryCommitReceipt {
  const changedStages = [...stages].filter(
    (stage): stage is StagedRegistry => Boolean(stage && stage.changedFiles.length > 0),
  );
  const backups: RegistryBackup[] = [];

  for (const stage of changedStages) {
    const existed = fs.existsSync(stage.liveDir);
    const backupDir = path.join(transaction.rootDir, 'backups', stage.kind);
    if (existed) {
      fs.mkdirSync(path.dirname(backupDir), { recursive: true });
      fs.cpSync(stage.liveDir, backupDir, { recursive: true });
    }
    backups.push({ stage, existed, backupDir });
  }

  const receipt: RegistryCommitReceipt = {
    transaction,
    applied: [],
    settled: false,
  };
  try {
    for (const backup of backups) {
      receipt.applied.push(backup);
      commitStagedRegistry(backup.stage);
    }
  } catch (commitError) {
    rollbackRegistryCommit(receipt, commitError);
    throw commitError;
  }

  return receipt;
}

/** Restore every registry changed by a successful or partial commit, in reverse order. */
export function rollbackRegistryCommit(
  receipt: RegistryCommitReceipt,
  originalError: unknown,
): void {
  if (receipt.settled) {
    return;
  }

  const rollbackErrors: unknown[] = [];
  for (const backup of [...receipt.applied].reverse()) {
    try {
      fs.rmSync(backup.stage.liveDir, { recursive: true, force: true });
      if (backup.existed) {
        fs.mkdirSync(path.dirname(backup.stage.liveDir), { recursive: true });
        fs.cpSync(backup.backupDir, backup.stage.liveDir, { recursive: true });
      }
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError);
    }
  }

  if (rollbackErrors.length > 0) {
    const originalMessage = originalError instanceof Error ? originalError.message : String(originalError);
    const rollbackMessage = rollbackErrors
      .map((error) => error instanceof Error ? error.message : String(error))
      .join('; ');
    const error = new Error(
      `Registry transaction failed: ${originalMessage}. Rollback also failed: ${rollbackMessage}. `
      + `Transaction backups preserved at ${receipt.transaction.rootDir}.`,
    ) as PreservedTransactionError;
    error.cause = originalError;
    error.preserveRegistryStagingTransaction = true;
    throw error;
  }

  receipt.settled = true;
  cleanupRegistryStagingTransaction(receipt.transaction);
}

/** Finalize a committed transaction only after its caller's downstream effects succeed. */
export function finalizeRegistryCommit(receipt: RegistryCommitReceipt): void {
  if (receipt.settled) {
    return;
  }
  cleanupRegistryStagingTransaction(receipt.transaction);
  receipt.settled = true;
}

export function shouldPreserveRegistryStagingTransaction(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && (error as PreservedTransactionError).preserveRegistryStagingTransaction,
  );
}

export function cleanupRegistryStagingTransaction(
  transaction: RegistryStagingTransaction,
): void {
  fs.rmSync(transaction.rootDir, { recursive: true, force: true });
}
