import { describe, expect, it } from 'bun:test';
import {
  stdAgentsPrompt,
  workflowTemplate,
} from '../prompts';
import { buildWorkflowSkillDirectories } from './codument-lifecycle';

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
    expect(skills['codument-docs-bootstrap']['SKILL.md']).toContain('docs/modeling');
    expect(skills['codument-docs-bootstrap']['SKILL.md']).toContain('docs/impl');
    expect(skills['codument-docs-bootstrap']['SKILL.md']).toContain('不确定');
    expect(skills['codument-docs-bootstrap']['SKILL.md']).toContain('最小可用 bootstrap');
    expect(skills['codument-docs-bootstrap']['SKILL.md']).toContain('不需要 gap-loop 式 fresh child orchestration');
    expect(skills['codument-docs-bootstrap']['SKILL.md']).not.toContain('Shared fresh-child capability model');
    expect(skills['codument-docs-sync-track']['SKILL.md']).toContain('active 或 archived track');
    expect(skills['codument-docs-sync-track']['SKILL.md']).toContain('只同步指定 track 实际造成的知识变化');
    expect(skills['codument-docs-sync-track']['SKILL.md']).toContain('不代表项目 docs 已完整 bootstrap');
    expect(skills['codument-docs-sync-track']['SKILL.md']).toContain('运行验证后必须检查 `git diff`');
    expect(skills['codument-migrate-archive']['SKILL.md']).toContain('YYYY-MM/YYYY-MM-DD-HHmm-track-id');
    expect(skills['codument-migrate-archive']['SKILL.md']).toContain('备份或迁移记录');
    expect(skills['codument-migrate-archive']['SKILL.md']).toContain('额外 archive 布局扫描');
    expect(skills['codument-migrate-archive']['SKILL.md']).toContain('目录名日期');
    expect(skills['codument-migrate-specs']['SKILL.md']).toContain('codument/specs/<capability>.xml');
    expect(skills['codument-migrate-specs']['SKILL.md']).toContain('codument/legacy/specs');
    expect(skills['codument-migrate-specs']['SKILL.md']).toContain('当前 Codument CLI 是否支持 XML registry');
    expect(skills['codument-migrate-specs']['SKILL.md']).toContain('本地降级验证');
    expect(skills['codument-migrate-specs']['SKILL.md']).toContain('codument/specs/<capability>/index.xml');
    expect(skills['codument-migrate-specs']['SKILL.md']).toContain('requirement');
    expect(skills['codument-migrate-specs']['SKILL.md']).toContain('suite');
    expect(skills['codument-migrate-specs']['SKILL.md']).toContain('case');
    expect(skills['codument-migrate-specs']['SKILL.md']).toContain('全局唯一');
    expect(skills['codument-migrate-specs']['SKILL.md']).toContain('无重复');
    expect(skills['codument-migrate-specs']['SKILL.md']).not.toContain('Shared fresh-child capability model');
    expect(skills['codument-track']['SKILL.md']).not.toContain('你现在可以运行 `/codument:implement`');
    expect(skills['codument-archive']['SKILL.md']).toContain('codument archive <track_id> --yes');
    expect(skills['codument-archive']['SKILL.md']).not.toContain('codument-dev');

    expect(stdAgentsPrompt).toContain('codument/attractors/');
    expect(stdAgentsPrompt).toContain('[capability].xml');
    expect(stdAgentsPrompt).toContain('decisions/');
    expect(stdAgentsPrompt).toContain('memory/');
    expect(stdAgentsPrompt).toContain('workflows/');
    expect(workflowTemplate).toContain('codument/attractors/');
  });
});
