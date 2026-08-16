import { describe, expect, it } from 'bun:test';
import { parseXnl } from 'xnl-core';
import { convertLegacyBehaviorNode, parseBehaviorXnlContent, serializeBehaviorNode } from '../../../src/cli/behavior/resource';
import { parseSpecXmlContent } from '../../../src/cli/utils/spec-xml';

const XML = `<behaviors capability="orders" version="1">
  <Metadata><ApiVersion>codument.tech/v1alpha1</ApiVersion></Metadata>
  <requirement id="place-order">
    <statement>系统 SHALL 创建订单。</statement>
    <suite id="placement" name="place order">
      <case id="accepts-valid-order">
        <given>请求有效。</given>
        <when>提交订单。</when>
        <then>订单被创建。</then>
        <and>返回订单 id。</and>
        <and>记录创建事件。</and>
      </case>
      <suite id="nested"><case id="nested-case"><then>仍然可嵌套。</then></case></suite>
    </suite>
  </requirement>
</behaviors>`;

describe('Behavior XNL resource codec', () => {
  it('converts XML hierarchy into canonical plural XNL collections', () => {
    const xnl = convertLegacyBehaviorNode(parseSpecXmlContent(XML), 'codument.tech/v1alpha1');
    const parsed = parseXnl(xnl, { textBlockStyle: true });

    expect(parsed.warnings).toEqual([]);
    expect(xnl).toContain('<Behavior #orders apiVersion="codument.tech/v1alpha1" version="1"');
    expect(xnl).toContain('<Requirements [');
    expect(xnl).toContain('<Suites [');
    expect(xnl).toContain('<Cases [');
    expect(xnl).toContain('<Ands [');
  });

  it('round-trips the selector-facing behavior model', () => {
    const converted = convertLegacyBehaviorNode(parseSpecXmlContent(XML), 'codument.tech/v1alpha1');
    const model = parseBehaviorXnlContent(converted);
    const reparsed = parseBehaviorXnlContent(serializeBehaviorNode(model));

    expect(reparsed).toEqual(model);
    expect(model.attrs).toMatchObject({ capability: 'orders', version: '1', apiVersion: 'codument.tech/v1alpha1' });
    expect(model.children[0].children.map((child) => child.tag)).toEqual(['statement', 'suite']);
    const suite = model.children[0].children.find((child) => child.tag === 'suite');
    const scenario = suite?.children.find((child) => child.tag === 'case');
    expect(scenario?.children.filter((child) => child.tag === 'and')).toHaveLength(2);
  });

  it('preserves legacy ids that are not valid XNL word identities as attributes', () => {
    const xml = `<behaviors capability="localized"><requirement id="项目初始化命令"><statement>保持原始 id。</statement></requirement></behaviors>`;
    const converted = convertLegacyBehaviorNode(parseSpecXmlContent(xml), 'codument.tech/v1alpha1');
    const model = parseBehaviorXnlContent(converted);

    expect(parseXnl(converted, { textBlockStyle: true }).warnings).toEqual([]);
    expect(converted).toContain('<Requirement { id = "项目初始化命令" }');
    expect(model.children[0].attrs.id).toBe('项目初始化命令');
  });
});
