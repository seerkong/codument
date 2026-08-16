import { describe, expect, it } from 'bun:test';
import { parseXnl } from 'xnl-core';
import {
  behaviorPatchResourceId,
  behaviorPatchSkeleton,
  convertLegacyBehaviorPatchNode,
  parseBehaviorPatchXnlContent,
  serializeBehaviorPatchNode,
} from '../../../src/cli/behavior/patch-resource';
import { parseSpecXmlContent } from '../../../src/cli/utils/spec-xml';

const XML = `<behavior-patch capability="orders" version="1">
  <upsert selector="behavior://orders/requirements/place-order">
    <requirement id="place-order"><statement>系统 SHALL 创建订单。</statement></requirement>
  </upsert>
  <delete selector="behavior://orders/requirements/obsolete" />
  <move selector="behavior://orders/requirements/place-order" to="behavior://checkout/requirements/place-order" />
</behavior-patch>`;

describe('BehaviorPatch XNL resource codec', () => {
  it('maps mutations to a collection and singleton upsert target to extend', () => {
    const xnl = convertLegacyBehaviorPatchNode(
      parseSpecXmlContent(XML),
      'codument.tech/v1alpha1',
      behaviorPatchResourceId('add-orders', 'orders'),
    );

    expect(parseXnl(xnl, { textBlockStyle: true }).warnings).toEqual([]);
    expect(xnl).toContain('<BehaviorPatch #track.add-orders.behavior_patch.orders apiVersion="codument.tech/v1alpha1"');
    expect(xnl).toContain('<Mutations [');
    expect(xnl).toContain('<Upsert { selector = "behavior://orders/requirements/place-order" } (');
    expect(xnl).toContain('<Requirement #place-order');
    expect(xnl).toContain('<Delete { selector = "behavior://orders/requirements/obsolete" }>');
  });

  it('round-trips the selector-facing patch model', () => {
    const converted = convertLegacyBehaviorPatchNode(
      parseSpecXmlContent(XML),
      'codument.tech/v1alpha1',
      behaviorPatchResourceId('add-orders', 'orders'),
    );
    const model = parseBehaviorPatchXnlContent(converted);
    const reparsed = parseBehaviorPatchXnlContent(serializeBehaviorPatchNode(
      model,
      model.attrs.resourceId,
      model.attrs.apiVersion,
    ));

    expect(reparsed).toEqual(model);
    expect(model.children.map((child) => child.tag)).toEqual(['upsert', 'delete', 'move']);
    expect(model.children[0].children[0].attrs.id).toBe('place-order');
  });

  it('scaffolds the current version without inventing behavior content', () => {
    const skeleton = behaviorPatchSkeleton('add-orders', 'orders', 'codument.tech/v1alpha1');
    expect(skeleton).toContain('<Mutations []>');
    expect(parseBehaviorPatchXnlContent(skeleton).children).toEqual([]);
  });
});
