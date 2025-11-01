// Use dynamic requires to remain compatible with older TypeScript/Node resolution
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
// zod no longer required for low-level usage
import path from 'path';
import fs from 'fs';
import {
  readResourceFiles,
  getWorkspaceRoot,
  loadJson,
  setNestedValue,
  deleteNestedKey,
  writeFilePretty,
  findUntranslatedKeysInFile,
  findKeyReferences,
} from './i18nFs';

type PresenceResult = Record<string, Record<string, boolean>>; // key -> { langFile: exists }

async function ensureResources() {
  const resources = await readResourceFiles();
  if (resources.length === 0) {
    throw new Error('No i18n resource files found. Adjust WORKSPACE_ROOT or I18N_GLOB.');
  }
  return resources;
}

async function toolCheckKeys(keys: string[]): Promise<PresenceResult> {
  const resources = await ensureResources();
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

async function toolUntranslatedKeysOnPage(filePath: string): Promise<string[]> {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(getWorkspaceRoot(), filePath);
  if (!fs.existsSync(abs)) throw new Error(`File not found: ${abs}`);

  const resources = await ensureResources();
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

async function toolTranslateUpsert(entries: Array<{ key: string; values: Record<string, string> }>): Promise<{ updated: number }> {
  const resources = await ensureResources();
  let updates = 0;
  for (const entry of entries) {
    for (const res of resources) {
      const value = entry.values[res.fileName];
      if (typeof value === 'undefined') continue; // skip if not provided for this language

      // Load original JSON (not flattened) and set nested key
      const json = loadJson(res.filePath);
      setNestedValue(json, entry.key, value);
      writeFilePretty(res.filePath, json);
      updates++;
    }
  }
  return { updated: updates };
}

async function toolDeleteKey(key: string): Promise<{ deletedFrom: string[] }> {
  const resources = await ensureResources();
  const touched: string[] = [];
  for (const res of resources) {
    const json = loadJson(res.filePath);
    // only write if key actually exists
    const before = JSON.stringify(json);
    deleteNestedKey(json, key);
    const after = JSON.stringify(json);
    if (before !== after) {
      writeFilePretty(res.filePath, json);
      touched.push(res.fileName);
    }
  }
  return { deletedFrom: touched };
}

async function toolKeyReferences(keys: string[], limit?: number) {
  const trimmedKeys = Array.from(new Set((keys || []).map(k => typeof k === 'string' ? k.trim() : '').filter(Boolean)));
  if (!trimmedKeys.length) {
    throw new Error('keys array must contain at least one non-empty string');
  }

  const resources = await ensureResources();
  const resourcePaths = new Set(resources.map(res => res.filePath));
  const maxPerKey = Math.min(Math.max(limit ?? 25, 1), 25);

  return findKeyReferences(trimmedKeys, resourcePaths, maxPerKey);
}

async function main() {
  const server = new Server({ name: 'i18n-codelens-mcp', version: '0.1.0' }, {
    capabilities: { tools: { listChanged: true } }
  });

  // Provide tools list
  const tools = [
    {
      name: 'i18n_check_keys',
      description: 'Accepts an array of translation keys and responds with `{ key: { <locale-file>: true|false } }`. Keys ending with a dot are treated as namespace prefixes.',
      inputSchema: {
        type: 'object',
        properties: { keys: { type: 'array', items: { type: 'string' }, minItems: 1 } },
        required: ['keys']
      }
    },
    {
      name: 'i18n_untranslated_keys_on_page',
      description: 'Provide a workspace-relative or absolute `filePath`; returns `{ "keys": [ ... ] }` listing every resource key referenced in that file but missing in at least one locale.',
      inputSchema: {
        type: 'object',
        properties: { filePath: { type: 'string' } },
        required: ['filePath']
      }
    },
    {
      name: 'i18n_translate_upsert',
      description: 'Upsert translations in bulk. Pass `entries` where each item contains the `key` and a `values` map of locale file name to translation text. Only supplied locales are touched; existing structure (flat/nested) is preserved.',
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
          }
        },
        required: ['entries']
      }
    },
    {
      name: 'i18n_delete_key',
      description: 'Remove a key from every detected locale file. Nested translation trees are updated safely before writing back to disk.',
      inputSchema: {
        type: 'object',
        properties: { key: { type: 'string' } },
        required: ['key']
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
          }
        },
        required: ['keys']
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

    try {
      if (name === 'i18n_check_keys') {
        const result = await toolCheckKeys(args.keys || []);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }
      if (name === 'i18n_untranslated_keys_on_page') {
        const keys = await toolUntranslatedKeysOnPage(args.filePath);
        return { content: [{ type: 'text', text: JSON.stringify({ keys }) }] };
      }
      if (name === 'i18n_translate_upsert') {
        const result = await toolTranslateUpsert(args.entries || []);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }
      if (name === 'i18n_delete_key') {
        const result = await toolDeleteKey(args.key);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }
      if (name === 'i18n_key_references') {
        const result = await toolKeyReferences(args.keys || [], args.limit);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }
      return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Error: ${err?.message || String(err)}` }], isError: true };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();
