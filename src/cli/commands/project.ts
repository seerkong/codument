import { parseOptions } from '../utils';
import { bindWorkspace, readWorkspaceBindings, unbindWorkspace } from '../project/bindings';

export function projectBindingCommand(args: string[]): void {
  const { positional } = parseOptions(args);
  const command = positional[0];
  if (command === 'bind') {
    const projectRef = positional[1];
    const workspacePath = positional[2];
    if (!projectRef || !workspacePath || positional.length !== 3) {
      throw new Error('Usage: codument project bind <project-ref> <workspace-path>');
    }
    const binding = bindWorkspace(projectRef, workspacePath);
    console.log(`ProjectRef '${projectRef}' bound locally to ${binding.workspacePath}`);
    return;
  }
  if (command === 'bindings') {
    if (positional.length !== 1) throw new Error('Usage: codument project bindings');
    for (const binding of readWorkspaceBindings()) console.log(`${binding.projectRef}\t${binding.workspacePath}`);
    return;
  }
  if (command === 'unbind') {
    const projectRef = positional[1];
    if (!projectRef || positional.length !== 2) throw new Error('Usage: codument project unbind <project-ref>');
    unbindWorkspace(projectRef);
    console.log(`ProjectRef '${projectRef}' unbound locally`);
    return;
  }
  throw new Error('Usage: codument project <bind|bindings|unbind> ...');
}
