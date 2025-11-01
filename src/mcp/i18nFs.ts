import fs from 'fs';
import path from 'path';
import fg from 'fast-glob';
import { flattenObject, isObjectNested, FlatResourceMap } from '../shared/resourceUtils';

export { setNestedValue, deleteNestedKey } from '../shared/resourceUtils';

export type ResourceFile = {
  filePath: string; // absolute path
  fileName: string; // name without extension (e.g., tr, en)
  isNested: boolean;
  keyValuePairs: FlatResourceMap; // flattened
};

const DEFAULT_GLOB = '**/locales/**/*.json';
const DEFAULT_CODE_GLOB = '**/*.{ts,tsx,js,jsx}';

export type KeyReference = {
  filePath: string;
  line: number;
  column: number;
};

export type KeyReferenceSummary = {
  total: number;
  references: KeyReference[];
};

export function getWorkspaceRoot(): string {
  // Prefer explicit env, fallback to CWD
  return process.env.WORKSPACE_ROOT || process.cwd();
}

export async function readResourceFiles(globPattern?: string): Promise<ResourceFile[]> {
  const root = getWorkspaceRoot();
  const pattern = globPattern || process.env.I18N_GLOB || DEFAULT_GLOB;
  const entries = await fg(pattern, { cwd: root, absolute: true, onlyFiles: true, dot: false, ignore: ['**/node_modules/**'] });

  entries.sort((a, b) => path.parse(a).name.localeCompare(path.parse(b).name));

  const result: ResourceFile[] = [];
  for (const absPath of entries) {
    try {
      const raw = fs.readFileSync(absPath, 'utf8');
      const json = JSON.parse(raw);
  const isNested = isObjectNested(json);
  const flattened = flattenObject(json);
      result.push({
        filePath: absPath,
        fileName: path.parse(absPath).name,
        isNested,
        keyValuePairs: flattened,
      });
    } catch {
      // ignore invalid json files
    }
  }
  return result;
}

export function writeFilePretty(absPath: string, json: any) {
  const content = JSON.stringify(json, null, 2) + '\n';
  fs.writeFileSync(absPath, content, 'utf8');
}

export function loadJson(absPath: string): any {
  const raw = fs.readFileSync(absPath, 'utf8');
  return JSON.parse(raw);
}

export function findUntranslatedKeysInFile(codeFilePath: string, keys: string[]): string[] {
  // Extract resource keys used in the given file with the default regex from extension settings
  const raw = fs.readFileSync(codeFilePath, 'utf8');
  const rx = buildCodeRegex();
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = rx.exec(raw)) !== null) {
    const k = (m.groups && (m.groups as any).key) || m[0];
    if (k) found.add(k);
  }
  // Only return keys that are in provided keys list, if provided; else return all
  const arr = Array.from(found);
  if (keys && keys.length) return arr.filter(k => keys.includes(k));
  return arr;
}

export function buildCodeRegex(): RegExp {
  const pattern = process.env.I18N_CODE_REGEX || String.raw`(?<=\/\*\*\s*?@i18n\s*?\*\/\s*?["']|\W[tT]\(\s*["'])(?<key>[A-Za-z0-9 .-]+?)(?=["'])`;

  if (pattern.startsWith('/') && pattern.lastIndexOf('/') > 0) {
    const lastSlash = pattern.lastIndexOf('/');
    const body = pattern.substring(1, lastSlash);
    const flags = pattern.substring(lastSlash + 1);
    const finalFlags = flags.includes('g') ? flags : `${flags}g`;
    return new RegExp(body, finalFlags);
  }

  return new RegExp(pattern, 'g');
}

function computeLineStarts(text: string): number[] {
  const starts: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) { // \n
      starts.push(i + 1);
    }
  }
  return starts;
}

function indexToPosition(lineStarts: number[], index: number): { line: number; column: number } {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const start = lineStarts[mid];
    const nextStart = mid + 1 < lineStarts.length ? lineStarts[mid + 1] : Number.MAX_SAFE_INTEGER;
    if (index < start) {
      high = mid - 1;
    } else if (index >= nextStart) {
      low = mid + 1;
    } else {
      return { line: mid + 1, column: index - start + 1 };
    }
  }
  return { line: 1, column: index + 1 };
}

export async function findKeyReferences(
  keys: string[],
  resourceFilePaths: Set<string>,
  limitPerKey = 25
): Promise<Record<string, KeyReferenceSummary>> {
  const summaries: Record<string, KeyReferenceSummary> = {};
  if (!keys.length) {
    return summaries;
  }

  const workspaceRoot = getWorkspaceRoot();
  const globPattern = process.env.I18N_CODE_GLOB || DEFAULT_CODE_GLOB;
  const codeFiles = await fg(globPattern, {
    cwd: workspaceRoot,
    absolute: true,
    onlyFiles: true,
    dot: false,
    ignore: ['**/node_modules/**']
  });

  const normalizedResourcePaths = new Set(Array.from(resourceFilePaths).map(p => path.normalize(p)));
  const keysSet = new Set(keys);

  for (const key of keys) {
    summaries[key] = { total: 0, references: [] };
  }

  const regexPattern = buildCodeRegex();

  for (const filePath of codeFiles) {
    if (normalizedResourcePaths.has(path.normalize(filePath))) {
      continue;
    }

    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    const lineStarts = computeLineStarts(content);
    const rx = new RegExp(regexPattern.source, regexPattern.flags);

    let match: RegExpExecArray | null;
    while ((match = rx.exec(content)) !== null) {
      const matchedKey = (match.groups && (match.groups as any).key) || match[0];
      if (!keysSet.has(matchedKey)) {
        continue;
      }

      const summary = summaries[matchedKey];
      summary.total += 1;

      if (summary.references.length < limitPerKey) {
        const position = indexToPosition(lineStarts, match.index ?? 0);
        summary.references.push({
          filePath,
          line: position.line,
          column: position.column
        });
      }
    }
  }

  return summaries;
}
