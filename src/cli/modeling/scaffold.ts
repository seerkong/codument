/**
 * Modeling delta scaffold: generates a valid XNL node skeleton for common kinds
 * (entity / state-machine / module), so agents fill in business content instead
 * of hand-writing XNL structure that frequently trips id-context or schema rules.
 */

export interface ScaffoldOptions {
  plane: string;
  context: string;
  fields?: string[];
  states?: string[];
}

function id(name: string, plane: string, context: string): string {
  return `#${plane}.${context}.${name}`;
}

/** Parse 'name:type,name2:type2' into an interface field list. */
function parseFields(fields: string[]): string[] {
  return fields
    .filter((f) => f && f.includes(':'))
    .map((f) => {
      const [name, type] = f.split(':');
      return `    ${name}: ${type}`;
    });
}

export function scaffoldModelingDelta(kind: string, name: string, opts: ScaffoldOptions): string {
  const nodeId = id(name, opts.plane, opts.context);
  const header = `<object ${nodeId} {`;
  switch (kind) {
    case 'entity':
      return entityTemplate(header, name, opts);
    case 'object':
      return objectTemplate(header, name, opts);
    case 'state-machine':
      return stateMachineTemplate(nodeId, name, opts);
    case 'enum':
      return enumTemplate(nodeId, name, opts);
    case 'module':
      return moduleTemplate(nodeId, name, opts);
    default:
      throw new Error(`modeling scaffold: unsupported kind '${kind}' (entity|object|state-machine|enum|module)`);
  }
}

function entityTemplate(header: string, name: string, opts: ScaffoldOptions): string {
  const fields = parseFields(opts.fields ?? []);
  const fieldsBlock = fields.length > 0 ? fields.join('\n') : '    // TODO: add fields';
  return `${header} kind = "entity" fact_grade = "authoritative_fact" single_writer = "modeling://${opts.plane}/${opts.context}/${name}_store" } (
  <desc ?>TODO: 描述 ${name} 实体的职责和不变量。</?>
  <types ?ts>
  interface ${capitalize(name)} {
${fieldsBlock}
  }
  </?ts>
  <invariants ?>TODO: 描述不变量。</?>
  <fact-source ?>TODO: 描述唯一写入者。</?>
)>\n`;
}

function objectTemplate(header: string, name: string, opts: ScaffoldOptions): string {
  const fields = parseFields(opts.fields ?? []);
  const fieldsBlock = fields.length > 0 ? fields.join('\n') : '    // TODO: add fields';
  return `${header} kind = "object" } (
  <desc ?>TODO: 描述 ${name} 对象的职责。</?>
  <types ?ts>
  interface ${capitalize(name)} {
${fieldsBlock}
  }
  </?ts>
  <invariants ?>TODO: 描述不变量。</?>
)>\n`;
}

function stateMachineTemplate(nodeId: string, name: string, opts: ScaffoldOptions): string {
  const states = opts.states ?? [];
  const transitions = states.length >= 2
    ? states.slice(0, -1).map((s, i) => `    ${s} --> ${states[i + 1]}: next`).join('\n')
    : '    // TODO: add transitions';
  const declared = states.length > 0 ? states.map((s) => `    state ${s}`).join('\n') : '';
  return `<state-machine ${nodeId} { kind = "state-machine" } (
  <desc ?>TODO: 描述 ${name} 状态机。</?>
  <mermaid ?m>
  stateDiagram-v2
${declared}
${transitions}
  </?m>
)>\n`;
}

function enumTemplate(nodeId: string, name: string, opts: ScaffoldOptions): string {
  const values = opts.states ?? [];
  const valuesBlock = values.length > 0 ? values.map((v) => `    ${v} = "${v}"`).join('\n') : '    // TODO: add enum values';
  return `<object ${nodeId} { kind = "enum" } (
  <desc ?>TODO: 描述 ${name} 枚举。</?>
  <types ?ts>
  enum ${capitalize(name)} {
${valuesBlock}
  }
  </?ts>
)>\n`;
}

function moduleTemplate(nodeId: string, name: string, opts: ScaffoldOptions): string {
  return `<module ${nodeId} { kind = "module" depends_on = [] } (
  <desc ?>TODO: 描述 ${name} 模块职责与写入边界。</?>
  <capsule-tree ?ct>
  TODO: 模块目录树
  </?ct>
)>\n`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
