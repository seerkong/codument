export const CODUMENT_VFS_SCHEMES = [
  'spec',
  'decision',
  'memory',
  'attractor',
  'track',
  'archive',
  'knowledge',
  'test',
] as const;

export type CodumentVfsScheme = typeof CODUMENT_VFS_SCHEMES[number];

export interface CodumentVfsUri {
  raw: string;
  scheme: CodumentVfsScheme;
  authority: string;
  path: string;
  segments: string[];
  query: Record<string, string>;
  fragment?: string;
}

const SCHEME_SET = new Set<string>(CODUMENT_VFS_SCHEMES);

function parseQuery(rawQuery: string): Record<string, string> {
  const query: Record<string, string> = {};
  if (!rawQuery) {
    return query;
  }

  for (const part of rawQuery.split('&')) {
    if (!part) {
      continue;
    }
    const [rawKey, rawValue = ''] = part.split('=');
    const key = decodeURIComponent(rawKey);
    query[key] = decodeURIComponent(rawValue);
  }
  return query;
}

export function isCodumentVfsScheme(value: string): value is CodumentVfsScheme {
  return SCHEME_SET.has(value);
}

export function parseCodumentVfsUri(input: string): CodumentVfsUri {
  const match = input.match(/^([a-z][a-z0-9+.-]*):\/\/([^/?#]+)([^?#]*)(?:\?([^#]*))?(?:#(.+))?$/);
  if (!match) {
    throw new Error(`Invalid Codument VFS URI: ${input}`);
  }

  const [, rawScheme, authority, rawPath = '', rawQuery = '', fragment] = match;
  if (!isCodumentVfsScheme(rawScheme)) {
    throw new Error(`Unsupported Codument VFS scheme: ${rawScheme}`);
  }

  const pathPart = rawPath.startsWith('/') ? rawPath.slice(1) : rawPath;
  const segments = [authority, ...pathPart.split('/').filter(Boolean)].map(decodeURIComponent);
  if (segments.length === 0 || segments.some((segment) => segment.trim().length === 0)) {
    throw new Error(`Invalid Codument VFS path: ${input}`);
  }

  return {
    raw: input,
    scheme: rawScheme,
    authority: decodeURIComponent(authority),
    path: pathPart,
    segments,
    query: parseQuery(rawQuery),
    fragment: fragment ? decodeURIComponent(fragment) : undefined,
  };
}

export function tryParseCodumentVfsUri(input: string): CodumentVfsUri | null {
  try {
    return parseCodumentVfsUri(input);
  } catch {
    return null;
  }
}

export function buildCodumentVfsUri(
  scheme: CodumentVfsScheme,
  segments: string[],
  query?: Record<string, string>,
): string {
  if (segments.length === 0) {
    throw new Error('A Codument VFS URI requires at least one segment.');
  }

  const [authority, ...rest] = segments.map(encodeURIComponent);
  const path = rest.length > 0 ? `/${rest.join('/')}` : '';
  const queryString = query && Object.keys(query).length > 0
    ? `?${Object.entries(query)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&')}`
    : '';

  return `${scheme}://${authority}${path}${queryString}`;
}
