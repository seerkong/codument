import * as fs from 'fs';
import * as path from 'path';

export const WORKSPACE_BINDINGS_FILE = path.join('codument', '.local', 'workspace-bindings.xnl');

export interface WorkspaceBinding {
  projectRef: string;
  workspacePath: string;
}

function escape(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

export function readWorkspaceBindings(file = WORKSPACE_BINDINGS_FILE): WorkspaceBinding[] {
  if (!fs.existsSync(file)) return [];
  const content = fs.readFileSync(file, 'utf8');
  const bindings: WorkspaceBinding[] = [];
  const pattern = /<Binding\s+#([^\s{]+)\s*\{([^}]*)\}>/g;
  for (const match of content.matchAll(pattern)) {
    const projectRef = match[2].match(/project_ref\s*=\s*"([^"]+)"/)?.[1];
    const workspacePath = match[2].match(/workspace_path\s*=\s*"([^"]+)"/)?.[1];
    if (projectRef && workspacePath) bindings.push({ projectRef, workspacePath });
  }
  return bindings;
}

export function resolveWorkspaceBinding(projectRef: string, file = WORKSPACE_BINDINGS_FILE): string | undefined {
  return readWorkspaceBindings(file).find((binding) => binding.projectRef === projectRef)?.workspacePath;
}

export function writeWorkspaceBindings(bindings: WorkspaceBinding[], file = WORKSPACE_BINDINGS_FILE): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = bindings.map((binding) =>
    `    <Binding #${binding.projectRef.replace(/[^A-Za-z0-9_-]/g, '-')} { project_ref = "${escape(binding.projectRef)}" workspace_path = "${escape(binding.workspacePath)}" }>`
  ).join('\n');
  fs.writeFileSync(file, `<WorkspaceBindings [\n${body}${body ? '\n' : ''} ]>\n`);
}

export function bindWorkspace(projectRef: string, workspacePath: string, file = WORKSPACE_BINDINGS_FILE): WorkspaceBinding {
  const binding = { projectRef, workspacePath: path.resolve(workspacePath) };
  writeWorkspaceBindings([
    ...readWorkspaceBindings(file).filter((item) => item.projectRef !== projectRef),
    binding,
  ], file);
  return binding;
}

export function unbindWorkspace(projectRef: string, file = WORKSPACE_BINDINGS_FILE): void {
  writeWorkspaceBindings(readWorkspaceBindings(file).filter((item) => item.projectRef !== projectRef), file);
}
