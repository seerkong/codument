import { describe, expect, it } from 'bun:test';
import {
  docsKnowledgeTemplate,
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
    expect(skills['codument-track']['SKILL.md']).toContain('attractor');
    expect(skills['codument-track']['SKILL.md']).toContain('禁止为了测试运行环境能力而发起占位问题');
    expect(skills['codument-track']['SKILL.md']).not.toContain('验证当前运行的环境对交互式问答的能力支持');

    expect(skills['codument-archive']['SKILL.md']).toContain('YYYY-MM/YYYY-MM-DD-HHmm');
    expect(skills['codument-archive']['SKILL.md']).toContain('decision://');
    expect(skills['codument-archive']['SKILL.md']).toContain('projectMemory');
    expect(skills['codument-archive']['SKILL.md']).toContain('artifact-sync');
    expect(skills['codument-archive']['SKILL.md']).toContain('codument/config/artifacts.xml');
    expect(skills['codument-archive']['SKILL.md']).toContain('不触发隐式 docs/knowledge sync');
    expect(skills['codument-archive']['SKILL.md']).toContain('不要因为 `knowledgeSync.enabled=true` 或 `artifacts.xml` 存在而同步');
    expect(skills['codument-archive']['SKILL.md']).not.toContain('before-knowledge-sync');
    expect(stdAgentsPrompt).toContain('`artifact` children are limited to `uses`, `targets`, and `policy`');
    expect(stdAgentsPrompt).toContain('<targets><target');
    expect(stdAgentsPrompt).toContain('do not put direct `attractor` or `ref` file attributes on the resource');
    expect(stdAgentsPrompt).toContain('不要只因为 `knowledgeSync.enabled=true` 或 `artifacts.xml` 存在就隐式同步');
    expect(stdAgentsPrompt).not.toContain('仅当 `codument/config/feature.json` 启用 `knowledgeSync` 或 `projectMemory` 时，才同步外部知识面或 memory');
    expect(stdAgentsPrompt).not.toContain('`artifact` children are limited to `uses` and `policy`');
    expect(skills['codument-revise-track']['SKILL.md']).toContain('operation-hooks.xml');
    expect(skills['codument-revise-track']['SKILL.md']).toContain('before-revise');
    expect(skills['codument-revise-track']['SKILL.md']).toContain('attractor-check');

    expect(skills['codument-implement']['SKILL.md']).toContain('按显式 hook 执行 artifact/knowledge sync');
    expect(skills['codument-implement']['SKILL.md']).toContain('不要只因为 `knowledgeSync.enabled=true`');
    expect(skills['codument-implement']['SKILL.md']).not.toContain('仅当 `knowledgeSync.enabled=true` 时，才向配置 target 生成 docs/knowledge 同步步骤');
    expect(skills['codument-plan-wave']['SKILL.md']).toContain('proposal/');
    expect(skills['codument-plan-wave']['SKILL.md']).toContain('design/');
    expect(skills['codument-plan-wave']['SKILL.md']).toContain('显式 `<artifact-sync artifact="..." />`');
    expect(skills['codument-plan-wave']['SKILL.md']).not.toContain('如果 `knowledgeSync.enabled=true`，需要把文档/知识同步任务纳入对应 phase 的依赖图');
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
    expect(skills['codument-docs-sync-track']).toBeUndefined();
    expect(skills['codument-artifact-sync']['SKILL.md']).toContain('codument/config/artifacts.xml');
    expect(skills['codument-artifact-sync']['SKILL.md']).toContain('只同步用户指定或 hook 引用的 artifact');
    expect(skills['codument-artifact-sync']['SKILL.md']).toContain('docs 类同步只是 artifact 的一种');
    expect(skills['codument-artifact-sync']['SKILL.md']).toContain('codument/attractors/docs-knowledge.md');
    expect(skills['codument-artifact-sync']['SKILL.md']).toContain('运行验证后必须检查 `git diff`');
    expect(skills['codument-artifact-sync']['SKILL.md']).not.toContain('docs-sync-track');
    expect(docsKnowledgeTemplate).toContain('它只提供 docs/knowledge 同步规则，不会因为 feature 开关存在而触发同步');
    expect(docsKnowledgeTemplate).toContain('不要只因为该开关为 true 就创建或执行 docs sync 任务');
    expect(docsKnowledgeTemplate).toContain('`codument/config/operation-hooks.xml` 显式配置 `<artifact-sync artifact="..." />`');
    expect(docsKnowledgeTemplate).not.toContain('每个 Codument track 都必须检查是否需要更新 docs');
    expect(docsKnowledgeTemplate).not.toContain('以下变化应加入 docs sync 任务');
    expect(skills['codument-validate']['SKILL.md']).toContain('codument/config/artifacts.xml');
    expect(skills['codument-validate']['SKILL.md']).toContain('<workflow ref="...">');
    expect(skills['codument-validate']['SKILL.md']).toContain('<skill ref="...">');
    expect(skills['codument-validate']['SKILL.md']).toContain('<targets>');
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
