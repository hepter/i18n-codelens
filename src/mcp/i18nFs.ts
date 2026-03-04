import fs from 'fs';
import path from 'path';
import fg from 'fast-glob';
import ignore from 'ignore';
import { flattenObject, isObjectNested, FlatResourceMap } from '../shared/resourceUtils';
import { DEFAULT_RESOURCE_GLOB, DEFAULT_CODE_GLOB, buildCodeRegex, getEffectiveConfigFromEnv } from '../shared/config';

export { setNestedValue, deleteNestedKey } from '../shared/resourceUtils';

export type ResourceFile = {
  filePath: string; // absolute path
  fileName: string; // name without extension (e.g., tr, en)
  isNested: boolean;
  keyValuePairs: FlatResourceMap; // flattened
};


export type KeyReference = {
  filePath: string;
  line: number;
  column: number;
};

export type KeyReferenceSummary = {
  total: number;
  references: KeyReference[];
};

export function getWorkspaceRoot(workspaceRootOverride?: string): string {
  // Precedence (first usable wins):
  // 0) Per-call override (tool argument)
  // 1) CLI arg: --workspaceRoot / --workspace-root (or =value)
  // 2) Env: WORKSPACE_ROOT
  // 3) Current working directory (process.cwd)
  // 4) Server location fallback (dirname-based)
  const readArg = (names: string[]): string | undefined => {
    const argv = Array.isArray(process.argv) ? process.argv : [];
    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i] || '';
      for (const name of names) {
        if (arg === name && argv[i + 1]) return argv[i + 1];
        const prefix = `${name}=`;
        if (arg.startsWith(prefix)) return arg.slice(prefix.length);
      }
    }
    return undefined;
  };

  const overrideRoot = workspaceRootOverride ? path.resolve(workspaceRootOverride) : undefined;
  const argRootRaw = readArg(['--workspaceRoot', '--workspace-root']);
  const argRoot = argRootRaw ? path.resolve(argRootRaw) : undefined;
  const envRoot = process.env.WORKSPACE_ROOT ? path.resolve(process.env.WORKSPACE_ROOT) : undefined;
  const cwdRoot = path.resolve(process.cwd());
  const serverRoot = path.resolve(__dirname, '..', '..'); // project root (from out/mcp)

  const isUsable = (p?: string) => {
    if (!p) return false;
    try { return fs.statSync(p).isDirectory(); } catch { return false; }
  };

  const candidates = [overrideRoot, argRoot, envRoot, cwdRoot, serverRoot];
  let chosen = cwdRoot;
  for (const candidate of candidates) {
    if (isUsable(candidate)) {
      chosen = candidate!;
      break;
    }
  }
  try { process.stderr.write(`[i18n-codelens MCP] Using workspace root: ${chosen}\n`); } catch { /* ignore */ }
  return chosen;
}

export async function readResourceFiles(globPattern?: string, workspaceRootOverride?: string): Promise<ResourceFile[]> {
  const root = getWorkspaceRoot(workspaceRootOverride);
  const envCfg = getEffectiveConfigFromEnv(process.env);
  const pattern = globPattern || envCfg.resourceGlob || DEFAULT_RESOURCE_GLOB;
  const entries = await fg(pattern, {
    cwd: root,
    absolute: true,
    onlyFiles: true,
    dot: false,
    ignore: envCfg.ignoreGlobs,
    followSymbolicLinks: false,
    suppressErrors: true,
    throwErrorOnBrokenSymbolicLink: false,
  });

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

function normalizePathCasing(target: string): string {
  return process.platform === 'win32' ? target.toLowerCase() : target;
}

function ensureSafeWorkspacePath(absPath: string, workspaceRootOverride?: string): string {
  const root = path.resolve(getWorkspaceRoot(workspaceRootOverride));
  const normalizedRoot = normalizePathCasing(root);
  const resolved = path.resolve(absPath);
  const normalizedResolved = normalizePathCasing(resolved);

  if (normalizedResolved !== normalizedRoot && !normalizedResolved.startsWith(normalizedRoot + path.sep)) {
    throw new Error(`Refusing to access path outside workspace root: ${absPath}`);
  }

  let current = resolved;
  while (normalizePathCasing(current) !== normalizedRoot) {
    if (fs.existsSync(current)) {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) {
        throw new Error(`Refusing to follow symbolic link while accessing ${absPath}`);
      }
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return resolved;
}

export function writeFilePretty(absPath: string, json: any, workspaceRootOverride?: string) {
  const target = ensureSafeWorkspacePath(absPath, workspaceRootOverride);
  const content = JSON.stringify(json, null, 2) + '\n';
  const dir = path.dirname(target);

  fs.mkdirSync(dir, { recursive: true });

  const tempFile = path.join(dir, `${path.basename(target)}.${process.pid}.${Date.now()}.tmp`);

  try {
    fs.writeFileSync(tempFile, content, 'utf8');
    fs.renameSync(tempFile, target);
  } catch (error) {
    if (fs.existsSync(tempFile)) {
      try {
        fs.unlinkSync(tempFile);
      } catch {
        // best-effort cleanup
      }
    }
    throw error;
  }
}

export function loadJson(absPath: string, workspaceRootOverride?: string): any {
  const target = ensureSafeWorkspacePath(absPath, workspaceRootOverride);
  const raw = fs.readFileSync(target, 'utf8');
  return JSON.parse(raw);
}

export function findUntranslatedKeysInFile(codeFilePath: string, keys: string[]): string[] {
  // Extract resource keys used in the given file with the default regex from extension settings
  const raw = fs.readFileSync(codeFilePath, 'utf8');
  const rx = buildCodeRegex(process.env.I18N_CODE_REGEX);
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
  limitPerKey = 25,
  workspaceRootOverride?: string
): Promise<Record<string, KeyReferenceSummary>> {
  const summaries: Record<string, KeyReferenceSummary> = {};
  if (!keys.length) {
    return summaries;
  }

  const workspaceRoot = getWorkspaceRoot(workspaceRootOverride);
  const envCfg = getEffectiveConfigFromEnv(process.env);
  const globPattern = envCfg.codeGlob || DEFAULT_CODE_GLOB;
  const codeFiles = await fg(globPattern, {
    cwd: workspaceRoot,
    absolute: true,
    onlyFiles: true,
    dot: false,
    ignore: envCfg.ignoreGlobs,
    followSymbolicLinks: false,
    suppressErrors: true,
    throwErrorOnBrokenSymbolicLink: false,
  });

  // Respect .gitignore if present
  let ig = ignore();
  const giPath = path.join(workspaceRoot, '.gitignore');
  try {
    const content = fs.readFileSync(giPath, 'utf8');
    ig = ignore().add(content);
  } catch {
    // no .gitignore present; proceed without additional ignores
  }

  const normalizedResourcePaths = new Set(Array.from(resourceFilePaths).map(p => path.normalize(p)));
  const keysSet = new Set(keys);

  for (const key of keys) {
    summaries[key] = { total: 0, references: [] };
  }

  const regexPattern = buildCodeRegex(process.env.I18N_CODE_REGEX);

  for (const filePath of codeFiles) {
    if (normalizedResourcePaths.has(path.normalize(filePath))) {
      continue;
    }

    // Filter by .gitignore
    const rel = path.relative(workspaceRoot, filePath);
    if (rel && ig.ignores(rel)) continue;

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
