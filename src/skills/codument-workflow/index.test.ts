import { describe, expect, it } from 'bun:test';
import { stdAgentsPrompt, workflowTemplate } from '../../prompts';
import { buildWorkflowSkillDirectories } from './index';

describe('generated Codument workflow skills', () => {
  it('include attractor, large-track, and knowledge-sync guidance from updated prompts', () => {
    const skills = buildWorkflowSkillDirectories('codex');

    expect(skills['codument-track']['SKILL.md']).toContain('codument/attractors/');
    expect(skills['codument-track']['SKILL.md']).toContain('proposal/');
    expect(skills['codument-track']['SKILL.md']).toContain('design/');
    expect(skills['codument-track']['SKILL.md']).toContain('Good');
    expect(skills['codument-track']['SKILL.md']).toContain('Bad');
    expect(skills['codument-track']['SKILL.md']).toContain('codument/std/protocols.md');
    expect(skills['codument-track']['SKILL.md']).toContain('禁止为了测试运行环境能力而发起占位问题');
    expect(skills['codument-track']['SKILL.md']).not.toContain('验证当前运行的环境对交互式问答的能力支持');

    expect(skills['codument-archive']['SKILL.md']).toContain('YYYY-MM/YYYY-MM-DD-HHmm');
    expect(skills['codument-archive']['SKILL.md']).toContain('decision://');
    expect(skills['codument-archive']['SKILL.md']).toContain('projectMemory');

    expect(skills['codument-implement']['SKILL.md']).toContain('knowledgeSync.enabled');
    expect(skills['codument-plan-wave']['SKILL.md']).toContain('proposal/');
    expect(skills['codument-plan-wave']['SKILL.md']).toContain('design/');
    expect(skills['codument-init']['SKILL.md']).toContain('codument/attractors/project.md');
    expect(skills['codument-init']['SKILL.md']).toContain('codument/config/feature.json');
    expect(skills['codument-init']['SKILL.md']).toContain('codument/workflows/workflow.md');
    expect(skills['codument-init']['SKILL.md']).not.toContain('写入 `codument/project.md`');
    expect(skills['codument-init']['SKILL.md']).not.toContain('写入 `codument/product.md`');
    expect(skills['codument-init']['SKILL.md']).not.toContain('写入 `codument/workflow.md`');
    expect(skills['codument-discuss']['SKILL.md']).toContain('codument/attractors/');
    expect(skills['codument-status']['SKILL.md']).toContain('codument/attractors/');
    expect(skills['codument-verify']['SKILL.md']).toContain('codument/attractors/');
    expect(skills['codument-track']['SKILL.md']).not.toContain('你现在可以运行 `/codument:implement`');
    expect(skills['codument-archive']['SKILL.md']).toContain('codument archive <track_id> --yes');
    expect(skills['codument-archive']['SKILL.md']).not.toContain('codument-dev');

    expect(stdAgentsPrompt).toContain('codument/attractors/');
    expect(stdAgentsPrompt).toContain('[capability].xml');
    expect(stdAgentsPrompt).toContain('workflows/');
    expect(workflowTemplate).toContain('codument/attractors/');
  });
});
