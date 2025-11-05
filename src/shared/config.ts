
export const DEFAULT_RESOURCE_GLOB = '**/locales/**/*.json';
export const DEFAULT_CODE_GLOB = '**/*.{ts,tsx,js,jsx}';
export const DEFAULT_IGNORE_GLOBS = ['**/node_modules/**'];
export const DEFAULT_CODE_REGEX_PATTERN = String.raw`(?<=\/\*\*\s*?@i18n\s*?\*\/\s*?["']|\W[tT]\(\s*["'])(?<key>[A-Za-z0-9 .-_]+?)(?=["'])`;

export type StructurePreference = 'auto' | 'flat' | 'nested';
export const DEFAULT_STRUCTURE_PREFERENCE: StructurePreference = 'auto';

export type InsertOrderStrategy = 'append' | 'nearby' | 'sort';
export const DEFAULT_INSERT_ORDER_STRATEGY: InsertOrderStrategy = 'nearby';

export function parseRegex(pattern: string): RegExp {
	if (!pattern) return new RegExp(DEFAULT_CODE_REGEX_PATTERN, 'g');
	if (pattern.startsWith('/') && pattern.lastIndexOf('/') > 0) {
		const lastSlash = pattern.lastIndexOf('/');
		const body = pattern.substring(1, lastSlash);
		const flags = pattern.substring(lastSlash + 1);
		const finalFlags = flags.includes('g') ? flags : `${flags}g`;
		return new RegExp(body, finalFlags);
	}
	return new RegExp(pattern, 'g');
}

export function buildCodeRegex(pattern?: string): RegExp {
	const source = (pattern && pattern.trim().length) ? pattern : DEFAULT_CODE_REGEX_PATTERN;
	return parseRegex(source);
}

export type EffectiveConfig = {
	resourceGlob: string;
	codeGlob: string;
	codeRegex: RegExp;
	ignoreGlobs: string[];
	structurePreference: StructurePreference;
	insertOrderStrategy: InsertOrderStrategy;
};

export function getEffectiveConfigFromEnv(env: NodeJS.ProcessEnv): EffectiveConfig {
	const resourceGlob = env.I18N_GLOB || DEFAULT_RESOURCE_GLOB;
	const codeGlob = env.I18N_CODE_GLOB || DEFAULT_CODE_GLOB;
	const codeRegex = buildCodeRegex(env.I18N_CODE_REGEX || DEFAULT_CODE_REGEX_PATTERN);
	const ignoreGlobs = parseIgnoreGlobs(env.I18N_IGNORE);
	const structurePreference = parseStructurePreference(env.I18N_STRUCTURE);
	const insertOrderStrategy = parseInsertOrderStrategy(env.I18N_INSERT_ORDER);
	return { resourceGlob, codeGlob, codeRegex, ignoreGlobs, structurePreference, insertOrderStrategy };
}

export function parseIgnoreGlobs(value?: string): string[] {
	if (!value) return [...DEFAULT_IGNORE_GLOBS];
	// Accept JSON array, comma or semicolon separated string
	try {
		const parsed = JSON.parse(value);
		if (Array.isArray(parsed) && parsed.every(v => typeof v === 'string')) return parsed as string[];
	} catch {/* ignore json parse errors */ }
	const parts = value.split(/[;,]/).map(s => s.trim()).filter(Boolean);
	return parts.length ? parts : [...DEFAULT_IGNORE_GLOBS];
}

export function parseStructurePreference(value?: string): StructurePreference {
	if (!value) return DEFAULT_STRUCTURE_PREFERENCE;
	const normalized = value.toLowerCase();
	if (normalized === 'flat' || normalized === 'nested' || normalized === 'auto') {
		return normalized;
	}
	return DEFAULT_STRUCTURE_PREFERENCE;
}

export function parseInsertOrderStrategy(value?: string): InsertOrderStrategy {
	if (!value) return DEFAULT_INSERT_ORDER_STRATEGY;
	const normalized = value.toLowerCase();
	if (normalized === 'append' || normalized === 'nearby' || normalized === 'sort') {
		return normalized;
	}
	return DEFAULT_INSERT_ORDER_STRATEGY;
}
