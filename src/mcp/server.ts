// Use dynamic requires to remain compatible with older TypeScript/Node resolution
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
// zod no longer required for low-level usage
import path from 'path';
import fs from 'fs';
import fg from 'fast-glob';
import ignore from 'ignore';
import net from 'net';
import {
  readResourceFiles,
  getWorkspaceRoot,
  loadJson,
  setNestedValue,
  deleteNestedKey,
  writeFilePretty,
  findUntranslatedKeysInFile,
  findKeyReferences,
  type ResourceFile,
} from './i18nFs';
import { flattenObject, FlatResourceMap, unflattenObject, reorderFlatMap } from '../shared/resourceUtils';
import { getEffectiveConfigFromEnv, StructurePreference, buildCodeRegex, DEFAULT_CODE_GLOB, type InsertOrderStrategy } from '../shared/config';

type PresenceResult = Record<string, Record<string, boolean>>; // key -> { langFile: exists }

type UpsertOutcome = 'created' | 'updated' | 'unchanged' | 'error';

type ResourceState = {
  resource: ResourceFile;
  locale: string;
  localeFile: string;
  filePath: string;
  writeStructure: 'flat' | 'nested';
  json?: Record<string, unknown>;
  flatMap?: FlatResourceMap;
  initialFlat: FlatResourceMap; // snapshot of original file as flat map (for ordering)
  createdKeys: string[]; // created keys in insertion order
  changed: boolean;
};

type StructureSummary = {
  summary: { created: number; updated: number; unchanged: number; errors: number };
  results: Array<{
    localeFile: string;
    locale: string;
    key: string;
    result: UpsertOutcome;
    before?: string | null;
    after?: string | null;
    error?: string;
  }>;
};

type RenameSummary = {
  summary: { renamed: number; skipped: number; errors: number };
  results: Array<{
    localeFile: string;
    locale: string;
    from: string;
    to: string;
    result: 'renamed' | 'skipped' | 'error';
    before?: string | null;
    after?: string | null;
    error?: string;
  }>;
};

type NamespaceMoveSummary = {
  summary: { moved: number; skipped: number; errors: number };
  results: Array<{
    localeFile: string;
    locale: string;
    from: string;
    to: string;
    movedKeys: string[];
    result: 'moved' | 'skipped' | 'error';
    error?: string;
  }>;
};

const PLACEHOLDER_BRACE = /\{\{\s*([\d\w.-]+)\s*\}\}/g;
const PLACEHOLDER_CURVY = /\{\s*([\d\w.-]+)\s*\}/g;

const safeStderr = (msg: string) => {
  try { process.stderr.write(msg + '\n'); } catch { /* ignore */ }
};

let mcpLogger: (msg: string) => void = (msg: string) => {
  safeStderr(msg);
};

function normalizeLocaleTag(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  const withoutExt = trimmed.toLowerCase().endsWith('.json') ? trimmed.slice(0, -5) : trimmed;
  if (!withoutExt) return '';
  const segments = withoutExt.split(/[-_]/).filter(Boolean);
  if (!segments.length) return '';

  return segments
    .map((segment, index) => {
      if (index === 0) {
        return segment.toLowerCase();
      }
      if (segment.length === 2) {
        return segment.toUpperCase();
      }
      if (segment.length === 4) {
        return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();
      }
      return segment;
    })
    .join('-');
}

function describeLocale(tag: string): string | undefined {
  const DisplayNames = (Intl as unknown as { DisplayNames?: typeof Intl.DisplayNames }).DisplayNames;
  if (!DisplayNames) {
    return undefined;
  }

  try {
    const segments = tag.split('-');
    const language = segments[0];
    const region = segments.find(seg => seg.length === 2 && seg === seg.toUpperCase());
    const script = segments.find(seg => seg.length === 4);

    const languageDn = new DisplayNames(['en'], { type: 'language' });
    const regionDn = new DisplayNames(['en'], { type: 'region' });
    const scriptDn = new DisplayNames(['en'], { type: 'script' });

    const languageName = languageDn.of(language) || language;
    const scriptName = script ? scriptDn.of(script) : undefined;
    const regionName = region ? regionDn.of(region) : undefined;

    if (regionName && scriptName) {
      return `${languageName} (${scriptName} - ${regionName})`;
    }
    if (regionName) {
      return `${languageName} (${regionName})`;
    }
    if (scriptName) {
      return `${languageName} (${scriptName})`;
    }
    return languageName;
  } catch {
    return undefined;
  }
}

function relativeToWorkspace(filePath: string, workspaceDir?: string): string {
  const workspaceRoot = getWorkspaceRoot(workspaceDir);
  const relative = path.relative(workspaceRoot, filePath);
  if (!relative || relative.startsWith('..')) {
    return filePath;
  }
  return relative || filePath;
}

function determineWriteStructure(resource: ResourceFile, preference: StructurePreference): 'flat' | 'nested' {
  if (preference === 'auto') {
    return resource.isNested ? 'nested' : 'flat';
  }
  return preference;
}

function createResourceState(resource: ResourceFile, preference: StructurePreference, workspaceDir?: string): ResourceState {
  const filePath = resource.filePath;
  const locale = normalizeLocaleTag(resource.fileName);
  const localeFile = relativeToWorkspace(filePath, workspaceDir);
  const writeStructure = determineWriteStructure(resource, preference);
  const json = loadJson(filePath, workspaceDir) as Record<string, unknown>;

  if (writeStructure === 'flat') {
    const flatMap = flattenObject(json);
    return {
      resource,
      locale,
      localeFile,
      filePath,
      writeStructure,
      flatMap: { ...flatMap },
      initialFlat: { ...flatMap },
      createdKeys: [],
      changed: false,
    };
  }

  return {
    resource,
    locale,
    localeFile,
    filePath,
    writeStructure,
    json: { ...json },
    initialFlat: flattenObject(json),
    createdKeys: [],
    changed: false,
  };
}

function readNestedValue(target: Record<string, unknown> | undefined, key: string): string | undefined {
  if (!target) return undefined;
  const segments = key.split('.');
  let current: unknown = target;

  for (const segment of segments) {
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  if (typeof current === 'undefined' || current === null) {
    return undefined;
  }

  return String(current);
}

function getValueFromState(state: ResourceState, key: string): string | undefined {
  if (state.writeStructure === 'flat') {
    return state.flatMap?.[key];
  }
  return readNestedValue(state.json, key);
}

function applyValueToState(state: ResourceState, key: string, value: string) {
  if (state.writeStructure === 'flat') {
    if (!state.flatMap) {
      state.flatMap = {};
    }
    if (typeof state.flatMap[key] === 'undefined' && !state.createdKeys.includes(key)) {
      state.createdKeys.push(key);
    }
    state.flatMap[key] = value;
  } else {
    if (!state.json) {
      state.json = {};
    }
    // created detection for nested
    if (typeof readNestedValue(state.json, key) === 'undefined' && !state.createdKeys.includes(key)) {
      state.createdKeys.push(key);
    }
    setNestedValue(state.json, key, value);
  }
  state.changed = true;
}

function deleteKeyFromState(state: ResourceState, key: string): boolean {
  if (state.writeStructure === 'flat') {
    if (state.flatMap && Object.prototype.hasOwnProperty.call(state.flatMap, key)) {
      delete state.flatMap[key];
      state.changed = true;
      return true;
    }
    return false;
  }

  const before = readNestedValue(state.json, key);
  if (typeof before === 'undefined') {
    return false;
  }
  if (state.json) {
    deleteNestedKey(state.json, key);
    state.changed = true;
    return true;
  }
  return false;
}

function listKeysFromState(state: ResourceState): string[] {
  if (state.writeStructure === 'flat') {
    return Object.keys(state.flatMap ?? {});
  }
  const flattened = flattenObject(state.json ?? {});
  return Object.keys(flattened);
}


function createResourceManager(resources: ResourceFile[], preference: StructurePreference, insertOrder: InsertOrderStrategy, workspaceDir?: string) {
  const localeMap = new Map<string, ResourceFile>();
  for (const resource of resources) {
    localeMap.set(normalizeLocaleTag(resource.fileName), resource);
  }

  const stateMap = new Map<string, ResourceState>();

  const getState = (locale: string): ResourceState | undefined => {
    const resource = localeMap.get(locale);
    if (!resource) {
      return undefined;
    }
    let state = stateMap.get(resource.filePath);
    if (!state) {
      state = createResourceState(resource, preference, workspaceDir);
      stateMap.set(resource.filePath, state);
    }
    return state;
  };

  const commit = (dryRun: boolean) => {
    if (dryRun) {
      return;
    }
    for (const state of stateMap.values()) {
      if (!state.changed) {
        continue;
      }
      if (state.writeStructure === 'flat') {
        const currentFlat = state.flatMap ?? {};
        const ordered = reorderFlatMap(state.initialFlat, currentFlat, state.createdKeys, insertOrder);
        writeFilePretty(state.filePath, ordered, workspaceDir);
      } else {
        const currentJson = state.json ?? {};
        const currentFlat = flattenObject(currentJson);
        const orderedFlat = reorderFlatMap(state.initialFlat, currentFlat, state.createdKeys, insertOrder);
        const rebuilt = unflattenObject(orderedFlat) as Record<string, unknown>;
        writeFilePretty(state.filePath, rebuilt, workspaceDir);
      }
      state.changed = false;
    }
  };

  return { preference, localeMap, states: stateMap, getState, commit };
}

function extractPlaceholders(value: string | undefined): Set<string> {
  const placeholders = new Set<string>();
  if (!value) {
    return placeholders;
  }

  const addMatches = (regex: RegExp) => {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(value)) !== null) {
      const found = match[1];
      if (found) {
        placeholders.add(found);
      }
    }
  };

  addMatches(PLACEHOLDER_BRACE);
  addMatches(PLACEHOLDER_CURVY);

  return placeholders;
}

async function collectWorkspaceKeys(excludePaths: Set<string>, workspaceDir?: string): Promise<Set<string>> {
  const envConfig = getEffectiveConfigFromEnv(process.env);
  const workspaceRoot = getWorkspaceRoot(workspaceDir);
  const globPattern = envConfig.codeGlob || DEFAULT_CODE_GLOB;
  const codeFiles = await fg(globPattern, {
    cwd: workspaceRoot,
    absolute: true,
    onlyFiles: true,
    dot: false,
    ignore: envConfig.ignoreGlobs,
    followSymbolicLinks: false,
    suppressErrors: true,
    throwErrorOnBrokenSymbolicLink: false,
  });

  let ig = ignore();
  const gitignorePath = path.join(workspaceRoot, '.gitignore');
  try {
    const giContent = fs.readFileSync(gitignorePath, 'utf8');
    ig = ignore().add(giContent);
  } catch {
    // no .gitignore; proceed without additional ignores
  }

  const regex = buildCodeRegex(process.env.I18N_CODE_REGEX);
  const keys = new Set<string>();

  for (const filePath of codeFiles) {
    if (excludePaths.has(path.normalize(filePath))) {
      continue;
    }
    const relative = path.relative(workspaceRoot, filePath);
    if (relative && ig.ignores(relative)) {
      continue;
    }

    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const key = (match.groups && (match.groups as any).key) || match[0];
      if (key) {
        keys.add(key);
      }
    }
  }

  return keys;
}

async function ensureResources(workspaceDir?: string) {
  const resources = await readResourceFiles(undefined, workspaceDir);
  if (resources.length === 0) {
    const root = getWorkspaceRoot(workspaceDir);
    const cfg = getEffectiveConfigFromEnv(process.env);
    throw new Error(`No i18n resource files found. Adjust WORKSPACE_ROOT or I18N_GLOB. Details: WORKSPACE_ROOT='${root}', I18N_GLOB='${cfg.resourceGlob}'`);
  }
  try {
    const preview = resources.slice(0, 5).map(r => r.fileName).join(', ');
    mcpLogger(`[i18n-codelens MCP] resources detected: count=${resources.length}, sample=[${preview}]`);
  } catch { /* ignore */ }
  return resources;
}

async function toolCheckKeys(args: { keys?: string[]; workspaceDir?: string }): Promise<PresenceResult> {
  const keys = Array.isArray(args.keys) ? args.keys : [];
  const workspaceDir = typeof args.workspaceDir === 'string' && args.workspaceDir.trim() ? args.workspaceDir : undefined;
  const resources = await ensureResources(workspaceDir);
  const out: PresenceResult = {};
  for (const key of keys) {
    const perLang: Record<string, boolean> = {};
    for (const res of resources) {
      if (key.endsWith('.')) {
        // prefix match for namespaces like "auth." or "home.header."
        const prefix = key;
        perLang[res.fileName] = Object.keys(res.keyValuePairs).some(k => k.startsWith(prefix));
      } else {
        perLang[res.fileName] = Object.prototype.hasOwnProperty.call(res.keyValuePairs, key);
      }
    }
    out[key] = perLang;
  }
  return out;
}

async function toolUntranslatedKeysOnPage(args: { filePath: string; workspaceDir?: string }): Promise<string[]> {
  const workspaceDir = typeof args.workspaceDir === 'string' && args.workspaceDir.trim() ? args.workspaceDir : undefined;
  const filePath = args.filePath;
  const abs = path.isAbsolute(filePath) ? filePath : path.join(getWorkspaceRoot(workspaceDir), filePath);
  if (!fs.existsSync(abs)) throw new Error(`File not found: ${abs}`);

  const resources = await ensureResources(workspaceDir);
  // Collect keys used in file
  const usedKeys = findUntranslatedKeysInFile(abs, []);
  // Untranslated = missing in at least one resource file
  const missing: string[] = [];
  for (const k of usedKeys) {
    const anyMissing = resources.some(r => !Object.prototype.hasOwnProperty.call(r.keyValuePairs, k));
    if (anyMissing) missing.push(k);
  }
  return missing;
}

async function toolUpsertTranslations(args: { entries?: Array<{ key: string; values: Record<string, string | undefined> }>; dryRun?: boolean; workspaceDir?: string }): Promise<StructureSummary> {
  const entries = Array.isArray(args.entries) ? args.entries : [];
  if (!entries.length) {
    throw new Error('entries array must contain at least one item');
  }

  const workspaceDir = typeof args.workspaceDir === 'string' && args.workspaceDir.trim() ? args.workspaceDir : undefined;
  const resources = await ensureResources(workspaceDir);
  const { structurePreference, insertOrderStrategy } = getEffectiveConfigFromEnv(process.env);
  const manager = createResourceManager(resources, structurePreference, insertOrderStrategy, workspaceDir);
  const results: StructureSummary['results'] = [];
  const summary: StructureSummary['summary'] = { created: 0, updated: 0, unchanged: 0, errors: 0 };

  for (const entry of entries) {
    if (!entry || typeof entry.key !== 'string' || !entry.key.trim()) {
      summary.errors += 1;
      results.push({
        localeFile: 'n/a',
        locale: 'n/a',
        key: String(entry?.key ?? ''),
        result: 'error',
        error: 'Invalid key specified',
      });
      continue;
    }

    const key = entry.key.trim();
    const values = entry.values || {};

    for (const rawLocaleKey of Object.keys(values)) {
      const normalizedLocale = normalizeLocaleTag(rawLocaleKey);
      if (!normalizedLocale) {
        summary.errors += 1;
        results.push({
          localeFile: rawLocaleKey,
          locale: rawLocaleKey,
          key,
          result: 'error',
          error: `Invalid locale identifier: ${rawLocaleKey}`,
        });
        continue;
      }

      const state = manager.getState(normalizedLocale);
      if (!state) {
        summary.errors += 1;
        results.push({
          localeFile: rawLocaleKey,
          locale: normalizedLocale,
          key,
          result: 'error',
          error: `No resource file found for locale '${normalizedLocale}'. Call i18n_list_locales to review available files.`,
        });
        continue;
      }

      const nextValueRaw = values[rawLocaleKey];
      if (typeof nextValueRaw === 'undefined') {
        continue;
      }
      const nextValue = String(nextValueRaw);
      const before = getValueFromState(state, key);

      let outcome: UpsertOutcome;
      if (typeof before === 'undefined') {
        outcome = 'created';
        applyValueToState(state, key, nextValue);
      } else if (before === nextValue) {
        outcome = 'unchanged';
      } else {
        outcome = 'updated';
        applyValueToState(state, key, nextValue);
      }

      summary[outcome] += 1;
      results.push({
      localeFile: relativeToWorkspace(state.filePath, workspaceDir),
        locale: state.locale,
        key,
        result: outcome,
        before: typeof before === 'undefined' ? null : before,
        after: outcome === 'unchanged' ? before ?? null : nextValue,
      });
    }
  }

  manager.commit(Boolean(args.dryRun));

  return { summary, results };
}

async function toolDeleteKey(args: { key: string; locales?: string[]; dryRun?: boolean; workspaceDir?: string }): Promise<{ deletedFrom: string[] }> {
  const key = typeof args.key === 'string' ? args.key.trim() : '';
  if (!key) {
    throw new Error('key is required');
  }

  const workspaceDir = typeof args.workspaceDir === 'string' && args.workspaceDir.trim() ? args.workspaceDir : undefined;
  const resources = await ensureResources(workspaceDir);
  const { structurePreference, insertOrderStrategy } = getEffectiveConfigFromEnv(process.env);
  const manager = createResourceManager(resources, structurePreference, insertOrderStrategy, workspaceDir);
  const filter = new Set((args.locales || []).map(normalizeLocaleTag).filter(Boolean));
  const deletedFrom: string[] = [];

  for (const locale of manager.localeMap.keys()) {
    if (filter.size && !filter.has(locale)) {
      continue;
    }

    const state = manager.getState(locale);
    if (!state) {
      continue;
    }

    const existed = typeof getValueFromState(state, key) !== 'undefined';
    if (!existed) {
      continue;
    }

    if (deleteKeyFromState(state, key)) {
      deletedFrom.push(state.localeFile);
    }
  }

  manager.commit(Boolean(args.dryRun));

  return { deletedFrom };
}

async function toolListLocales(args: { workspaceDir?: string } = {}) {
  const workspaceDir = typeof args.workspaceDir === 'string' && args.workspaceDir.trim() ? args.workspaceDir : undefined;
  const resources = await ensureResources(workspaceDir);
  const locales = resources.map(res => {
    const locale = normalizeLocaleTag(res.fileName);
    return {
      locale,
      localeFile: relativeToWorkspace(res.filePath, workspaceDir),
      description: describeLocale(locale),
      isNested: res.isNested,
      keyCount: Object.keys(res.keyValuePairs).length,
    };
  });

  const languages = locales.map(l => l.locale);

  return { languages, locales };
}

async function toolGetTranslations(args: { keys?: string[]; locales?: string[]; workspaceDir?: string }) {
  const keys = Array.isArray(args.keys) ? args.keys.map(key => key.trim()).filter(Boolean) : [];
  if (!keys.length) {
    throw new Error('keys array must contain at least one key');
  }

  const workspaceDir = typeof args.workspaceDir === 'string' && args.workspaceDir.trim() ? args.workspaceDir : undefined;
  const resources = await ensureResources(workspaceDir);
  const requestedLocales = (args.locales || resources.map(res => res.fileName)).map(normalizeLocaleTag).filter(Boolean);
  const localeSet = new Set(requestedLocales);
  const localeMap = new Map(resources.map(res => [normalizeLocaleTag(res.fileName), res] as const));

  const effectiveLocales = Array.from(localeSet).filter(locale => localeMap.has(locale));
  if (!effectiveLocales.length) {
    throw new Error('None of the requested locales are available. Call i18n_list_locales for the current list.');
  }

  const translations = keys.map(key => {
    const values: Record<string, string | null> = {};
    for (const locale of effectiveLocales) {
      const resource = localeMap.get(locale);
      const value = resource?.keyValuePairs[key];
      values[locale] = typeof value === 'undefined' ? null : value;
    }
    return { key, values };
  });

  return { locales: effectiveLocales, translations };
}

async function toolDiffLocales(args: { base: string; compare: string[]; workspaceDir?: string }) {
  const baseLocale = normalizeLocaleTag(args.base);
  if (!baseLocale) {
    throw new Error('base locale is required');
  }
  const compareLocales = (args.compare || []).map(normalizeLocaleTag).filter(Boolean);
  if (!compareLocales.length) {
    throw new Error('compare array must contain at least one locale');
  }

  const workspaceDir = typeof args.workspaceDir === 'string' && args.workspaceDir.trim() ? args.workspaceDir : undefined;
  const resources = await ensureResources(workspaceDir);
  const localeMap = new Map(resources.map(res => [normalizeLocaleTag(res.fileName), res] as const));
  const baseResource = localeMap.get(baseLocale);
  if (!baseResource) {
    throw new Error(`Locale '${baseLocale}' not found. Call i18n_list_locales for the current list.`);
  }

  const baseKeys = new Set(Object.keys(baseResource.keyValuePairs));
  const comparisons = [] as Array<{
    locale: string;
    missing: string[];
    extra: string[];
    placeholderMismatches: Array<{ key: string; missing: string[]; extra: string[] }>;
  }>;

  for (const locale of compareLocales) {
    const resource = localeMap.get(locale);
    if (!resource) {
      comparisons.push({
        locale,
        missing: Array.from(baseKeys),
        extra: [],
        placeholderMismatches: [],
      });
      continue;
    }

    const compareKeys = new Set(Object.keys(resource.keyValuePairs));
    const missing = Array.from(baseKeys).filter(key => !compareKeys.has(key));
    const extra = Array.from(compareKeys).filter(key => !baseKeys.has(key));

    const placeholderMismatches: Array<{ key: string; missing: string[]; extra: string[] }> = [];
    for (const key of baseKeys) {
      if (!compareKeys.has(key)) {
        continue;
      }
      const baseValue = baseResource.keyValuePairs[key];
      const compareValue = resource.keyValuePairs[key];
      const basePlaceholders = extractPlaceholders(baseValue);
      const comparePlaceholders = extractPlaceholders(compareValue);

      const missingPh = Array.from(basePlaceholders).filter(ph => !comparePlaceholders.has(ph));
      const extraPh = Array.from(comparePlaceholders).filter(ph => !basePlaceholders.has(ph));
      if (missingPh.length || extraPh.length) {
        placeholderMismatches.push({ key, missing: missingPh, extra: extraPh });
      }
    }

    comparisons.push({ locale, missing, extra, placeholderMismatches });
  }

  return { base: baseLocale, comparisons };
}

async function toolScanWorkspaceMissing(args: { workspaceDir?: string } = {}) {
  const workspaceDir = typeof args.workspaceDir === 'string' && args.workspaceDir.trim() ? args.workspaceDir : undefined;
  const resources = await ensureResources(workspaceDir);
  const resourcePaths = new Set(resources.map(res => path.normalize(res.filePath)));
  const keysInCode = await collectWorkspaceKeys(resourcePaths, workspaceDir);

  const missing: Array<{
    key: string;
    missingLocales: string[];
    presentLocales: string[];
    references: Array<{ filePath: string; line: number; column: number }>;
  }> = [];

  const localeMap = new Map(resources.map(res => [normalizeLocaleTag(res.fileName), res] as const));

  for (const key of keysInCode) {
    const missingLocales: string[] = [];
    const presentLocales: string[] = [];

    for (const [locale, resource] of localeMap.entries()) {
      if (Object.prototype.hasOwnProperty.call(resource.keyValuePairs, key)) {
        presentLocales.push(locale);
      } else {
        missingLocales.push(locale);
      }
    }

    if (missingLocales.length) {
      missing.push({ key, missingLocales, presentLocales, references: [] });
    }
  }

  const missingKeys = missing.map(item => item.key);
  if (missingKeys.length) {
    const referenceSummary = await findKeyReferences(missingKeys, new Set(resources.map(res => res.filePath)), 5);
    for (const item of missing) {
      const summary = referenceSummary[item.key];
      if (summary) {
        item.references = summary.references;
      }
    }
  }

  return { totalMissing: missing.length, missing };
}

async function toolRenameKey(args: { from: string; to: string; locales?: string[]; dryRun?: boolean; workspaceDir?: string }): Promise<RenameSummary> {
  const fromKey = typeof args.from === 'string' ? args.from.trim() : '';
  const toKey = typeof args.to === 'string' ? args.to.trim() : '';

  if (!fromKey || !toKey) {
    throw new Error('from and to keys are required');
  }

  if (fromKey === toKey) {
    throw new Error('from and to keys must differ');
  }

  const workspaceDir = typeof args.workspaceDir === 'string' && args.workspaceDir.trim() ? args.workspaceDir : undefined;
  const resources = await ensureResources(workspaceDir);
  const { structurePreference, insertOrderStrategy } = getEffectiveConfigFromEnv(process.env);
  const manager = createResourceManager(resources, structurePreference, insertOrderStrategy, workspaceDir);
  const filter = new Set((args.locales || []).map(normalizeLocaleTag).filter(Boolean));

  const results: RenameSummary['results'] = [];
  const summary: RenameSummary['summary'] = { renamed: 0, skipped: 0, errors: 0 };

  for (const locale of manager.localeMap.keys()) {
    if (filter.size && !filter.has(locale)) {
      continue;
    }

    const state = manager.getState(locale);
    if (!state) {
      continue;
    }

    const current = getValueFromState(state, fromKey);
    if (typeof current === 'undefined') {
      summary.skipped += 1;
      results.push({
        localeFile: state.localeFile,
        locale: state.locale,
        from: fromKey,
        to: toKey,
        result: 'skipped',
      });
      continue;
    }

    if (typeof getValueFromState(state, toKey) !== 'undefined') {
      summary.errors += 1;
      results.push({
        localeFile: state.localeFile,
        locale: state.locale,
        from: fromKey,
        to: toKey,
        result: 'error',
        error: `Target key '${toKey}' already exists in ${state.localeFile}`,
      });
      continue;
    }

    deleteKeyFromState(state, fromKey);
    applyValueToState(state, toKey, current);

    summary.renamed += 1;
    results.push({
      localeFile: state.localeFile,
      locale: state.locale,
      from: fromKey,
      to: toKey,
      result: 'renamed',
      before: current,
      after: current,
    });
  }

  manager.commit(Boolean(args.dryRun));

  return { summary, results };
}

async function toolMoveNamespace(args: { from: string; to: string; locales?: string[]; dryRun?: boolean; workspaceDir?: string }): Promise<NamespaceMoveSummary> {
  const fromPrefixRaw = typeof args.from === 'string' ? args.from.trim() : '';
  const toPrefixRaw = typeof args.to === 'string' ? args.to.trim() : '';

  if (!fromPrefixRaw || !toPrefixRaw) {
    throw new Error('from and to prefixes are required');
  }

  const fromPrefix = fromPrefixRaw.endsWith('.') ? fromPrefixRaw : `${fromPrefixRaw}.`;
  const toPrefix = toPrefixRaw.endsWith('.') ? toPrefixRaw : `${toPrefixRaw}.`;

  const workspaceDir = typeof args.workspaceDir === 'string' && args.workspaceDir.trim() ? args.workspaceDir : undefined;
  const resources = await ensureResources(workspaceDir);
  const { structurePreference, insertOrderStrategy } = getEffectiveConfigFromEnv(process.env);
  const manager = createResourceManager(resources, structurePreference, insertOrderStrategy, workspaceDir);
  const filter = new Set((args.locales || []).map(normalizeLocaleTag).filter(Boolean));

  const results: NamespaceMoveSummary['results'] = [];
  const summary: NamespaceMoveSummary['summary'] = { moved: 0, skipped: 0, errors: 0 };

  for (const locale of manager.localeMap.keys()) {
    if (filter.size && !filter.has(locale)) {
      continue;
    }

    const state = manager.getState(locale);
    if (!state) {
      continue;
    }

    const currentKeys = listKeysFromState(state).filter(key => key.startsWith(fromPrefix));
    if (!currentKeys.length) {
      summary.skipped += 1;
      results.push({
        localeFile: state.localeFile,
        locale: state.locale,
        from: fromPrefix,
        to: toPrefix,
        movedKeys: [],
        result: 'skipped',
      });
      continue;
    }

    const destinationKeys = currentKeys.map(key => `${toPrefix}${key.slice(fromPrefix.length)}`);
    const collision = destinationKeys.find(destKey => typeof getValueFromState(state, destKey) !== 'undefined');
    if (collision) {
      summary.errors += 1;
      results.push({
        localeFile: state.localeFile,
        locale: state.locale,
        from: fromPrefix,
        to: toPrefix,
        movedKeys: [],
        result: 'error',
        error: `Key '${collision}' already exists in ${state.localeFile}`,
      });
      continue;
    }

    const movedKeys: string[] = [];
    currentKeys.forEach((sourceKey, index) => {
      const targetKey = destinationKeys[index];
      const value = getValueFromState(state, sourceKey);
      if (typeof value === 'undefined') {
        return;
      }
      deleteKeyFromState(state, sourceKey);
      applyValueToState(state, targetKey, value);
      movedKeys.push(targetKey);
    });

    summary.moved += movedKeys.length;
    results.push({
      localeFile: state.localeFile,
      locale: state.locale,
      from: fromPrefix,
      to: toPrefix,
      movedKeys,
      result: 'moved',
    });
  }

  manager.commit(Boolean(args.dryRun));

  return { summary, results };
}

async function toolValidatePlaceholders(args: { keys?: string[]; locales?: string[]; baseLocale?: string; workspaceDir?: string }) {
  const workspaceDir = typeof args.workspaceDir === 'string' && args.workspaceDir.trim() ? args.workspaceDir : undefined;
  const resources = await ensureResources(workspaceDir);
  const localeMap = new Map(resources.map(res => [normalizeLocaleTag(res.fileName), res] as const));
  const selectedLocales = (args.locales ? args.locales.map(normalizeLocaleTag) : Array.from(localeMap.keys())).filter(Boolean);
  if (!selectedLocales.length) {
    throw new Error('No locales available to validate');
  }

  const baseLocale = normalizeLocaleTag(args.baseLocale || selectedLocales[0]);
  if (!baseLocale || !localeMap.has(baseLocale)) {
    throw new Error('Base locale not found in resources');
  }

  const keys = args.keys && args.keys.length ? args.keys.map(key => key.trim()).filter(Boolean) : Array.from(new Set(Array.from(localeMap.values()).flatMap(res => Object.keys(res.keyValuePairs))));

  const mismatches: Array<{ key: string; locale: string; missing: string[]; extra: string[] }> = [];

  for (const key of keys) {
    const baseResource = localeMap.get(baseLocale);
    const baseValue = baseResource?.keyValuePairs[key];
    if (typeof baseValue === 'undefined') {
      continue;
    }
    const basePlaceholders = extractPlaceholders(baseValue);

    for (const locale of selectedLocales) {
      if (locale === baseLocale) {
        continue;
      }
      const resource = localeMap.get(locale);
      const compareValue = resource?.keyValuePairs[key];
      if (typeof compareValue === 'undefined') {
        continue;
      }
      const comparePlaceholders = extractPlaceholders(compareValue);
      const missing = Array.from(basePlaceholders).filter(ph => !comparePlaceholders.has(ph));
      const extra = Array.from(comparePlaceholders).filter(ph => !basePlaceholders.has(ph));
      if (missing.length || extra.length) {
        mismatches.push({ key, locale, missing, extra });
      }
    }
  }

  return {
    baseLocale,
    locales: selectedLocales,
    keysChecked: keys.length,
    mismatches,
  };
}

async function toolKeyReferences(args: { keys?: string[]; limit?: number; workspaceDir?: string }) {
  const keys = Array.isArray(args.keys) ? args.keys : [];
  const trimmedKeys = Array.from(new Set(keys.map(k => typeof k === 'string' ? k.trim() : '').filter(Boolean)));
  if (!trimmedKeys.length) {
    throw new Error('keys array must contain at least one non-empty string');
  }

  const workspaceDir = typeof args.workspaceDir === 'string' && args.workspaceDir.trim() ? args.workspaceDir : undefined;
  const resources = await ensureResources(workspaceDir);
  const resourcePaths = new Set(resources.map(res => res.filePath));
  const maxPerKey = Math.min(Math.max(args.limit ?? 25, 1), 25);

  return findKeyReferences(trimmedKeys, resourcePaths, maxPerKey, workspaceDir);
}

async function main() {
  // Remote logger to VS Code extension output channel
  (() => {
    const portRaw = process.env.I18N_MCP_LOG_PORT;
    const queue: string[] = [];
    let socket: net.Socket | undefined;
    let tries = 0;
    const connect = () => {
      const port = portRaw ? parseInt(portRaw, 10) : NaN;
      if (!portRaw || Number.isNaN(port)) return; // no env => only console
      try {
        const s = net.createConnection({ host: '127.0.0.1', port }, () => {
          socket = s;
          // flush queued
          while (queue.length) {
            const line = queue.shift();
            if (typeof line === 'string') {
              try { s.write(line + '\n'); } catch { /* ignore */ }
            }
          }
        });
        s.on('error', () => {
          socket = undefined;
          if (tries < 5) {
            tries++;
            setTimeout(connect, 300 * tries);
          }
        });
        s.on('close', () => {
          socket = undefined;
        });
      } catch {
        if (tries < 5) {
          tries++;
          setTimeout(connect, 300 * tries);
        }
      }
    };
    connect();
    mcpLogger = (msg: string) => {
      safeStderr(msg);
      if (socket && socket.writable) {
        try { socket.write(msg + '\n'); } catch { /* ignore */ }
      } else {
        queue.push(msg);
      }
    };
  })();

  try {
    mcpLogger(`[i18n-codelens MCP] __dirname: ${__dirname}`);
    mcpLogger(`[i18n-codelens MCP] process.cwd(): ${process.cwd()}`);
    mcpLogger(`[i18n-codelens MCP] node=${process.version} platform=${process.platform} arch=${process.arch} pid=${process.pid}`);
    mcpLogger(`[i18n-codelens MCP] env.WORKSPACE_ROOT: ${process.env.WORKSPACE_ROOT ?? '(unset)'}`);
    mcpLogger(`[i18n-codelens MCP] getWorkspaceRoot(): ${getWorkspaceRoot()}`);
    const eff = getEffectiveConfigFromEnv(process.env);
    mcpLogger(`[i18n-codelens MCP] config: resourceGlob='${eff.resourceGlob}', codeGlob='${eff.codeGlob}', ignoreGlobs=[${eff.ignoreGlobs.join(', ')}]`);
    if (process.env.I18N_CODE_REGEX) {
      mcpLogger(`[i18n-codelens MCP] config: codeRegex='${process.env.I18N_CODE_REGEX}'`);
    }
    mcpLogger(`[i18n-codelens MCP] strategies: structure='${eff.structurePreference}', insertOrder='${eff.insertOrderStrategy}'`);
  } catch {/* ignore */ }

  const server = new Server({ name: 'i18n-codelens-mcp', version: '0.1.0' }, {
    capabilities: { tools: { listChanged: true } }
  });

  // Provide tools list
  const tools = [
    {
      name: 'i18n_list_locales',
      description: 'Returns all detected locale resource files with normalized locale tags and human-friendly descriptions.',
      inputSchema: {
        type: 'object',
        properties: {
          workspaceDir: { type: 'string', description: 'Optional workspace root directory to scan. Defaults to CLI arg/WORKSPACE_ROOT/process.cwd().' }
        },
        additionalProperties: false
      }
    },
    {
      name: 'i18n_check_keys',
      description: 'Accepts an array of translation keys and responds with `{ key: { <locale-file>: true|false } }`. Keys ending with a dot are treated as namespace prefixes.',
      inputSchema: {
        type: 'object',
        properties: {
          keys: { type: 'array', items: { type: 'string' }, minItems: 1 },
          workspaceDir: { type: 'string', description: 'Optional workspace root directory to scan. Defaults to CLI arg/WORKSPACE_ROOT/process.cwd().' }
        },
        required: ['keys']
      }
    },
    {
      name: 'i18n_get_translations',
      description: 'Fetch existing translations for specific keys and locales.',
      inputSchema: {
        type: 'object',
        properties: {
          keys: { type: 'array', items: { type: 'string' }, minItems: 1 },
          locales: { type: 'array', items: { type: 'string' } },
          workspaceDir: { type: 'string', description: 'Optional workspace root directory to scan. Defaults to CLI arg/WORKSPACE_ROOT/process.cwd().' }
        },
        required: ['keys']
      }
    },
    {
      name: 'i18n_upsert_translations',
      description: 'Bulk upsert translations (no MT). Call `i18n_list_locales` to discover available locale identifiers, then pass those normalized tags (e.g. `en`, `tr-TR`) as keys inside the `values` map.',
      inputSchema: {
        type: 'object',
        properties: {
          entries: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                key: { type: 'string' },
                values: { type: 'object', additionalProperties: { type: 'string' } }
              },
              required: ['key', 'values']
            }
          },
          dryRun: { type: 'boolean' },
          workspaceDir: { type: 'string', description: 'Optional workspace root directory to scan. Defaults to CLI arg/WORKSPACE_ROOT/process.cwd().' }
        },
        required: ['entries']
      }
    },
    {
      name: 'i18n_delete_key',
      description: 'Remove a key from selected locale files. Honors flat/nested structure automatically.',
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          locales: { type: 'array', items: { type: 'string' } },
          dryRun: { type: 'boolean' },
          workspaceDir: { type: 'string', description: 'Optional workspace root directory to scan. Defaults to CLI arg/WORKSPACE_ROOT/process.cwd().' }
        },
        required: ['key']
      }
    },
    {
      name: 'i18n_diff_locales',
      description: 'Compare base locale keys against one or more locales, highlighting missing, extra, and placeholder differences.',
      inputSchema: {
        type: 'object',
        properties: {
          base: { type: 'string' },
          compare: { type: 'array', items: { type: 'string' }, minItems: 1 },
          workspaceDir: { type: 'string', description: 'Optional workspace root directory to scan. Defaults to CLI arg/WORKSPACE_ROOT/process.cwd().' }
        },
        required: ['base', 'compare']
      }
    },
    {
      name: 'i18n_scan_workspace_missing',
      description: 'Scan the workspace for keys referenced in code but missing from at least one locale resource file.',
      inputSchema: {
        type: 'object',
        properties: {
          workspaceDir: { type: 'string', description: 'Optional workspace root directory to scan. Defaults to CLI arg/WORKSPACE_ROOT/process.cwd().' }
        },
        additionalProperties: false
      }
    },
    {
      name: 'i18n_key_references',
      description: 'Surface non-locale code references for each key. Returns `{ key: { total, references: [{ filePath, line, column }] } }`, respecting the optional `limit` (1-25).',
      inputSchema: {
        type: 'object',
        properties: {
          keys: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1
          },
          limit: {
            type: 'number',
            minimum: 1,
            maximum: 25
          },
          workspaceDir: { type: 'string', description: 'Optional workspace root directory to scan. Defaults to CLI arg/WORKSPACE_ROOT/process.cwd().' }
        },
        required: ['keys']
      }
    },
    {
      name: 'i18n_rename_key',
      description: 'Rename a translation key across selected locales with optional dry-run support.',
      inputSchema: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          locales: { type: 'array', items: { type: 'string' } },
          dryRun: { type: 'boolean' },
          workspaceDir: { type: 'string', description: 'Optional workspace root directory to scan. Defaults to CLI arg/WORKSPACE_ROOT/process.cwd().' }
        },
        required: ['from', 'to']
      }
    },
    {
      name: 'i18n_move_namespace',
      description: 'Move an entire key namespace (prefix) to a new location for selected locales.',
      inputSchema: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          locales: { type: 'array', items: { type: 'string' } },
          dryRun: { type: 'boolean' },
          workspaceDir: { type: 'string', description: 'Optional workspace root directory to scan. Defaults to CLI arg/WORKSPACE_ROOT/process.cwd().' }
        },
        required: ['from', 'to']
      }
    },
    {
      name: 'i18n_validate_placeholders',
      description: 'Validate placeholder parity across locales for the provided keys (or all keys when omitted).',
      inputSchema: {
        type: 'object',
        properties: {
          keys: { type: 'array', items: { type: 'string' } },
          locales: { type: 'array', items: { type: 'string' } },
          baseLocale: { type: 'string' },
          workspaceDir: { type: 'string', description: 'Optional workspace root directory to scan. Defaults to CLI arg/WORKSPACE_ROOT/process.cwd().' }
        },
        additionalProperties: false
      }
    }
  ];

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
    const name: string = request.params.name;
    const args: any = request.params.arguments || {};
    const started = Date.now();
    try {
      const argSummary = (() => {
        try {
          switch (name) {
            case 'i18n_check_keys': return `keys=${(args.keys || []).length}`;
            case 'i18n_get_translations': return `keys=${(args.keys || []).length}, locales=${(args.locales || []).length}`;
            case 'i18n_upsert_translations': return `entries=${(args.entries || []).length}, dryRun=${Boolean(args.dryRun)}`;
            case 'i18n_delete_key': return `key='${args.key}', locales=${(args.locales || []).length}, dryRun=${Boolean(args.dryRun)}`;
            case 'i18n_diff_locales': return `base='${args.base}', compare=${(args.compare || []).length}`;
            case 'i18n_key_references': return `keys=${(args.keys || []).length}, limit=${args.limit ?? 'unset'}`;
            case 'i18n_rename_key': return `from='${args.from}', to='${args.to}', locales=${(args.locales || []).length}, dryRun=${Boolean(args.dryRun)}`;
            case 'i18n_move_namespace': return `from='${args.from}', to='${args.to}', locales=${(args.locales || []).length}, dryRun=${Boolean(args.dryRun)}`;
            case 'i18n_untranslated_keys_on_page': return `filePath='${args.filePath}'`;
            case 'i18n_validate_placeholders': return `keys=${(args.keys || []).length}, locales=${(args.locales || []).length}, baseLocale='${args.baseLocale ?? '(auto)'}'`;
            default: return '';
          }
        } catch { return ''; }
      })();
      mcpLogger(`[i18n-codelens MCP] tool.start name=${name}${argSummary ? ' ' + argSummary : ''}`);

      if (name === 'i18n_list_locales') {
        const result = await toolListLocales(args);
        try { mcpLogger(`[i18n-codelens MCP] tool.ok name=${name} locales=${result.locales.length} (${Date.now() - started}ms)`); } catch { /* ignore */ }
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }
      if (name === 'i18n_check_keys') {
        const result = await toolCheckKeys(args);
        try { mcpLogger(`[i18n-codelens MCP] tool.ok name=${name} keys=${Object.keys(result).length} (${Date.now() - started}ms)`); } catch { /* ignore */ }
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }
      if (name === 'i18n_get_translations') {
        const result = await toolGetTranslations(args);
        try { mcpLogger(`[i18n-codelens MCP] tool.ok name=${name} keys=${(args.keys || []).length}, locales=${result.locales.length} (${Date.now() - started}ms)`); } catch { /* ignore */ }
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }
      if (name === 'i18n_upsert_translations') {
        const result = await toolUpsertTranslations(args);
        try { const s = result.summary; mcpLogger(`[i18n-codelens MCP] tool.ok name=${name} created=${s.created} updated=${s.updated} unchanged=${s.unchanged} errors=${s.errors} (${Date.now() - started}ms)`); } catch { /* ignore */ }
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }
      if (name === 'i18n_delete_key') {
        const result = await toolDeleteKey(args);
        try { mcpLogger(`[i18n-codelens MCP] tool.ok name=${name} deletedFrom=${result.deletedFrom.length} (${Date.now() - started}ms)`); } catch { /* ignore */ }
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }
      if (name === 'i18n_diff_locales') {
        const result = await toolDiffLocales(args);
        try { mcpLogger(`[i18n-codelens MCP] tool.ok name=${name} comparisons=${result.comparisons.length} (${Date.now() - started}ms)`); } catch { /* ignore */ }
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }
      if (name === 'i18n_scan_workspace_missing') {
        const result = await toolScanWorkspaceMissing(args);
        try { mcpLogger(`[i18n-codelens MCP] tool.ok name=${name} totalMissing=${result.totalMissing} (${Date.now() - started}ms)`); } catch { /* ignore */ }
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }
      if (name === 'i18n_untranslated_keys_on_page') {
        const keys = await toolUntranslatedKeysOnPage(args);
        try { mcpLogger(`[i18n-codelens MCP] tool.ok name=${name} keys=${keys.length} (${Date.now() - started}ms)`); } catch { /* ignore */ }
        return { content: [{ type: 'text', text: JSON.stringify({ keys }) }] };
      }
      if (name === 'i18n_key_references') {
        const result = await toolKeyReferences(args);
        try { const totals = Object.values(result).reduce((a: any, b: any) => a + (b?.total ?? 0), 0); mcpLogger(`[i18n-codelens MCP] tool.ok name=${name} keys=${(args.keys || []).length} refs=${totals} (${Date.now() - started}ms)`); } catch { /* ignore */ }
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }
      if (name === 'i18n_rename_key') {
        const result = await toolRenameKey(args);
        try { const s = result.summary; mcpLogger(`[i18n-codelens MCP] tool.ok name=${name} renamed=${s.renamed} skipped=${s.skipped} errors=${s.errors} (${Date.now() - started}ms)`); } catch { /* ignore */ }
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }
      if (name === 'i18n_move_namespace') {
        const result = await toolMoveNamespace(args);
        try { const s = result.summary; mcpLogger(`[i18n-codelens MCP] tool.ok name=${name} moved=${s.moved} skipped=${s.skipped} errors=${s.errors} (${Date.now() - started}ms)`); } catch { /* ignore */ }
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }
      if (name === 'i18n_validate_placeholders') {
        const result = await toolValidatePlaceholders(args);
        try { mcpLogger(`[i18n-codelens MCP] tool.ok name=${name} base=${result.baseLocale} mismatches=${result.mismatches.length} (${Date.now() - started}ms)`); } catch { /* ignore */ }
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }
      try { mcpLogger(`[i18n-codelens MCP] tool.unknown name=${name} (${Date.now() - started}ms)`); } catch { /* ignore */ }
      return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
    } catch (err: any) {
      try { mcpLogger(`[i18n-codelens MCP] tool.error name=${name} (${Date.now() - started}ms) message=${err?.message || String(err)} stack=${err?.stack ? ('' + err.stack).split('\n')[0] : '(no-stack)'}`); } catch { /* ignore */ }
      return { content: [{ type: 'text', text: `Error: ${err?.message || String(err)}` }], isError: true };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  try { mcpLogger('[i18n-codelens MCP] server connected (stdio)'); } catch { /* ignore */ }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();
