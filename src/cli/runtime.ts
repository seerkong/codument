import type { CommandRuntime } from './contracts/command';
import { createPackagedResourceEffect } from './effects/resource';
import { createWorkspaceEffect } from './effects/workspace';

export function createCommandRuntime(): CommandRuntime {
  return {
    resources: createPackagedResourceEffect(),
    workspace: createWorkspaceEffect,
  };
}
