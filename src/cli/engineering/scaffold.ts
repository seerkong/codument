/**
 * Engineering delta scaffold: generates valid XNL node skeletons for long-lived
 * engineering knowledge kinds (rule / howto / reference / code-map / overview),
 * following engineering-node-schema required blocks.
 */

export interface ScaffoldOptions {
  plane: string;
  category: string;
  topic: string;
}

function id(name: string, plane: string, category: string, topic: string): string {
  return `#${plane}.${category}.${topic}.${name}`;
}

export function scaffoldEngineeringDelta(kind: string, name: string, opts: ScaffoldOptions): string {
  const nodeId = id(name, opts.plane, opts.category, opts.topic);
  const header = `<${kind} ${nodeId} { kind = "${kind}" } (`;
  switch (kind) {
    case 'rule':
      return ruleTemplate(header, name);
    case 'howto':
      return howtoTemplate(header, name);
    case 'reference':
      return referenceTemplate(header, name);
    case 'code-map':
      return codeMapTemplate(header, name);
    case 'overview':
      return overviewTemplate(header, name);
    default:
      throw new Error(`engineering scaffold: unsupported kind '${kind}' (rule|howto|reference|code-map|overview)`);
  }
}

function ruleTemplate(header: string, name: string): string {
  return `${header}
  <desc ?>TODO: 描述 ${name} 规则。</?>
  <rule ?>TODO: 规则正文。</?>
  <rationale ?>TODO: 为什么这条规则存在。</?>
  <enforcement ?>TODO: 如何强制/验证。</?>
)>\n`;
}

function howtoTemplate(header: string, name: string): string {
  return `${header}
  <when-to-use ?>TODO: 何时使用此 howto。</?>
  <steps ?m>
  1. TODO: 步骤一。
  2. TODO: 步骤二。
  </?m>
  <verification ?>TODO: 如何验证完成。</?>
)>\n`;
}

function referenceTemplate(header: string, name: string): string {
  return `${header}
  <scope ?>TODO: 本 reference 覆盖范围。</?>
  <source-of-truth ?>TODO: 真源位置。</?>
  <update-procedure ?>TODO: 更新步骤。</?>
)>\n`;
}

function codeMapTemplate(header: string, name: string): string {
  return `${header}
  <scope ?>TODO: 本 code-map 覆盖范围。</?>
  <paths ?m>
  TODO: 路径与职责映射
  </?m>
  <update-procedure ?>TODO: 更新步骤。</?>
)>\n`;
}

function overviewTemplate(header: string, name: string): string {
  return `${header}
  <desc ?>TODO: 描述 ${name} 概览。</?>
  <mental-model ?>TODO: 心智模型。</?>
)>\n`;
}
