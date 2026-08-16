import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface WorkspaceEffect {
  readonly root: string;
  exists(workspacePath: string): Promise<boolean>;
  readText(workspacePath: string): Promise<string | undefined>;
  writeText(workspacePath: string, content: string): Promise<void>;
  makeDirectory(workspacePath: string): Promise<void>;
  remove(workspacePath: string): Promise<void>;
}

export class FileSystemWorkspaceEffect implements WorkspaceEffect {
  readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private resolve(workspacePath: string): string {
    if (path.isAbsolute(workspacePath)) throw new Error(`Workspace path must be relative: ${workspacePath}`);
    const resolved = path.resolve(this.root, workspacePath);
    if (resolved !== this.root && !resolved.startsWith(`${this.root}${path.sep}`)) {
      throw new Error(`Workspace path escapes root: ${workspacePath}`);
    }
    return resolved;
  }

  async exists(workspacePath: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(workspacePath));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }

  async readText(workspacePath: string): Promise<string | undefined> {
    try {
      return await fs.readFile(this.resolve(workspacePath), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }

  async writeText(workspacePath: string, content: string): Promise<void> {
    const destination = this.resolve(workspacePath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, content, 'utf8');
  }

  async makeDirectory(workspacePath: string): Promise<void> {
    await fs.mkdir(this.resolve(workspacePath), { recursive: true });
  }

  async remove(workspacePath: string): Promise<void> {
    await fs.rm(this.resolve(workspacePath), { recursive: true, force: true });
  }
}

export function createWorkspaceEffect(root = process.cwd()): WorkspaceEffect {
  return new FileSystemWorkspaceEffect(root);
}
