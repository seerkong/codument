import { describe, it, expect, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  parsePlanSummary,
  parseTaskDetails,
  getExecutionMode,
  getTrack,
  getTrackIds,
  getTracks,
  setWorkspaceDir,
} from '../../../src/cli/utils/index';

// --- helpers ---

const tmpDirs: string[] = [];
const originalWorkspaceDir = process.cwd();

function createTempPlan(content: string): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-test-'));
  tmpDirs.push(tmpDir);
  const planPath = path.join(tmpDir, 'plan.xml');
  fs.writeFileSync(planPath, content, 'utf-8');
  return planPath;
}

afterEach(() => {
  setWorkspaceDir(originalWorkspaceDir);
  for (const d of tmpDirs) {
    fs.rmSync(d, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

function createTempWorkspaceTrack(
  trackId: string,
  _legacyStatus: 'new' | 'in_progress' | 'completed' | 'cancelled',
  trackStatus: 'new' | 'in_progress' | 'completed' | 'cancelled',
): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-ws-test-'));
  tmpDirs.push(tmpDir);

  const trackDir = path.join(tmpDir, 'codument', 'tracks', 'active', trackId);
  fs.mkdirSync(trackDir, { recursive: true });

  fs.writeFileSync(path.join(trackDir, 'track.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<Track id="${trackId}" version="1" xmlns:cdt="urn:codument:v1">
  <Metadata>
    <Status>${trackStatus}</Status>
    <Goal>g</Goal>
    <Description>test track</Description>
    <CommitMode>manual</CommitMode>
    <CreatedAt>2026-03-01T00:00:00Z</CreatedAt>
    <UpdatedAt>2026-03-01T00:00:00Z</UpdatedAt>
  </Metadata>
  <TaskSpace id="space_${trackId}" name="${trackId}">
    <SubNodes>
      <TaskGroup id="P1" name="p1" status="DONE">
        <SubNodes>
          <Task id="T1.1" name="t" status="DONE" priority="P0" />
        </SubNodes>
      </TaskGroup>
    </SubNodes>
  </TaskSpace>
</Track>`);

  return tmpDir;
}

// --- 1. 旧 plan.xml 兼容性（含 dependencies） ---

describe('旧 plan.xml 兼容性', () => {
  const archive1 = path.resolve(__dirname, 'fixtures/legacy-plan-with-deps-309.xml');
  const archive2 = path.resolve(__dirname, 'fixtures/legacy-plan-with-deps-52.xml');

  describe('parsePlanSummary', () => {
    it('解析 309 行归档文件不报错', () => {
      const summary = parsePlanSummary(archive1);
      expect(summary).toBeDefined();
      expect(summary!.total_phases).toBe(5);
      expect(summary!.total_tasks).toBe(22);
      expect(summary!.completed).toBe(22);
    });

    it('解析 52 行归档文件不报错', () => {
      const summary = parsePlanSummary(archive2);
      expect(summary).toBeDefined();
      expect(summary!.total_tasks).toBe(3);
      expect(summary!.completed).toBe(3);
    });
  });

  describe('parseTaskDetails', () => {
    it('解析 309 行归档文件返回 phases 和 tasks', () => {
      const phases = parseTaskDetails(archive1);
      expect(phases.length).toBe(5);
      const totalTasks = phases.reduce((s, p) => s + p.tasks.length, 0);
      expect(totalTasks).toBe(26); // 实际 XML 中有 26 个 task 元素（summary 中的 22 是旧数据）
    });

    it('解析 52 行归档文件返回 phases 和 tasks', () => {
      const phases = parseTaskDetails(archive2);
      expect(phases.length).toBe(1);
      expect(phases[0].tasks.length).toBe(3);
    });

    it('返回的 TaskDetail 不包含 dependencies 字段', () => {
      const phases = parseTaskDetails(archive1);
      for (const phase of phases) {
        for (const task of phase.tasks) {
          expect('dependencies' in task).toBe(false);
        }
      }
      const phases2 = parseTaskDetails(archive2);
      for (const phase of phases2) {
        for (const task of phase.tasks) {
          expect('dependencies' in task).toBe(false);
        }
      }
    });
  });
});

// --- 2. execution_mode 解析 ---

describe('execution_mode 解析', () => {
  it('getExecutionMode 返回 wave', () => {
    const p = createTempPlan(`<?xml version="1.0"?>
<plan><metadata><execution_mode>wave</execution_mode></metadata><phases></phases></plan>`);
    expect(getExecutionMode(p)).toBe('wave');
  });

  it('getExecutionMode 返回 sequential', () => {
    const p = createTempPlan(`<?xml version="1.0"?>
<plan><metadata><execution_mode>sequential</execution_mode></metadata><phases></phases></plan>`);
    expect(getExecutionMode(p)).toBe('sequential');
  });

  it('不含 execution_mode 时默认 sequential', () => {
    const p = createTempPlan(`<?xml version="1.0"?>
<plan><metadata></metadata><phases></phases></plan>`);
    expect(getExecutionMode(p)).toBe('sequential');
  });

  it('parsePlanSummary 返回正确的 execution_mode', () => {
    const p = createTempPlan(`<?xml version="1.0"?>
<plan>
  <metadata><execution_mode>wave</execution_mode></metadata>
  <phases>
    <phase id="P1" name="测试">
      <goal>g</goal>
      <tasks>
        <task id="T1.1" name="t" status="TODO" priority="P0">desc</task>
      </tasks>
    </phase>
  </phases>
</plan>`);
    const summary = parsePlanSummary(p);
    expect(summary).toBeDefined();
    expect(summary!.execution_mode).toBe('wave');
  });
});

// --- 3. wave 属性解析 ---

describe('wave 属性解析', () => {
  it('task 的 wave 属性被正确解析', () => {
    const p = createTempPlan(`<?xml version="1.0"?>
<plan>
  <phases>
    <phase id="P1" name="测试阶段">
      <goal>测试</goal>
      <tasks>
        <task id="T1.1" name="测试任务" status="TODO" priority="P0" wave="WAVE-P1-01">
          描述
          <acceptance_criteria>
            <criterion id="T1.1-AC1" checked="false">标准</criterion>
          </acceptance_criteria>
        </task>
      </tasks>
    </phase>
  </phases>
</plan>`);
    const phases = parseTaskDetails(p);
    expect(phases.length).toBe(1);
    expect(phases[0].tasks[0].wave).toBe('WAVE-P1-01');
  });

  it('优先解析 <description> 作为 task 描述（兼容旧文本描述）', () => {
    const p = createTempPlan(`<?xml version="1.0"?>
<plan>
  <phases>
    <phase id="P1" name="测试阶段">
      <goal>测试</goal>
      <tasks>
        <task id="T1.1" name="t1" status="TODO" priority="P0">
          旧文本描述
          <acceptance_criteria>
            <criterion id="T1.1-AC1" checked="false">x</criterion>
          </acceptance_criteria>
        </task>
        <task id="T1.2" name="t2" status="TODO" priority="P0">
          <description>新描述</description>
          <acceptance_criteria>
            <criterion id="T1.2-AC1" checked="false">y</criterion>
          </acceptance_criteria>
        </task>
      </tasks>
    </phase>
  </phases>
</plan>`);

    const phases = parseTaskDetails(p);
    expect(phases.length).toBe(1);
    expect(phases[0].tasks.length).toBe(2);
    expect(phases[0].tasks[0].description).toBe('旧文本描述');
    expect(phases[0].tasks[1].description).toBe('新描述');
  });
});

// --- 4. waves DAG 解析 ---

describe('waves DAG 解析', () => {
  it('正确解析 waves 依赖关系', () => {
    const p = createTempPlan(`<?xml version="1.0"?>
<plan>
  <phases>
    <phase id="P1" name="测试阶段">
      <goal>测试</goal>
      <waves>
        <wave id="WAVE-P1-01" />
        <wave id="WAVE-P1-02" depends_on="WAVE-P1-01" />
        <wave id="WAVE-P1-03" depends_on="WAVE-P1-01,WAVE-P1-02" />
      </waves>
      <tasks>
        <task id="T1.1" name="t" status="TODO" priority="P0">d</task>
      </tasks>
    </phase>
  </phases>
</plan>`);
    const phases = parseTaskDetails(p);
    expect(phases[0].waves).toBeDefined();
    const waves = phases[0].waves!;
    expect(waves.length).toBe(3);

    expect(waves[0].id).toBe('WAVE-P1-01');
    expect(waves[0].depends_on).toEqual([]);

    expect(waves[1].id).toBe('WAVE-P1-02');
    expect(waves[1].depends_on).toEqual(['WAVE-P1-01']);

    expect(waves[2].id).toBe('WAVE-P1-03');
    expect(waves[2].depends_on).toEqual(['WAVE-P1-01', 'WAVE-P1-02']);
  });
});

// --- 5. context_files 解析 ---

describe('context_files 解析', () => {
  it('正确解析 context_files', () => {
    const p = createTempPlan(`<?xml version="1.0"?>
<plan>
  <phases>
    <phase id="P1" name="测试阶段">
      <goal>测试</goal>
      <context_files>
        <file>src/models/user.ts</file>
        <file>codument/tracks/my-track/spec.md</file>
      </context_files>
      <tasks>
        <task id="T1.1" name="t" status="TODO" priority="P0">d</task>
      </tasks>
    </phase>
  </phases>
</plan>`);
    const phases = parseTaskDetails(p);
    expect(phases[0].context_files).toEqual([
      'src/models/user.ts',
      'codument/tracks/my-track/spec.md',
    ]);
  });
});

// --- 6. subtask 递归嵌套 ---

describe('subtask 递归嵌套', () => {
  it('正确解析自闭合、嵌套和深层子任务', () => {
    const p = createTempPlan(`<?xml version="1.0"?>
<plan>
  <phases>
    <phase id="P1" name="测试阶段">
      <goal>测试</goal>
      <tasks>
        <task id="T1.1" name="主任务" status="TODO" priority="P0">
          描述
          <subtasks>
            <subtask id="T1.1.1" name="自闭合子任务" status="TODO" estimated_hours="2"/>
            <subtask id="T1.1.2" name="嵌套子任务" status="TODO" estimated_hours="3">
              <detail_ref>phases/P1/T1.1.2-detail.md</detail_ref>
              <subtasks>
                <subtask id="T1.1.2.1" name="深层子任务" status="TODO" estimated_hours="1"/>
              </subtasks>
            </subtask>
          </subtasks>
        </task>
      </tasks>
    </phase>
  </phases>
</plan>`);
    const phases = parseTaskDetails(p);
    const subtasks = phases[0].tasks[0].subtasks;
    expect(subtasks).toBeDefined();
    expect(subtasks!.length).toBe(2);

    // T1.1.1: 自闭合，无 children，无 detail_ref
    const st1 = subtasks![0];
    expect(st1.id).toBe('T1.1.1');
    expect(st1.name).toBe('自闭合子任务');
    expect(st1.estimated_hours).toBe(2);
    expect(st1.detail_ref).toBeUndefined();
    expect(st1.children).toBeUndefined();

    // T1.1.2: 有 detail_ref，有 children
    const st2 = subtasks![1];
    expect(st2.id).toBe('T1.1.2');
    expect(st2.name).toBe('嵌套子任务');
    expect(st2.estimated_hours).toBe(3);
    expect(st2.detail_ref).toBe('phases/P1/T1.1.2-detail.md');
    expect(st2.children).toBeDefined();
    expect(st2.children!.length).toBe(1);

    // T1.1.2.1: 深层自闭合
    const st2_1 = st2.children![0];
    expect(st2_1.id).toBe('T1.1.2.1');
    expect(st2_1.name).toBe('深层子任务');
    expect(st2_1.estimated_hours).toBe(1);
    expect(st2_1.children).toBeUndefined();
  });
});

// --- 7. task 属性顺序无关 ---

describe('task 属性顺序无关', () => {
  it('属性顺序不同仍能正确解析', () => {
    const p = createTempPlan(`<?xml version="1.0"?>
<plan>
  <phases>
    <phase id="P1" name="测试阶段">
      <goal>测试</goal>
      <tasks>
        <task status="TODO" id="T1.1" priority="P0" name="顺序不同" estimated_days="2">
          描述
        </task>
      </tasks>
    </phase>
  </phases>
</plan>`);
    const phases = parseTaskDetails(p);
    const task = phases[0].tasks[0];
    expect(task.id).toBe('T1.1');
    expect(task.name).toBe('顺序不同');
    expect(task.status).toBe('TODO');
    expect(task.priority).toBe('P0');
    expect(task.estimated_days).toBe(2);
  });
});

// --- 8. parsePlanSummary subtask 计数 ---

describe('parsePlanSummary subtask 计数', () => {
  it('同时计数自闭合和开闭标签的 subtask', () => {
    const p = createTempPlan(`<?xml version="1.0"?>
<plan>
  <phases>
    <phase id="P1" name="测试阶段">
      <goal>测试</goal>
      <tasks>
        <task id="T1.1" name="t1" status="TODO" priority="P0">
          d
          <subtasks>
            <subtask id="T1.1.1" name="自闭合" status="TODO" estimated_hours="1"/>
            <subtask id="T1.1.2" name="开闭" status="DONE" estimated_hours="2">
              <detail_ref>ref.md</detail_ref>
            </subtask>
            <subtask id="T1.1.3" name="另一个自闭合" status="IN_PROGRESS" estimated_hours="1"/>
          </subtasks>
        </task>
      </tasks>
    </phase>
  </phases>
</plan>`);
    const summary = parsePlanSummary(p);
    expect(summary).toBeDefined();
    expect(summary!.total_subtasks).toBe(3);
    expect(summary!.total_tasks).toBe(1);
    expect(summary!.total_phases).toBe(1);
  });
});

// --- 9. 集成测试：向后兼容性 ---

describe('集成测试：向后兼容性', () => {
  const archive1 = path.resolve(__dirname, 'fixtures/legacy-plan-with-deps-309.xml');
  const archive2 = path.resolve(__dirname, 'fixtures/legacy-plan-with-deps-52.xml');

  it('归档文件包含 <dependencies> 标签但解析不报错', () => {
    const content1 = fs.readFileSync(archive1, 'utf-8');
    const content2 = fs.readFileSync(archive2, 'utf-8');
    // Verify the archives actually contain <dependencies> tags
    expect(content1).toContain('<dependencies>');
    expect(content2).toContain('<dependencies>');

    // Verify parsing succeeds despite <dependencies>
    const phases1 = parseTaskDetails(archive1);
    const phases2 = parseTaskDetails(archive2);
    expect(phases1.length).toBeGreaterThan(0);
    expect(phases2.length).toBeGreaterThan(0);
  });

  it('归档文件的 execution_mode 默认为 sequential', () => {
    expect(getExecutionMode(archive1)).toBe('sequential');
    expect(getExecutionMode(archive2)).toBe('sequential');
  });

  it('归档文件的 waves 和 context_files 为 undefined', () => {
    const phases1 = parseTaskDetails(archive1);
    const phases2 = parseTaskDetails(archive2);
    for (const phase of [...phases1, ...phases2]) {
      expect(phase.waves).toBeUndefined();
      expect(phase.context_files).toBeUndefined();
    }
  });

  it('归档文件的 task 无 wave 属性', () => {
    const phases1 = parseTaskDetails(archive1);
    const phases2 = parseTaskDetails(archive2);
    for (const phase of [...phases1, ...phases2]) {
      for (const task of phase.tasks) {
        expect(task.wave).toBeUndefined();
      }
    }
  });
});

// --- 10. 集成测试：完整波次 plan 端到端解析 ---

describe('集成测试：完整波次 plan 端到端', () => {
  it('解析包含所有新特性的完整 plan.xml', () => {
    const p = createTempPlan(`<?xml version="1.0" encoding="UTF-8"?>
<plan>
  <metadata>
    <track_id>test-wave-feature</track_id>
    <track_name>测试波次功能</track_name>
    <goal>端到端验证</goal>
    <created_at>2026-03-01</created_at>
    <status>new</status>
    <commit_mode>auto</commit_mode>
    <execution_mode>wave</execution_mode>
  </metadata>

  <phases>
    <phase id="P1" name="基础设施">
      <goal>搭建基础架构</goal>
      <context_files>
        <file>src/core/index.ts</file>
        <file>src/models/user.ts</file>
      </context_files>
      <waves>
        <wave id="WAVE-P1-01" depends_on=""/>
        <wave id="WAVE-P1-02" depends_on="WAVE-P1-01"/>
        <wave id="WAVE-P1-03" depends_on="WAVE-P1-01,WAVE-P1-02"/>
      </waves>
      <tasks>
        <task id="T1.1" name="创建数据模型" status="DONE" priority="P0" wave="WAVE-P1-01">
          定义模型结构
          <subtasks>
            <subtask id="T1.1.1" name="定义接口" status="DONE"/>
            <subtask id="T1.1.2" name="实现验证" status="DONE">
              <detail_ref>phases/P1/T1.1.2-detail.md</detail_ref>
              <subtasks>
                <subtask id="T1.1.2.1" name="字段验证" status="DONE"/>
                <subtask id="T1.1.2.2" name="关系验证" status="DONE"/>
              </subtasks>
            </subtask>
          </subtasks>
          <acceptance_criteria>
            <criterion id="T1.1-AC1" checked="true">模型定义完成</criterion>
          </acceptance_criteria>
        </task>
        <task id="T1.2" name="创建 API 路由" status="IN_PROGRESS" priority="P0" wave="WAVE-P1-02">
          实现 REST API
        </task>
        <task id="T1.3" name="集成测试" status="TODO" priority="P1" wave="WAVE-P1-03">
          编写集成测试
        </task>
      </tasks>
      <gate_criteria>
        <criterion>所有 P0 任务完成</criterion>
        <criterion>测试覆盖率 >80%</criterion>
      </gate_criteria>
    </phase>

    <phase id="P2" name="前端集成">
      <goal>前端页面开发</goal>
      <waves>
        <wave id="WAVE-P2-01" depends_on=""/>
      </waves>
      <tasks>
        <task id="T2.1" name="创建页面组件" status="TODO" priority="P0" wave="WAVE-P2-01">
          实现用户界面
        </task>
      </tasks>
    </phase>
  </phases>

  <summary>
    <total_phases>2</total_phases>
    <total_tasks>4</total_tasks>
    <total_subtasks>4</total_subtasks>
    <total_estimated_days>0</total_estimated_days>
    <completed>1</completed>
    <in_progress>1</in_progress>
    <todo>2</todo>
    <blocked>0</blocked>
  </summary>
</plan>`);

    // Summary
    const summary = parsePlanSummary(p);
    expect(summary).toBeDefined();
    expect(summary!.execution_mode).toBe('wave');
    expect(summary!.commit_mode).toBe('auto');
    expect(summary!.total_phases).toBe(2);
    expect(summary!.total_tasks).toBe(4);
    expect(summary!.completed).toBe(1);
    expect(summary!.in_progress).toBe(1);
    expect(summary!.todo).toBe(2);

    // Phases
    const phases = parseTaskDetails(p);
    expect(phases.length).toBe(2);

    // P1
    const p1 = phases[0];
    expect(p1.id).toBe('P1');
    expect(p1.context_files).toEqual(['src/core/index.ts', 'src/models/user.ts']);
    expect(p1.waves!.length).toBe(3);
    expect(p1.waves![2].depends_on).toEqual(['WAVE-P1-01', 'WAVE-P1-02']);
    expect(p1.gate_criteria).toEqual(['所有 P0 任务完成', '测试覆盖率 >80%']);
    expect(p1.tasks.length).toBe(3);

    // T1.1 — wave, subtasks with nesting
    const t11 = p1.tasks[0];
    expect(t11.wave).toBe('WAVE-P1-01');
    expect(t11.status).toBe('DONE');
    expect(t11.subtasks!.length).toBe(2);
    expect(t11.subtasks![1].detail_ref).toBe('phases/P1/T1.1.2-detail.md');
    expect(t11.subtasks![1].children!.length).toBe(2);
    expect(t11.acceptance_criteria!.length).toBe(1);
    expect(t11.acceptance_criteria![0].checked).toBe(true);

    // T1.2 — IN_PROGRESS
    expect(p1.tasks[1].wave).toBe('WAVE-P1-02');
    expect(p1.tasks[1].status).toBe('IN_PROGRESS');

    // P2
    const p2 = phases[1];
    expect(p2.waves!.length).toBe(1);
    expect(p2.waves![0].id).toBe('WAVE-P2-01');
    expect(p2.tasks.length).toBe(1);
  });
});

// --- 11. track 状态读取：以 track.xml 为准 ---

describe('track 状态读取', () => {
  it('getTrack 以 track.xml Metadata.Status 为准', () => {
    const ws = createTempWorkspaceTrack('status-override', 'new', 'completed');
    setWorkspaceDir(ws);

    const track = getTrack('status-override');
    expect(track).toBeDefined();
    expect(track).not.toBeNull();
    expect(track!.metadata.status).toBe('completed');
  });

  it('getTracks 以 track.xml Metadata.Status 为准', () => {
    const ws = createTempWorkspaceTrack('status-override-list', 'new', 'in_progress');
    setWorkspaceDir(ws);

    const tracks = getTracks();
    const target = tracks.find((t) => t.id === 'status-override-list');
    expect(target).toBeDefined();
    expect(target!.metadata.status).toBe('in_progress');
  });

  it('getTrack 不需要 metadata.json 或 plan.xml', () => {
    const ws = createTempWorkspaceTrack('plan-only', 'new', 'in_progress');
    setWorkspaceDir(ws);

    const track = getTrack('plan-only');
    expect(track).toBeDefined();
    expect(track!.metadata.type).toBe('feature');
    expect(track!.metadata.description).toBe('test track');
    expect(track!.metadata.status).toBe('in_progress');
  });

  it('getTrack reads optional metadata fields directly from track.xml', () => {
    const ws = createTempWorkspaceTrack('track-metadata', 'cancelled', 'completed');
    setWorkspaceDir(ws);

    const track = getTrack('track-metadata');
    expect(track).toBeDefined();
    expect(track!.metadata.type).toBe('feature');
    expect(track!.metadata.description).toBe('test track');
    expect(track!.metadata.status).toBe('completed');
    expect(track!.metadata.updated_at).toBe('2026-03-01T00:00:00Z');
  });

  it('getTrack description falls back to Metadata.Goal and ignores task descriptions', () => {
    const ws = createTempWorkspaceTrack('track-description-fallback', 'new', 'new');
    const trackPath = path.join(ws, 'codument', 'tracks', 'active', 'track-description-fallback', 'track.xml');
    let content = fs.readFileSync(trackPath, 'utf-8');
    content = content.replace(/\n    <Description>test track<\/Description>/, '');
    content = content.replace(
      '<Task id="T1.1" name="t" status="DONE" priority="P0" />',
      '<Task id="T1.1" name="t" status="DONE" priority="P0"><Description>task description</Description></Task>',
    );
    fs.writeFileSync(trackPath, content, 'utf-8');
    setWorkspaceDir(ws);

    const track = getTrack('track-description-fallback');
    expect(track).toBeDefined();
    expect(track!.metadata.description).toBe('g');
  });

  it('getTrackIds returns track.xml tracks even when XML is not a readable Track', () => {
    const ws = createTempWorkspaceTrack('invalid-metadata', 'new', 'new');
    const trackPath = path.join(ws, 'codument', 'tracks', 'active', 'invalid-metadata', 'track.xml');
    fs.writeFileSync(trackPath, '<not-a-track />');
    setWorkspaceDir(ws);

    expect(getTrack('invalid-metadata')).toBeNull();
    expect(getTracks().map(track => track.id)).not.toContain('invalid-metadata');
    expect(getTrackIds()).toContain('invalid-metadata');
  });
});
