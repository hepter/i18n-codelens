import { debounce } from 'lodash';
import { IMinimatch, Minimatch } from 'minimatch';
import * as path from 'path';
import * as vscode from 'vscode';
import * as fs from 'fs';
import ignore from 'ignore';
import { extensionName, settings } from './constants';
import { Logger } from './Utils';

const excludePattern = "**/node_modules/**";

export type ResourceItem = {
	uri: vscode.Uri,
	fileName: string
	keyValuePairs: { [key: string]: string }
};

export default class SettingUtils implements vscode.Disposable {
	private static _instance: SettingUtils;
	private static _onDidChangeResourceLocations = new vscode.EventEmitter<Map<string, vscode.Location[]>>();
	private static _onDidChangeResource = new vscode.EventEmitter<ResourceItem[]>();
	private static _onDidLoad = new vscode.EventEmitter<vscode.Disposable[]>();
	private static disposables: vscode.Disposable[] = [];

	private globPattern!: string;
	private mm!: IMinimatch;
	private codeRegex!: RegExp;
	private resourceDefinitionLocations = new Map<string, vscode.Location[]>();
	private languageResourcesFilesCache: ResourceItem[] = [];
	private initialLoadDone: boolean;
	private resourceLineRegex = /(?<=["'])(?<key>[\w\d\- _.]+?)(?=["'])/g;
	private codeFileRegex = /^(.(?!.*node_modules))*\.(jsx?|tsx?)$/;
	private gitIgnore!: ignore.Ignore;

	public static readonly fireDebouncedOnDidChangeResourceLocations = debounce((...args) => SettingUtils._onDidChangeResourceLocations.fire(...args), 500);
	public static readonly fireDebouncedOnDidChangeResource = debounce((...args) => SettingUtils._onDidChangeResource.fire(...args), 500);


	public static readonly onDidChangeResourceLocations = this._onDidChangeResourceLocations.event;
	public static readonly onDidChangeResource = this._onDidChangeResource.event;
	public static readonly onDidLoad = this._onDidLoad.event;

	private loadGitignore() {
		const folders = vscode.workspace.workspaceFolders;
		if (!folders?.length) {
			this.gitIgnore = ignore();
			return;
		}

		const root = folders[0].uri.fsPath;
		const giPath = path.join(root, '.gitignore');
		try {
			const content = fs.readFileSync(giPath, 'utf8');
			this.gitIgnore = ignore().add(content);
			Logger.info(`Loaded ${(this.gitIgnore as any)._rules?._rules?.length} rules from .gitignore`);
		} catch {
			this.gitIgnore = ignore();
			Logger.info('ℹ️ .gitignore not found, no rules loaded');
		}
	}
	private watchGitignore() {
		const folders = vscode.workspace.workspaceFolders;
		if (!folders?.length) return;

		const root = folders[0].uri.fsPath;
		const giPath = path.join(root, '.gitignore');
		try {
			const watcher = fs.watch(giPath, () => {
				Logger.info('♻️ .gitignore changed, reloading...');
				this.loadGitignore();
			});
			SettingUtils.disposables.push({ dispose: () => watcher.close() });
		} catch {
			Logger.info('ℹ️ .gitignore watcher could not be established (file not found or inaccessible)');
		}
	}


	public static getInstance(reload = false): SettingUtils {
		if (!this._instance || reload) {
			this._instance?.dispose();
			this._instance = new SettingUtils();
		}
		return this._instance;
	}
	private constructor() {
		this.initialLoadDone = false;
	}

	public async initialize() {
		try {
			Logger.info("i18n CodeLens initializing...");
			this.initialLoadDone = false;

			this.loadGitignore();
			this.watchGitignore();

			Logger.info("Reading configuration settings...");
			this.readAndListenConfigs();
			this.refreshGlobFromConfig();
			this.refreshRegexFromConfig();
			this.refreshCodeFileRegexFromConfig();
			Logger.info("Configuration settings loaded successfully");

			Logger.info("Starting file scanning and monitoring...");
			await this.readAndListenFiles();
			Logger.info("File scanning and monitoring setup completed");

			this.initialLoadDone = true;

			Logger.info("i18n CodeLens initialization completed successfully!");
			SettingUtils._onDidLoad.fire(SettingUtils.disposables);
		} catch (error) {
			Logger.showCriticalError("during i18n CodeLens initialization:", error);
			vscode.window.showErrorMessage(
				`i18n CodeLens failed to initialize: ${error instanceof Error ? error.message : String(error)}. Check output panel for details.`
			);
			throw error; // Re-throw to indicate initialization failure
		}
	}

	private readAndListenConfigs() {
		try {
			Logger.info("Refreshing glob pattern from config...");
			this.refreshGlobFromConfig();

			Logger.info("Refreshing regex pattern from config...");
			this.refreshRegexFromConfig();

			Logger.info("Setting up configuration change listeners...");
			vscode.workspace.onDidChangeConfiguration(async (e) => {
				try {
					let isChanged = false;
					if (e.affectsConfiguration(settings.globPattern)) {
						Logger.info("Glob pattern configuration changed, refreshing...");
						this.refreshGlobFromConfig();
						await this.refreshResourceFromFiles(true);
						await this.findAllResourceReferencesFromJson();
						isChanged = true;
					} else if (e.affectsConfiguration(settings.resourceRegex)) {
						Logger.info("Resource regex configuration changed, refreshing...");
						this.refreshRegexFromConfig();
						await this.findAllResourceReferencesFromCodeFiles();
						isChanged = true;
					}

					if (isChanged) {
						Logger.info("Configuration changes applied successfully!");
					}
				} catch (error) {
					Logger.error("ERROR applying configuration changes:", error);
					vscode.window.showErrorMessage(`Failed to apply configuration changes: ${error instanceof Error ? error.message : String(error)}`);
				}
			}, null, SettingUtils.disposables);
		} catch (error) {
			Logger.showCriticalError("in readAndListenConfigs:", error);
			throw error;
		}
	}


	private refreshGlobFromConfig() {
		try {
			const configValue = vscode.workspace.getConfiguration(extensionName).get(settings.globPattern, "**/locales/*.json");
			Logger.info(`Setting glob pattern: ${configValue}`);
			this.globPattern = configValue;
			this.mm = new Minimatch(this.globPattern);
		} catch (error) {
			Logger.error("ERROR refreshing glob from config:", error);
			// Use default values on error
			this.globPattern = "**/locales/*.json";
			this.mm = new Minimatch(this.globPattern);
			vscode.window.showWarningMessage("Failed to load glob pattern config, using default.");
		}
	}

	private refreshRegexFromConfig = () => {
		try {
			const rx = vscode.workspace.getConfiguration(extensionName).get(settings.resourceRegex, "");
			Logger.info(`Setting resource regex: ${rx}`);
			this.codeRegex = new RegExp(rx, "g");

		} catch (error) {
			Logger.error("ERROR refreshing regex from config:", error);
			// Use default regex on error
			this.codeRegex = /(?<=\/\*\*\s*?@i18n\s*?\*\/\s*?["']|\W[tT]\(\s*["'])(?<key>[A-Za-z0-9 .-]+?)(?=["'])/g;
			vscode.window.showWarningMessage("Failed to load regex config, using default.");
		}
	}
	private refreshCodeFileRegexFromConfig() {
		try {
			const configValue = vscode.workspace.getConfiguration(extensionName).get(settings.codeFileRegex, "\\.(jsx?|tsx?)$");
			Logger.info(`Setting code file regex: ${configValue}`);
			this.codeFileRegex = new RegExp(configValue);
		} catch (error) {
			Logger.error("ERROR refreshing code file regex from config:", error);
			// Use default regex on error
			this.codeFileRegex = /\.(jsx?|tsx?)$/;
			vscode.window.showWarningMessage("Failed to load code file regex config, using default.");
		}
	}
	private async refreshResourceFromFiles(noCache = false) {
		try {
			Logger.info(`Scanning for resource files with pattern: ${this.globPattern}`);
			const vscodeUriList = await vscode.workspace.findFiles(this.globPattern, excludePattern);
			Logger.info(`Found ${vscodeUriList.length} resource files`);

			if (noCache) {
				Logger.info("Clearing resource cache");
				this.languageResourcesFilesCache = [];
			}

			await Promise.all(vscodeUriList.map(uri => this.insertOrUpdateResourceByUri(uri)));
			Logger.info(`Successfully processed ${vscodeUriList.length} resource files`);
		} catch (error) {
			Logger.error("ERROR refreshing resources from files:", error);
			throw error;
		}
	}

	private async insertOrUpdateResourceByUri(fileUri: vscode.Uri, isDelete?: boolean) {
		try {
			if (isDelete) {
				const fileName = path.parse(fileUri.fsPath).name;
				Logger.info(`Removing resource file from cache: ${fileName}`);
				this.languageResourcesFilesCache = this.languageResourcesFilesCache.filter(r => r.uri.fsPath !== fileUri.fsPath);
				return;
			}

			const filePath = path.parse(fileUri.fsPath);
			Logger.info(`Processing resource file: ${filePath.name}`);

			const data = (await vscode.workspace.fs.readFile(fileUri)).toString();
			const keyValuePairs = JSON.parse(data);

			if (!keyValuePairs || typeof keyValuePairs !== 'object') {
				const errorMsg = `${filePath.name} is not a valid JSON object and will be ignored!`;
				Logger.warn(`${errorMsg}`);
				vscode.window.showWarningMessage(errorMsg);
				return;
			}

			const keyCount = Object.keys(keyValuePairs).length;
			Logger.info(`Found ${keyCount} translation keys in ${filePath.name}`);

			const newResource: ResourceItem = ({
				uri: fileUri,
				fileName: filePath.name,
				keyValuePairs
			});

			const matchedResource = this.languageResourcesFilesCache.find(res => res.uri.fsPath === newResource.uri.fsPath);
			if (matchedResource) {
				Logger.info(`Updating existing resource: ${filePath.name}`);
				matchedResource.keyValuePairs = newResource.keyValuePairs;
			} else {
				Logger.info(`Adding new resource: ${filePath.name}`);
				this.languageResourcesFilesCache.push(newResource);
			}

			if (this.initialLoadDone) {
				SettingUtils.fireDebouncedOnDidChangeResource(this.languageResourcesFilesCache);
			}
		} catch (error) {
			const fileName = path.parse(fileUri.fsPath).name;
			if (error instanceof SyntaxError) {
				Logger.error(`JSON parse error in ${fileName}:`, error.message);
				vscode.window.showErrorMessage(`Invalid JSON in ${fileName}: ${error.message}`);
			} else {
				Logger.error(`ERROR processing resource file ${fileName}:`, error);
				vscode.window.showErrorMessage(`Failed to process ${fileName}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
	}

	private async readAndListenFiles() {
		try {
			Logger.info("Starting parallel file processing...");
			await Promise.all([
				this.readAndListenResourceFiles(),
				this.readAndListenCodeFiles()
			]);
			Logger.info("File processing completed successfully");
		} catch (error) {
			Logger.showCriticalError("in readAndListenFiles:", error);
			throw error;
		}
	}

	private async readAndListenResourceFiles() {
		try {
			Logger.info("Loading resource files...");
			await this.refreshResourceFromFiles();

			Logger.info("Finding resource references in JSON files...");
			await this.findAllResourceReferencesFromJson();

			Logger.info("Setting up resource file watchers...");
			const watcher = vscode.workspace.createFileSystemWatcher(this.globPattern);
			const watcherHandler = (type: "change" | "create" | "delete") => async (e: vscode.Uri) => {
				try {
					const file = path.parse(e.fsPath);
					Logger.info(`Resource file '${file.name}' was affected by '${type}' event`);

					await this.insertOrUpdateResourceByUri(e, type === "delete");

					if (type === "delete") {
						this.removeLocationsByUri(e);
					}
					else if (type === "change") {
						this.removeLocationsByUri(e);
						await this.updateLocationsFromResourceFile(e);
					}
					else if (type === "create") {
						await this.updateLocationsFromResourceFile(e);
					}
				} catch (error) {
					Logger.error(`ERROR handling ${type} event for resource file:`, error);
					vscode.window.showWarningMessage(`Failed to handle file ${type} event: ${error instanceof Error ? error.message : String(error)}`);
				}
			};

			watcher.onDidChange(watcherHandler("change"), null, SettingUtils.disposables);
			watcher.onDidCreate(watcherHandler("create"), null, SettingUtils.disposables);
			watcher.onDidDelete(watcherHandler("delete"), null, SettingUtils.disposables);

			SettingUtils.disposables.push(watcher);
			Logger.info("Resource file monitoring setup completed");
		} catch (error) {
			Logger.showCriticalError("in readAndListenResourceFiles:", error);
			throw error;
		}
	}

	private async readAndListenCodeFiles() {
		try {
			Logger.info("Finding resource references in code files...");
			await this.findAllResourceReferencesFromCodeFiles();

			Logger.info("Setting up code file watchers...");
			const watcher = vscode.workspace.createFileSystemWatcher("**/*.{ts,tsx,js,jsx}");
			const watcherHandler = (type: string) => async (e: vscode.Uri) => {
				try {
					if (/^(.(?!.*node_modules))*\.(jsx?|tsx?)$/.test(e.fsPath)) {
						const fileName = path.basename(e.fsPath);
						Logger.info(`Code file '${fileName}' was affected by '${type}' event`);

						if (type === "delete") {
							this.removeLocationsByUri(e);
						}
						else if (type === "create") {
							await this.updateLocationsFromCacheByCodeUri(e);
						}
						else if (type === "change") {
							this.removeLocationsByUri(e);
							await this.updateLocationsFromCacheByCodeUri(e);
						}
					}
				} catch (error) {
					Logger.error(`ERROR handling ${type} event for code file:`, error);
				}
			};

			watcher.onDidChange(watcherHandler("change"), null, SettingUtils.disposables);
			watcher.onDidCreate(watcherHandler("create"), null, SettingUtils.disposables);
			watcher.onDidDelete(watcherHandler("delete"), null, SettingUtils.disposables);

			SettingUtils.disposables.push(watcher);
			Logger.info("Code file monitoring setup completed");
		} catch (error) {
			Logger.showCriticalError("in readAndListenCodeFiles:", error);
			throw error;
		}
	}

	private async findAllResourceReferencesFromJson() {
		try {
			Logger.info(`Scanning ${this.languageResourcesFilesCache.length} resource files for references...`);
			await Promise.all(this.languageResourcesFilesCache.map(res => this.updateLocationsFromResourceFile(res.uri)));
			Logger.info("Resource file reference scanning completed");
		} catch (error) {
			Logger.error("ERROR finding resource references from JSON:", error);
			throw error;
		}
	}

	private async findAllResourceReferencesFromCodeFiles() {
		const allFiles = await vscode.workspace.findFiles("**/*.{ts,tsx,js,jsx}", excludePattern);
		const root = vscode.workspace.workspaceFolders![0].uri.fsPath;

		const codeFiles = allFiles.filter(uri => {
			const rel = path.relative(root, uri.fsPath);
			return !this.gitIgnore.ignores(rel);
		});

		await Promise.all(codeFiles.map(uri => this.updateLocationsFromCacheByCodeUri(uri)));
	}

	private async updateLocationsFromCacheByCodeUri(fileUri: vscode.Uri) {
		try {
			const text = (await vscode.workspace.fs.readFile(fileUri)).toString();
			const lines = text.split(/\r?\n/);
			const regex = SettingUtils.getResourceCodeRegex();
			let totalFound = 0;

			for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
				const line = lines[lineNumber];
				let match: RegExpExecArray | null;
				while ((match = regex.exec(line)) !== null) {
					const key = match.groups?.key ?? match[0];
					const start = match.index!;
					const end = start + key.length;

					const locs = this.resourceDefinitionLocations.get(key) || [];
					locs.push(new vscode.Location(
						fileUri,
						new vscode.Range(
							new vscode.Position(lineNumber, start),
							new vscode.Position(lineNumber, end)
						)
					));
					this.resourceDefinitionLocations.set(key, locs);

					totalFound++;
				}
				regex.lastIndex = 0;
			}

			if (totalFound) {
				Logger.info(`Found ${totalFound} key(s) in ${path.basename(fileUri.fsPath)}.`);
				if (this.initialLoadDone) {
					SettingUtils.fireDebouncedOnDidChangeResourceLocations(this.resourceDefinitionLocations);
				}
			}
		} catch (err) {
			Logger.error(`Error parsing ${path.basename(fileUri.fsPath)}:`, err);
		}
	}

	private removeLocationsByUri(uri: vscode.Uri) {
		let isRemovedKey = false;
		for (const [key, value] of this.resourceDefinitionLocations) {
			const newValue = value.filter(v => v.uri.fsPath !== uri.fsPath);
			if (newValue.length != value.length) {
				this.resourceDefinitionLocations.set(key, newValue);
				isRemovedKey = true;
			}
		}
		if (isRemovedKey && this.initialLoadDone) {
			SettingUtils.fireDebouncedOnDidChangeResourceLocations(this.resourceDefinitionLocations);
		}
	}

	private async updateLocationsFromResourceFile(fileUri: vscode.Uri): Promise<void> {
		const fileName = path.basename(fileUri.fsPath);
		Logger.info(`Scanning JSON resource file: ${fileName}`);

		try {
			// 1. Read file contents as string
			const fileBuffer = await vscode.workspace.fs.readFile(fileUri);
			const text = fileBuffer.toString();

			// 2. Split into lines for per-line regex matching
			const lines = text.split(/\r?\n/);

			// 3. Obtain a fresh global regex with named group "key"
			const regex = SettingUtils.getResourceLineRegex(); // assumed to be /(?<key>...)/g

			let totalFound = 0;

			// 4. Iterate each line and use exec loop to find all matches
			for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
				const line = lines[lineNumber];
				let match: RegExpExecArray | null;

				// Loop until exec() returns null (no more matches in this line)
				while ((match = regex.exec(line)) !== null) {
					// Prefer named group "key", otherwise fallback to whole match
					const key = match.groups?.key ?? match[0];
					const startIndex = match.index!;
					const endIndex = startIndex + key.length;

					// Build a Location for this key occurrence
					const location = new vscode.Location(
						fileUri,
						new vscode.Range(
							new vscode.Position(lineNumber, startIndex),
							new vscode.Position(lineNumber, endIndex)
						)
					);

					// Append to our map of definitions
					const existing = this.resourceDefinitionLocations.get(key) || [];
					existing.push(location);
					this.resourceDefinitionLocations.set(key, existing);

					totalFound++;
				}

				// Reset lastIndex so the regex will start fresh on next line
				regex.lastIndex = 0;
			}


			// 5. Summary log and event firing if any keys were found
			if (totalFound > 0) {
				Logger.info(`${fileName}: ${totalFound} total key(s) located`);
				if (this.initialLoadDone) {
					Logger.info(`Emitting onDidChangeResourceLocations event`);
					SettingUtils.fireDebouncedOnDidChangeResourceLocations(this.resourceDefinitionLocations);
				}
			} else {
				Logger.info(`${fileName}: no keys found`);
			}
		} catch (error) {
			Logger.error(`Error scanning ${fileName}:`, error);
		}
	}


	// Static methods

	static getResources(): ResourceItem[] {
		return this._instance.languageResourcesFilesCache;
	}

	static isResourceFilePath(path: string): boolean {
		return this._instance.mm.match(path || "");
	}
	static isCodeFilePath(path: string): boolean {
		const relativePath = vscode.workspace.asRelativePath(path);
		if (this._instance.gitIgnore.ignores(relativePath)) {
			return false;
		}
		const match = this._instance.codeFileRegex.exec(path);
		this._instance.codeFileRegex.lastIndex = 0;
		return !!match;
	}

	static isEnabledCodeDecorator(): boolean {
		const value = vscode.workspace.getConfiguration(extensionName).get(settings.underlineDecorator, true);
		return value;
	}
	static isEnabledCodeLens(): boolean {
		const value = vscode.workspace.getConfiguration(extensionName).get(settings.codeLens, true);
		return value;
	}

	static isEnabledAutoSave(): boolean {
		const value = vscode.workspace.getConfiguration(extensionName).get(settings.autoSave, true);
		return value;
	}

	static isEnabledAutoFocus(): boolean {
		const value = vscode.workspace.getConfiguration(extensionName).get(settings.autoFocus, false);
		return value;
	}
	static isRevealTreeView(): boolean {
		const value = vscode.workspace.getConfiguration(extensionName).get(settings.revealTreeView, false);
		return value;
	}
	static getResourceCodeMatch(str: string): RegExpExecArray | null {
		const match = this._instance.codeRegex.exec(str);
		this._instance.codeRegex.lastIndex = 0;
		return match;
	}
	static getResourceLineMatch(str: string): RegExpExecArray | null {
		const match = this._instance.resourceLineRegex.exec(str);
		this._instance.resourceLineRegex.lastIndex = 0;
		return match;
	}
	static getResourceCodeRegex(): RegExp {
		return new RegExp(this._instance.codeRegex);
	}
	static getResourceLineRegex(): RegExp {
		return new RegExp(this._instance.resourceLineRegex);
	}
	static getResourceLocationsByKey(key: string): vscode.Location[] {
		return this._instance.resourceDefinitionLocations.get(key) || [];
	}
	static getResourceKeysByUri(uri: vscode.Uri): { [key: string]: vscode.Location[] | null } {
		const matchedKeyLocPair: { [key: string]: vscode.Location[] | null } = {};
		for (const [key, locations] of this._instance.resourceDefinitionLocations) {
			for (const location of locations) {
				if (location.uri.fsPath === uri.fsPath) {
					const locs = matchedKeyLocPair?.[key] || [];
					locs.push(location);
					matchedKeyLocPair[key] = locs;
				}
			}
		}

		return matchedKeyLocPair;
	}

	static getAllResourceKeysFromDocument(document: vscode.TextDocument): string[] {
		try {
			const resourceKeys = new Set<string>();
			const text = document.getText();
			const resourceRegex = this.getResourceCodeRegex();

			let match;
			while ((match = resourceRegex.exec(text)) !== null) {
				if (match[0]) {
					resourceKeys.add(match[0]);
				}
			}

			return Array.from(resourceKeys);
		} catch (error) {
			Logger.error("ERROR in getAllResourceKeysFromDocument:", error);
			return [];
		}
	}

	dispose() {
		SettingUtils.disposables.forEach(d => d.dispose());
		SettingUtils.disposables = [];
	}
}
