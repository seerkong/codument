import { describe, expect, it } from 'bun:test';
import { argvSchema, renderCommandResult, type CommandRuntime } from '../../src/cli/contracts/command';
import { EmbeddedResourceEffect } from '../../src/cli/effects/resource';
import { createWorkspaceEffect } from '../../src/cli/effects/workspace';

const runtime: CommandRuntime = {
  resources: new EmbeddedResourceEffect([]),
  workspace: createWorkspaceEffect,
};

describe('CLI command contract', () => {
  it('builds a stable context while preserving raw args and passthrough values', () => {
    const context = argvSchema.parse(
      ['item', '--json', '--mode=fast', '--', 'bun', 'test', '--watch'],
      ['track', 'verify'],
      runtime,
    );

    expect(context.path).toEqual(['track', 'verify']);
    expect(context.args).toEqual(['item', '--json', '--mode=fast', '--', 'bun', 'test', '--watch']);
    expect(context.positional).toEqual(['item', 'bun', 'test', '--watch']);
    expect(context.options).toEqual({ json: true, mode: 'fast' });
    expect(context.runtime).toBe(runtime);
  });

  it('renders a structured result exactly once', () => {
    const previous = console.log;
    const lines: string[] = [];
    console.log = (...values: unknown[]) => lines.push(values.join(' '));
    try {
      renderCommandResult({ code: 0, data: { status: 'ok' } });
      expect(lines).toEqual(['{\n  "status": "ok"\n}']);
    } finally {
      console.log = previous;
    }
  });
});
