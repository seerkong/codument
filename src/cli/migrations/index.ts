import * as fs from 'fs';
import * as path from 'path';
import { parseXnl, type DataElementNode, type TextElementNode, type XnlNode } from 'xnl-core';
import { CODUMENT_API_VERSION, getKindDefinition } from '../kinds/registry';
import { serializeXnlFile } from '../xnl/registry';
import { parseSpecXmlContent, type SpecXmlNode } from '../utils/spec-xml';
import { convertLegacyTrackXml, parseTrackResourceContent } from '../track/resource';
import { convertLegacyMissionXml, parseMissionResourceContent } from '../mission/resource';
import { configTargetPath, convertLegacyConfigXml } from '../config/resource';
import { convertLegacyBehaviorNode } from '../behavior/resource';
import { behaviorPatchResourceId, convertLegacyBehaviorPatchNode } from '../behavior/patch-resource';

export type ResourceFormat = 'xml' | 'xnl' | 'markdown';
export type MigrationPlanStatus = 'planned' | 'noop' | 'review-required';
export type MigrationApplyStatus = 'applied' | 'removed' | 'noop' | 'review-required';

export interface ResourceInspection {
  path: string;
  format?: ResourceFormat;
  kinds: string[];
  apiVersions: string[];
  fingerprint?: string;
  diagnostics: string[];
  emptyDecisionForest?: boolean;
  rootCount?: number;
  versionedRoots?: number;
  targetKind?: string;
  suggestedTarget?: string;
  ownerlessDurableDecisions?: string[];
}

export interface ResourceMigrationPlan extends ResourceInspection {
  status: MigrationPlanStatus;
  targetApiVersion: string;
  migrationId?: string;
  operation?: 'add-api-version' | 'remove-empty-decision-file' | 'convert-track-to-xnl' | 'convert-mission-to-xnl' | 'convert-config-to-xnl' | 'convert-behavior-to-xnl' | 'convert-behavior-patch-to-xnl' | 'unwrap-decision-tree';
}

export interface ResourceMigrationResult {
  path: string;
  targetPath?: string;
  status: MigrationApplyStatus;
  targetApiVersion: string;
  diagnostics: string[];
  backupPath?: string;
  detectedKind?: string;
  targetKind?: string;
  suggestedTarget?: string;
}

export type ResourceUpgradeStatus = 'upgraded' | 'noop' | 'review-required' | 'blocked';

export interface ResourceUpgradeResult {
  path: string;
  status: ResourceUpgradeStatus;
  detectedFormat?: ResourceFormat;
  detectedKind?: string;
  targetKind?: string;
  targetApiVersion: string;
  suggestedTarget?: string;
  targetPath?: string;
  backupPath?: string;
  diagnostics: string[];
  semanticReviewRecommended?: boolean;
}

export interface ResourceVerification {
  path: string;
  valid: boolean;
  diagnostics: string[];
}

export interface ApplyMigrationOptions {
  backupRoot?: string;
}

export interface WorkspaceMigrationResult {
  applied: number;
  removed: number;
  noop: number;
  reviewRequired: ResourceMigrationResult[];
  semanticReviewRecommended: ResourceMigrationResult[];
}

export interface ResourceMigrationDefinition {
  id: string;
  operation: NonNullable<ResourceMigrationPlan['operation']>;
  matches: (inspection: ResourceInspection) => boolean;
  transform?: (content: string, targetApiVersion: string, inspection: ResourceInspection) => string;
}

export const RESOURCE_MIGRATIONS: readonly ResourceMigrationDefinition[] = Object.freeze([
  {
    id: 'xml.track.to-xnl',
    operation: 'convert-track-to-xnl',
    matches: (inspection) => inspection.format === 'xml' && inspection.kinds.length === 1
      && inspection.kinds[0] === 'Track' && path.basename(inspection.path) === 'track.xml',
    transform: (content, targetApiVersion) => convertLegacyTrackXml(content, targetApiVersion),
  },
  {
    id: 'xml.mission.to-xnl',
    operation: 'convert-mission-to-xnl',
    matches: (inspection) => inspection.format === 'xml' && inspection.kinds.length === 1
      && inspection.kinds[0] === 'Mission' && path.basename(inspection.path) === 'mission.xml',
    transform: (content, targetApiVersion) => convertLegacyMissionXml(content, targetApiVersion),
  },
  {
    id: 'xml.config.to-xnl',
    operation: 'convert-config-to-xnl',
    matches: (inspection) => inspection.format === 'xml' && inspection.kinds.length === 1
      && ['ActionHooks', 'OperationHooks', 'AttractorProfiles', 'Modeling', 'Engineering'].includes(inspection.kinds[0])
      && configTargetPath(inspection.path) !== undefined,
    transform: (content, targetApiVersion) => convertLegacyConfigXml(content, targetApiVersion),
  },
  {
    id: 'xml.behavior.to-xnl',
    operation: 'convert-behavior-to-xnl',
    matches: (inspection) => inspection.format === 'xml' && inspection.kinds.length === 1
      && inspection.kinds[0] === 'behaviors'
      && ['behaviors', 'specs'].includes(path.basename(path.dirname(inspection.path))),
    transform: (content, targetApiVersion) => convertLegacyBehaviorNode(
      parseSpecXmlContent(content),
      targetApiVersion,
    ),
  },
  {
    id: 'xml.behavior-patch.to-xnl',
    operation: 'convert-behavior-patch-to-xnl',
    matches: (inspection) => inspection.format === 'xml' && inspection.kinds.length === 1
      && inspection.kinds[0] === 'behavior-patch'
      && behaviorPatchOwner(inspection.path) !== undefined,
    transform: (content, targetApiVersion, inspection) => {
      const root = parseSpecXmlContent(content);
      const owner = behaviorPatchOwner(inspection.path);
      if (!owner) throw new Error('BehaviorPatch must be located below a track behavior_deltas directory.');
      const capability = root.attrs.capability || owner.capability;
      return convertLegacyBehaviorPatchNode(
        root,
        targetApiVersion,
        behaviorPatchResourceId(owner.trackId, capability),
      );
    },
  },
  {
    id: 'xnl.decision-tree.unwrap',
    operation: 'unwrap-decision-tree',
    matches: (inspection) => inspection.format === 'xnl'
      && inspection.kinds.includes('decision-tree')
      && inspection.kinds.every((kind) => kind === 'decision' || kind === 'decision-tree'),
    transform: unwrapLegacyDecisionTrees,
  },
  {
    id: 'xnl.empty-decision-forest.remove',
    operation: 'remove-empty-decision-file',
    matches: (inspection) => inspection.format === 'xnl' && inspection.emptyDecisionForest === true,
  },
  {
    id: 'xml.unversioned.add-api-version',
    operation: 'add-api-version',
    matches: (inspection) => inspection.format === 'xml' && (inspection.versionedRoots ?? 0) < versionedRootCount(inspection),
    transform: addXmlApiVersion,
  },
  {
    id: 'xnl.unversioned.add-api-version',
    operation: 'add-api-version',
    matches: (inspection) => inspection.format === 'xnl' && !inspection.emptyDecisionForest
      && (inspection.versionedRoots ?? 0) < versionedRootCount(inspection),
    transform: addXnlApiVersion,
  },
]);

export function inspectResource(file: string): ResourceInspection {
  const absolute = path.resolve(file);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    return { path: file, kinds: [], apiVersions: [], diagnostics: ['resource file does not exist'] };
  }
  const content = fs.readFileSync(absolute, 'utf8');
  return inspectContent(file, content);
}

export function planResourceMigration(file: string): ResourceMigrationPlan {
  const inspection = inspectResource(file);
  const contract = contractForInspection(inspection);
  const targetApiVersion = contract?.currentApiVersion ?? CODUMENT_API_VERSION;
  const supportedApiVersions: readonly string[] = contract?.supportedApiVersions ?? [targetApiVersion];
  const base = { ...inspection, targetApiVersion };
  if (inspection.diagnostics.length > 0 || !inspection.format) {
    return { ...base, status: 'review-required' };
  }
  if (inspection.format === 'markdown' && inspection.kinds.includes('decision')) {
    return {
      ...base,
      status: 'review-required',
      diagnostics: [
        'legacy Decision Markdown requires semantic AI review against the current Decision Kind',
        'preserve proven facts and raw provenance; do not invent missing options, hierarchy, or business ownership',
      ],
    };
  }
  if ((inspection.ownerlessDurableDecisions?.length ?? 0) > 0) {
    return {
      ...base,
      status: 'review-required',
      diagnostics: [
        `durable decisions require a business-semantic owner path under decisions/**: ${inspection.ownerlessDurableDecisions?.join(', ')}`,
        'move the decision forest with AI review; registry.xnl fallback is forbidden',
      ],
    };
  }
  const unsupported = inspection.apiVersions.filter((version) => !supportedApiVersions.includes(version));
  if (unsupported.length > 0) {
    return {
      ...base,
      status: 'review-required',
      diagnostics: [...inspection.diagnostics, `unsupported apiVersion: ${unsupported.join(', ')}`],
    };
  }
  const matching = RESOURCE_MIGRATIONS.filter((migration) => migration.matches(inspection));
  const structural = matching.filter((migration) => migration.operation !== 'add-api-version');
  const candidates = structural.length > 0 ? structural : matching;
  if (structural.length === 0 && (inspection.versionedRoots ?? 0) > 0 && inspection.versionedRoots === versionedRootCount(inspection)) {
    return { ...base, status: 'noop' };
  }
  if (candidates.length !== 1) {
    return {
      ...base,
      status: 'review-required',
      diagnostics: [
        ...inspection.diagnostics,
        candidates.length === 0
          ? `no deterministic migration matches fingerprint ${inspection.fingerprint ?? '(unknown)'}`
          : `multiple deterministic migrations match: ${candidates.map((candidate) => candidate.id).join(', ')}`,
      ],
    };
  }
  const migration = candidates[0];
  return { ...base, status: 'planned', migrationId: migration.id, operation: migration.operation };
}

export function applyResourceMigration(file: string, options: ApplyMigrationOptions = {}): ResourceMigrationResult {
  const plan = planResourceMigration(file);
  const base = {
    path: file,
    targetApiVersion: plan.targetApiVersion,
    diagnostics: plan.diagnostics,
    detectedKind: plan.kinds.join('+') || undefined,
    targetKind: plan.targetKind,
    suggestedTarget: plan.suggestedTarget,
  };
  if (plan.status === 'review-required') {
    const absolute = path.resolve(file);
    const backupPath = fs.existsSync(absolute) && fs.statSync(absolute).isFile()
      ? backupResource(absolute, options.backupRoot)
      : undefined;
    return { ...base, status: 'review-required', backupPath };
  }
  if (plan.status === 'noop') return { ...base, status: 'noop' };

  const absolute = path.resolve(file);
  const targetPath = plan.operation === 'convert-track-to-xnl'
    ? path.join(path.dirname(absolute), 'track.xnl')
    : plan.operation === 'convert-mission-to-xnl'
      ? path.join(path.dirname(absolute), 'mission.xnl')
      : plan.operation === 'convert-config-to-xnl'
        ? configTargetPath(absolute)
        : plan.operation === 'convert-behavior-to-xnl'
          ? behaviorTargetPath(absolute)
          : plan.operation === 'convert-behavior-patch-to-xnl'
            ? path.join(path.dirname(absolute), `${path.basename(absolute, '.xml')}.xnl`)
        : undefined;
  const backupPath = backupResource(absolute, options.backupRoot);
  if (targetPath && fs.existsSync(targetPath)) {
    return {
      ...base,
      status: 'review-required',
      targetPath,
      backupPath,
      diagnostics: [...plan.diagnostics, `target authority already exists: ${targetPath}`],
    };
  }
  const migration = RESOURCE_MIGRATIONS.find((candidate) => candidate.id === plan.migrationId);
  if (!migration) {
    return { ...base, status: 'review-required', diagnostics: [...plan.diagnostics, 'planned migration is not registered'], backupPath };
  }
  if (migration.operation === 'remove-empty-decision-file') {
    fs.rmSync(absolute);
    return { ...base, status: 'removed', backupPath };
  }

  const original = fs.readFileSync(absolute, 'utf8');
  let migrated: string;
  try {
    if (!migration.transform) throw new Error(`Migration ${migration.id} has no transform`);
    migrated = migration.transform(original, plan.targetApiVersion, plan);
  } catch (error) {
    return {
      ...base,
      status: 'review-required',
      diagnostics: [...plan.diagnostics, error instanceof Error ? error.message : String(error)],
      backupPath,
    };
  }

  if (migration.operation === 'convert-track-to-xnl') {
    try {
      parseTrackResourceContent(migrated, 'track.xnl');
    } catch (error) {
      return { ...base, status: 'review-required', targetPath, diagnostics: [...plan.diagnostics, message(error)], backupPath };
    }
  }
  if (migration.operation === 'convert-mission-to-xnl') {
    try {
      parseMissionResourceContent(migrated, 'mission.xnl');
    } catch (error) {
      return { ...base, status: 'review-required', targetPath, diagnostics: [...plan.diagnostics, message(error)], backupPath };
    }
  }
  const verificationPath = targetPath ?? file;
  const targetInspection = inspectContent(verificationPath, migrated);
  const verification = verificationFromInspection(targetInspection);
  if (!verification.valid) {
    return { ...base, status: 'review-required', targetPath, diagnostics: verification.diagnostics, backupPath };
  }
  const destination = targetPath ?? absolute;
  const temporary = `${destination}.codument-migrate-${process.pid}.tmp`;
  fs.writeFileSync(temporary, migrated, 'utf8');
  fs.renameSync(temporary, destination);
  if (targetPath) fs.rmSync(absolute);
  return { ...base, status: 'applied', targetPath, backupPath };
}

export function verifyResource(file: string): ResourceVerification {
  if (!fs.existsSync(path.resolve(file)) && path.basename(file).toLowerCase() === 'decisions.xnl') {
    return { path: file, valid: true, diagnostics: [] };
  }
  return verificationFromInspection(inspectResource(file));
}

export function migrateWorkspaceResources(root = 'codument', options: ApplyMigrationOptions = {}): WorkspaceMigrationResult {
  const result: WorkspaceMigrationResult = {
    applied: 0,
    removed: 0,
    noop: 0,
    reviewRequired: [],
    semanticReviewRecommended: [],
  };
  for (const file of discoverResourceFiles(root)) {
    const plan = planResourceMigration(file);
    const migration = applyResourceMigration(file, options);
    if (migration.status === 'applied') {
      result.applied++;
      if (plan.operation && plan.operation !== 'add-api-version') {
        result.semanticReviewRecommended.push(migration);
      }
    }
    else if (migration.status === 'removed') result.removed++;
    else if (migration.status === 'noop') result.noop++;
    else result.reviewRequired.push(migration);
  }
  return result;
}

export function upgradeResource(file: string, options: ApplyMigrationOptions = {}): ResourceUpgradeResult {
  const inspection = inspectResource(file);
  const plan = planResourceMigration(file);
  const migration = applyResourceMigration(file, options);
  const status: ResourceUpgradeStatus = migration.status === 'applied' || migration.status === 'removed'
    ? 'upgraded'
    : migration.status === 'noop'
      ? 'noop'
      : inspection.diagnostics.includes('resource file does not exist')
        ? 'blocked'
        : 'review-required';
  return {
    path: file,
    status,
    detectedFormat: inspection.format,
    detectedKind: migration.detectedKind,
    targetKind: migration.targetKind,
    targetApiVersion: migration.targetApiVersion,
    suggestedTarget: migration.suggestedTarget,
    targetPath: migration.targetPath,
    backupPath: migration.backupPath,
    diagnostics: migration.diagnostics,
    ...(migration.status === 'applied' && plan.operation && plan.operation !== 'add-api-version'
      ? { semanticReviewRecommended: true }
      : {}),
  };
}

function inspectContent(file: string, content: string): ResourceInspection {
  const extension = path.extname(file).toLowerCase();
  if (extension === '.xml') return inspectXml(file, content);
  if (extension === '.xnl') return inspectXnl(file, content);
  if (extension === '.md' && ['decision.md', 'decisions.md'].includes(path.basename(file).toLowerCase())) {
    return {
      path: file,
      format: 'markdown',
      kinds: ['decision'],
      apiVersions: [],
      fingerprint: 'markdown:decision:legacy',
      diagnostics: [],
      targetKind: 'decision',
      suggestedTarget: suggestedDecisionTarget(file),
    };
  }
  return { path: file, kinds: [], apiVersions: [], diagnostics: [`unsupported resource format: ${extension || '(none)'}`] };
}

function inspectXml(file: string, content: string): ResourceInspection {
  try {
    const root = parseSpecXmlContent(content);
    const metadata = root.children.find((child) => child.tag.toLowerCase() === 'metadata');
    const version = metadata?.children.find((child) => child.tag.toLowerCase() === 'apiversion')?.text?.trim();
    const targetKind = targetKindForXml(root.tag, file);
    return {
      path: file,
      format: 'xml',
      kinds: [root.tag],
      apiVersions: version ? [version] : [],
      fingerprint: `xml:${root.tag}:${version ? version : 'unversioned'}`,
      diagnostics: [],
      rootCount: 1,
      versionedRoots: version ? 1 : 0,
      targetKind,
      suggestedTarget: suggestedStructuredTarget(file, targetKind),
    };
  } catch (error) {
    return { path: file, format: 'xml', kinds: [], apiVersions: [], diagnostics: [message(error)] };
  }
}

function inspectXnl(file: string, content: string): ResourceInspection {
  try {
    const parsed = parseXnl(content, { textBlockStyle: true });
    const roots = parsed.nodes.filter(isElement);
    if (roots.length === 0) {
      if (path.basename(file).toLowerCase() === 'decisions.xnl') {
        return { path: file, format: 'xnl', kinds: ['DecisionForest'], apiVersions: [], fingerprint: 'xnl:DecisionForest:empty', diagnostics: [], emptyDecisionForest: true, rootCount: 0, versionedRoots: 0 };
      }
      return { path: file, format: 'xnl', kinds: [], apiVersions: [], diagnostics: ['XNL document has no top-level element'] };
    }
    const kinds = [...new Set(roots.map((root) => root.tag))];
    const versions = [...new Set(roots.map((root) => root.metadata.apiVersion).filter((value): value is string => typeof value === 'string'))];
    const versionedRoots = roots.filter((root) => typeof root.metadata.apiVersion === 'string').length;
    const shape = roots.length > 1 ? 'forest' : 'single';
    const ownerlessDurableDecisions = ownerlessDurableDecisionIds(file, roots);
    const targetKind = targetKindForXnl(kinds, file);
    return {
      path: file,
      format: 'xnl',
      kinds,
      apiVersions: versions,
      fingerprint: `xnl:${kinds.join('+')}:${shape}:${versions.length ? versions.join('+') : 'unversioned'}`,
      diagnostics: parsed.warnings?.map((warning) => warning.message) ?? [],
      rootCount: roots.length,
      versionedRoots,
      targetKind,
      suggestedTarget: suggestedStructuredTarget(file, targetKind),
      ...(ownerlessDurableDecisions.length > 0 ? { ownerlessDurableDecisions } : {}),
    };
  } catch (error) {
    return { path: file, format: 'xnl', kinds: [], apiVersions: [], diagnostics: [message(error)] };
  }
}

function verificationFromInspection(inspection: ResourceInspection): ResourceVerification {
  const diagnostics = [...inspection.diagnostics];
  const contract = contractForInspection(inspection);
  const expected = contract?.currentApiVersion ?? CODUMENT_API_VERSION;
  const supported: readonly string[] = contract?.supportedApiVersions ?? [expected];
  if (inspection.emptyDecisionForest) diagnostics.push('empty decisions.xnl must be removed');
  if (!inspection.format) diagnostics.push('resource format could not be determined');
  if (inspection.apiVersions.length === 0 && !inspection.emptyDecisionForest) diagnostics.push('apiVersion is missing');
  for (const version of inspection.apiVersions) {
    if (!supported.includes(version)) diagnostics.push(`apiVersion ${version} is not supported; expected ${expected}`);
  }
  if (inspection.format === 'xnl' && (inspection.versionedRoots ?? 0) < versionedRootCount(inspection)) {
    diagnostics.push('every top-level XNL element must declare apiVersion');
  }
  return { path: inspection.path, valid: diagnostics.length === 0, diagnostics };
}

function contractForInspection(inspection: Pick<ResourceInspection, 'kinds'>) {
  const contracts = inspection.kinds.map(getKindDefinition).filter((value) => value !== undefined);
  if (contracts.length !== inspection.kinds.length || contracts.length === 0) return undefined;
  const [first, ...rest] = contracts;
  if (rest.some((contract) => contract.currentApiVersion !== first.currentApiVersion)) return undefined;
  return first;
}

function versionedRootCount(inspection: ResourceInspection): number {
  return inspection.rootCount ?? 0;
}

function addXnlApiVersion(content: string, version: string): string {
  const parsed = parseXnl(content, { textBlockStyle: true });
  for (const node of parsed.nodes) {
    if (isElement(node)) node.metadata.apiVersion = version;
  }
  return serializeXnlFile(parsed.nodes);
}

function addXmlApiVersion(content: string, version: string): string {
  const root = parseSpecXmlContent(content);
  const metadata = root.children.find((child) => child.tag.toLowerCase() === 'metadata');
  const tokens = scanXmlElements(content);
  const rootToken = tokens.find((token) => !token.closing && token.depth === 0 && token.tag === root.tag);
  if (!rootToken) throw new Error('Unable to locate XML root token for format-preserving migration');
  if (metadata) {
    const metadataToken = tokens.find((token) => !token.closing && token.depth === 1 && token.tag === metadata.tag);
    if (!metadataToken) throw new Error('Unable to locate XML Metadata token');
    if (metadataToken.selfClosing) {
      const replacement = `<${metadata.tag}>\n    <ApiVersion>${version}</ApiVersion>\n  </${metadata.tag}>`;
      return content.slice(0, metadataToken.start) + replacement + content.slice(metadataToken.end);
    }
    return content.slice(0, metadataToken.end) + `\n    <ApiVersion>${version}</ApiVersion>` + content.slice(metadataToken.end);
  }
  const block = `\n  <Metadata>\n    <ApiVersion>${version}</ApiVersion>\n  </Metadata>`;
  if (rootToken.selfClosing) {
    const opened = rootToken.raw.replace(/\/\s*>$/, '>');
    return content.slice(0, rootToken.start) + opened + block + `\n</${root.tag}>` + content.slice(rootToken.end);
  }
  return content.slice(0, rootToken.end) + block + content.slice(rootToken.end);
}

interface XmlElementToken { start: number; end: number; raw: string; tag: string; depth: number; closing: boolean; selfClosing: boolean }
function scanXmlElements(content: string): XmlElementToken[] {
  const out: XmlElementToken[] = [];
  const tokenPattern = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[^>]+>/g;
  let depth = 0;
  for (const match of content.matchAll(tokenPattern)) {
    const raw = match[0];
    if (raw.startsWith('<!--') || raw.startsWith('<?') || raw.startsWith('<![CDATA[')) continue;
    const closing = raw.startsWith('</');
    const selfClosing = /\/\s*>$/.test(raw);
    if (closing) depth--;
    const inner = raw.slice(closing ? 2 : 1, selfClosing ? -2 : -1).trim();
    const tag = inner.split(/\s/, 1)[0];
    out.push({ start: match.index ?? 0, end: (match.index ?? 0) + raw.length, raw, tag, depth, closing, selfClosing });
    if (!closing && !selfClosing) depth++;
  }
  return out;
}

function backupResource(file: string, backupRoot?: string): string {
  const root = backupRoot ?? path.join('.tmp', 'codument', 'migrations', new Date().toISOString().replace(/[:.]/g, '-'));
  const relative = path.relative(process.cwd(), file);
  const safeRelative = relative.startsWith('..')
    ? path.join('external', file.replace(/[^A-Za-z0-9._-]+/g, '_'))
    : relative;
  const target = path.join(root, safeRelative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (!fs.existsSync(target)) fs.copyFileSync(file, target);
  return target;
}

function discoverResourceFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  const managedStdRoot = path.resolve(root, 'std');
  const workspaceManifest = path.resolve(root, 'manifest.xnl');
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === '.tmp' || entry.name === 'node_modules') continue;
      const target = path.join(directory, entry.name);
      if (entry.isDirectory() && path.resolve(target) !== managedStdRoot) visit(target);
      else if (entry.isFile() && path.resolve(target) !== workspaceManifest
        && (/\.(xml|xnl)$/i.test(entry.name) || ['decision.md', 'decisions.md'].includes(entry.name.toLowerCase()))) out.push(target);
    }
  };
  visit(root);
  return out.sort();
}

function unwrapLegacyDecisionTrees(content: string, version: string): string {
  const parsed = parseXnl(content, { textBlockStyle: true });
  const roots: XnlNode[] = [];
  for (const node of parsed.nodes) {
    if (!isDataElementNode(node) || node.tag !== 'decision-tree') {
      roots.push(node);
      continue;
    }
    if ((node.extend?.order.length ?? 0) > 0) {
      throw new Error('legacy <decision-tree> contains singleton semantics and requires AI review before unwrapping');
    }
    const children = node.body ?? [];
    if (children.some((child) => !isElement(child) || child.tag !== 'decision')) {
      throw new Error('legacy <decision-tree> body contains non-decision nodes and requires AI review');
    }
    for (const child of children) {
      if (isElement(child)) child.metadata.apiVersion = child.metadata.apiVersion ?? version;
      roots.push(child);
    }
  }
  return serializeXnlFile(roots);
}

function ownerlessDurableDecisionIds(file: string, roots: Array<DataElementNode | TextElementNode>): string[] {
  if (path.basename(file).toLowerCase() !== 'decisions.xnl') return [];
  const parent = path.basename(path.dirname(file));
  if (parent === 'decisions') return [];
  const ids: string[] = [];
  const visit = (node: XnlNode): void => {
    if (!isElement(node)) return;
    if (node.tag === 'decision') {
      const durable = node.attributes?.durable_candidate ?? node.attributes?.['durable-candidate'];
      if (durable === true || String(durable).toLowerCase() === 'true') {
        ids.push(wordToStringSafe(node));
      }
    }
    if (isDataElementNode(node)) {
      for (const child of node.body ?? []) visit(child);
    }
  };
  roots.forEach(visit);
  return ids.filter(Boolean);
}

function wordToStringSafe(node: DataElementNode | TextElementNode): string {
  if (!node.id) return '<missing-id>';
  return [...node.id.namespace, node.id.name].join('.');
}

function targetKindForXml(rootTag: string, file: string): string {
  if (rootTag === 'Track' || ['track.xml', 'plan.xml', 'tasks.xml'].includes(path.basename(file))) return 'Track';
  if (rootTag === 'Mission') return 'Mission';
  if (rootTag === 'behaviors') return 'Behavior';
  if (['behavior-patch', 'spec-patch'].includes(rootTag)) return 'BehaviorPatch';
  if (rootTag === 'ActionHooks' || rootTag === 'OperationHooks') return 'OperationHooks';
  return rootTag;
}

function targetKindForXnl(kinds: string[], file: string): string {
  if (kinds.every((kind) => kind === 'decision' || kind === 'decision-tree')) return 'decision';
  if (file.includes(`${path.sep}modeling${path.sep}`)) return 'ModelingRegistry';
  if (file.includes(`${path.sep}engineering${path.sep}`)) return 'EngineeringRegistry';
  return kinds.join('+');
}

function suggestedDecisionTarget(file: string): string {
  const normalized = file.split(path.sep).join('/');
  const ownerRoot = normalized.includes('/tracks/') || normalized.includes('/missions/')
    ? `${path.dirname(file)}/decisions/<business-domain>/<topic>.xnl`
    : 'codument/decisions/<business-domain>/<topic>.xnl';
  return ownerRoot.split(path.sep).join('/');
}

function suggestedStructuredTarget(file: string, targetKind: string): string | undefined {
  const directory = path.dirname(file);
  if (targetKind === 'Track') return path.join(directory, 'track.xnl');
  if (targetKind === 'Mission') return path.join(directory, 'mission.xnl');
  if (targetKind === 'decision') return suggestedDecisionTarget(file);
  if (targetKind === 'Behavior') return behaviorTargetPath(path.resolve(file));
  if (targetKind === 'BehaviorPatch') return path.join(directory, `${path.basename(file, path.extname(file))}.xnl`);
  return undefined;
}

function behaviorTargetPath(file: string): string {
  const directory = path.dirname(file);
  if (path.basename(directory) === 'specs') {
    return path.join(path.dirname(directory), 'behaviors', `${path.basename(file, path.extname(file))}.xnl`);
  }
  return path.join(directory, `${path.basename(file, path.extname(file))}.xnl`);
}

function behaviorPatchOwner(file: string): { trackId: string; capability: string } | undefined {
  const parts = path.normalize(file).split(path.sep);
  const index = parts.findLastIndex((part) => ['behavior_deltas', 'behavior-deltas'].includes(part));
  if (index <= 0 || index + 1 >= parts.length) return undefined;
  return { trackId: parts[index - 1], capability: parts[index + 1] };
}

function isElement(node: XnlNode): node is DataElementNode | TextElementNode {
  return typeof node === 'object' && node !== null && !Array.isArray(node)
    && ((node as DataElementNode).kind === 'DataElement' || (node as TextElementNode).kind === 'TextElement');
}

function isDataElementNode(node: XnlNode): node is DataElementNode {
  return typeof node === 'object' && node !== null && !Array.isArray(node)
    && (node as DataElementNode).kind === 'DataElement';
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
