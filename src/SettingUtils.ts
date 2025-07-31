import { debounce } from 'lodash';
import { IMinimatch, Minimatch } from 'minimatch';
import * as path from 'path';
import * as vscode from 'vscode';
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
	private resourceLineRegex = /(?<=["'])(?<key>[\w\d\- _.]+?)(?=["'])/;
	private codeFileRegex = /^(.(?!.*node_modules))*\.(jsx?|tsx?)$/;

	public static readonly fireDebouncedOnDidChangeResourceLocations = debounce((...args) => SettingUtils._onDidChangeResourceLocations.fire(...args), 500);
	public static readonly fireDebouncedOnDidChangeResource = debounce((...args) => SettingUtils._onDidChangeResource.fire(...args), 500);


	public static readonly onDidChangeResourceLocations = this._onDidChangeResourceLocations.event;
	public static readonly onDidChangeResource = this._onDidChangeResource.event;
	public static readonly onDidLoad = this._onDidLoad.event;



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
			Logger.log("🚀 i18n CodeLens initializing...");
			this.initialLoadDone = false;

			// Step 1: Read and listen configs
			Logger.log("📋 Reading configuration settings...");
			this.readAndListenConfigs();
			Logger.log("✅ Configuration settings loaded successfully");

			// Step 2: Read and listen files  
			Logger.log("📁 Starting file scanning and monitoring...");
			await this.readAndListenFiles();
			Logger.log("✅ File scanning and monitoring setup completed");

			this.initialLoadDone = true;

			Logger.log("🎉 i18n CodeLens initialization completed successfully!");
			SettingUtils._onDidLoad.fire(SettingUtils.disposables);
		} catch (error) {
			Logger.log("❌ CRITICAL ERROR during i18n CodeLens initialization:", error);
			vscode.window.showErrorMessage(
				`i18n CodeLens failed to initialize: ${error instanceof Error ? error.message : String(error)}. Check output panel for details.`
			);
			throw error; // Re-throw to indicate initialization failure
		}
	}

	private readAndListenConfigs() {
		try {
			Logger.log("🔧 Refreshing glob pattern from config...");
			this.refreshGlobFromConfig();

			Logger.log("🔧 Refreshing regex pattern from config...");
			this.refreshRegexFromConfig();

			Logger.log("👂 Setting up configuration change listeners...");
			vscode.workspace.onDidChangeConfiguration(async (e) => {
				try {
					let isChanged = false;
					if (e.affectsConfiguration(settings.globPattern)) {
						Logger.log("🔄 Glob pattern configuration changed, refreshing...");
						this.refreshGlobFromConfig();
						await this.refreshResourceFromFiles(true);
						await this.findAllResourceReferencesFromJson();
						isChanged = true;
					} else if (e.affectsConfiguration(settings.resourceRegex)) {
						Logger.log("🔄 Resource regex configuration changed, refreshing...");
						this.refreshRegexFromConfig();
						await this.findAllResourceReferencesFromCodeFiles();
						isChanged = true;
					}

					if (isChanged) {
						Logger.log("✅ Configuration changes applied successfully!");
					}
				} catch (error) {
					Logger.log("❌ ERROR applying configuration changes:", error);
					vscode.window.showErrorMessage(`Failed to apply configuration changes: ${error instanceof Error ? error.message : String(error)}`);
				}
			}, null, SettingUtils.disposables);
		} catch (error) {
			Logger.log("❌ CRITICAL ERROR in readAndListenConfigs:", error);
			throw error;
		}
	}


	private refreshGlobFromConfig() {
		try {
			const configValue = vscode.workspace.getConfiguration(extensionName).get(settings.globPattern, "**/locales/*.json");
			Logger.log(`📂 Setting glob pattern: ${configValue}`);
			this.globPattern = configValue;
			this.mm = new Minimatch(this.globPattern);
		} catch (error) {
			Logger.log("❌ ERROR refreshing glob from config:", error);
			// Use default values on error
			this.globPattern = "**/locales/*.json";
			this.mm = new Minimatch(this.globPattern);
			vscode.window.showWarningMessage("Failed to load glob pattern config, using default.");
		}
	}

	private refreshRegexFromConfig = () => {
		try {
			const rx = vscode.workspace.getConfiguration(extensionName).get(settings.resourceRegex, "");
			Logger.log(`🔍 Setting resource regex: ${rx}`);
			this.codeRegex = new RegExp(rx, "g");

		} catch (error) {
			Logger.log("❌ ERROR refreshing regex from config:", error);
			// Use default regex on error
			this.codeRegex = /(?<=\/\*\*\s*?@i18n\s*?\*\/\s*?["']|[tT]\(\s*["'])(?<key>[A-Za-z0-9 .-]+?)(?=["'])/g;
			vscode.window.showWarningMessage("Failed to load regex config, using default.");
		}
	}
	private async refreshResourceFromFiles(noCache = false) {
		try {
			Logger.log(`🔍 Scanning for resource files with pattern: ${this.globPattern}`);
			const vscodeUriList = await vscode.workspace.findFiles(this.globPattern, excludePattern);
			Logger.log(`📄 Found ${vscodeUriList.length} resource files`);

			if (noCache) {
				Logger.log("🗑️ Clearing resource cache");
				this.languageResourcesFilesCache = [];
			}

			await Promise.all(vscodeUriList.map(uri => this.insertOrUpdateResourceByUri(uri)));
			Logger.log(`✅ Successfully processed ${vscodeUriList.length} resource files`);
		} catch (error) {
			Logger.log("❌ ERROR refreshing resources from files:", error);
			throw error;
		}
	}

	private async insertOrUpdateResourceByUri(fileUri: vscode.Uri, isDelete?: boolean) {
		try {
			if (isDelete) {
				const fileName = path.parse(fileUri.fsPath).name;
				Logger.log(`🗑️ Removing resource file from cache: ${fileName}`);
				this.languageResourcesFilesCache = this.languageResourcesFilesCache.filter(r => r.uri.fsPath !== fileUri.fsPath);
				return;
			}

			const filePath = path.parse(fileUri.fsPath);
			Logger.log(`📖 Processing resource file: ${filePath.name}`);

			const data = (await vscode.workspace.fs.readFile(fileUri)).toString();
			const keyValuePairs = JSON.parse(data);

			if (!keyValuePairs || typeof keyValuePairs !== 'object') {
				const errorMsg = `${filePath.name} is not a valid JSON object and will be ignored!`;
				Logger.log(`⚠️ ${errorMsg}`);
				vscode.window.showWarningMessage(errorMsg);
				return;
			}

			const keyCount = Object.keys(keyValuePairs).length;
			Logger.log(`📝 Found ${keyCount} translation keys in ${filePath.name}`);

			const newResource: ResourceItem = ({
				uri: fileUri,
				fileName: filePath.name,
				keyValuePairs
			});

			const matchedResource = this.languageResourcesFilesCache.find(res => res.uri.fsPath === newResource.uri.fsPath);
			if (matchedResource) {
				Logger.log(`🔄 Updating existing resource: ${filePath.name}`);
				matchedResource.keyValuePairs = newResource.keyValuePairs;
			} else {
				Logger.log(`➕ Adding new resource: ${filePath.name}`);
				this.languageResourcesFilesCache.push(newResource);
			}

			if (this.initialLoadDone) {
				SettingUtils.fireDebouncedOnDidChangeResource(this.languageResourcesFilesCache);
			}
		} catch (error) {
			const fileName = path.parse(fileUri.fsPath).name;
			if (error instanceof SyntaxError) {
				Logger.log(`❌ JSON parse error in ${fileName}:`, error.message);
				vscode.window.showErrorMessage(`Invalid JSON in ${fileName}: ${error.message}`);
			} else {
				Logger.log(`❌ ERROR processing resource file ${fileName}:`, error);
				vscode.window.showErrorMessage(`Failed to process ${fileName}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
	}

	private async readAndListenFiles() {
		try {
			Logger.log("📁 Starting parallel file processing...");
			await Promise.all([
				this.readAndListenResourceFiles(),
				this.readAndListenCodeFiles()
			]);
			Logger.log("✅ File processing completed successfully");
		} catch (error) {
			Logger.log("❌ CRITICAL ERROR in readAndListenFiles:", error);
			throw error;
		}
	}

	private async readAndListenResourceFiles() {
		try {
			Logger.log("📂 Loading resource files...");
			await this.refreshResourceFromFiles();

			Logger.log("🔍 Finding resource references in JSON files...");
			await this.findAllResourceReferencesFromJson();

			Logger.log("👂 Setting up resource file watchers...");
			const watcher = vscode.workspace.createFileSystemWatcher(this.globPattern);
			const watcherHandler = (type: "change" | "create" | "delete") => async (e: vscode.Uri) => {
				try {
					const file = path.parse(e.fsPath);
					Logger.log(`📄 Resource file '${file.name}' was affected by '${type}' event`);

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
					Logger.log(`❌ ERROR handling ${type} event for resource file:`, error);
					vscode.window.showWarningMessage(`Failed to handle file ${type} event: ${error instanceof Error ? error.message : String(error)}`);
				}
			};

			watcher.onDidChange(watcherHandler("change"), null, SettingUtils.disposables);
			watcher.onDidCreate(watcherHandler("create"), null, SettingUtils.disposables);
			watcher.onDidDelete(watcherHandler("delete"), null, SettingUtils.disposables);

			SettingUtils.disposables.push(watcher);
			Logger.log("✅ Resource file monitoring setup completed");
		} catch (error) {
			Logger.log("❌ CRITICAL ERROR in readAndListenResourceFiles:", error);
			throw error;
		}
	}

	private async readAndListenCodeFiles() {
		try {
			Logger.log("💻 Finding resource references in code files...");
			await this.findAllResourceReferencesFromCodeFiles();

			Logger.log("👂 Setting up code file watchers...");
			const watcher = vscode.workspace.createFileSystemWatcher("**/*.{ts,tsx,js,jsx}");
			const watcherHandler = (type: string) => async (e: vscode.Uri) => {
				try {
					if (/^(.(?!.*node_modules))*\.(jsx?|tsx?)$/.test(e.fsPath)) {
						const fileName = path.basename(e.fsPath);
						Logger.log(`💻 Code file '${fileName}' was affected by '${type}' event`);

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
					Logger.log(`❌ ERROR handling ${type} event for code file:`, error);
				}
			};

			watcher.onDidChange(watcherHandler("change"), null, SettingUtils.disposables);
			watcher.onDidCreate(watcherHandler("create"), null, SettingUtils.disposables);
			watcher.onDidDelete(watcherHandler("delete"), null, SettingUtils.disposables);

			SettingUtils.disposables.push(watcher);
			Logger.log("✅ Code file monitoring setup completed");
		} catch (error) {
			Logger.log("❌ CRITICAL ERROR in readAndListenCodeFiles:", error);
			throw error;
		}
	}

	private async findAllResourceReferencesFromJson() {
		try {
			Logger.log(`🔍 Scanning ${this.languageResourcesFilesCache.length} resource files for references...`);
			await Promise.all(this.languageResourcesFilesCache.map(res => this.updateLocationsFromResourceFile(res.uri)));
			Logger.log("✅ Resource file reference scanning completed");
		} catch (error) {
			Logger.log("❌ ERROR finding resource references from JSON:", error);
			throw error;
		}
	}

	private async findAllResourceReferencesFromCodeFiles() {
		try {
			Logger.log("🔍 Scanning code files for resource references...");
			const files = await vscode.workspace.findFiles("**/*.{ts,tsx,js,jsx}", excludePattern);
			Logger.log(`💻 Found ${files.length} code files to scan`);
			await Promise.all(files.map(fileUri => this.updateLocationsFromCacheByCodeUri(fileUri)));
			Logger.log("✅ Code file reference scanning completed");
		} catch (error) {
			Logger.log("❌ ERROR finding resource references from code files:", error);
			throw error;
		}
	}

	private async updateLocationsFromCacheByCodeUri(fileUri: vscode.Uri) {
		try {
			const file = await vscode.workspace.fs.readFile(fileUri);
			const fileContent = file.toString();
			const fileName = path.basename(fileUri.fsPath);

			let lineNumber = 0;
			const lines = fileContent.split(/\r?\n/);
			let isAddedNewKey = false;
			let keyCount = 0;

			for (const line of lines) {
				const match = SettingUtils.getResourceCodeMatch(line);

				if (match?.index !== undefined) {
					const key = match[0];
					const keyLength = key?.length || 0;

					const location = new vscode.Location(fileUri,
						new vscode.Range(
							new vscode.Position(lineNumber, match.index),
							new vscode.Position(lineNumber, match.index + keyLength)
						)
					);
					const locationList = this.resourceDefinitionLocations.get(key) || [];
					locationList.push(location);
					this.resourceDefinitionLocations.set(key, locationList);
					isAddedNewKey = true;
					keyCount++;
				}
				lineNumber++;
			}

			if (keyCount > 0) {
				Logger.log(`📝 Found ${keyCount} resource references in ${fileName}`);
			}

			if (isAddedNewKey && this.initialLoadDone) {
				SettingUtils.fireDebouncedOnDidChangeResourceLocations(this.resourceDefinitionLocations);
			}
		} catch (error) {
			const fileName = path.basename(fileUri.fsPath);
			Logger.log(`❌ ERROR updating locations from code file ${fileName}:`, error);
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

	private async updateLocationsFromResourceFile(fileUri: vscode.Uri) {
		try {
			const file = await vscode.workspace.fs.readFile(fileUri);
			const fileContent = file.toString();
			const fileName = path.basename(fileUri.fsPath);

			let lineNumber = 0;
			const lines = fileContent.split(/\r?\n/);
			let isAddedNewKey = false;
			let keyCount = 0;

			for (const line of lines) {
				const match = SettingUtils.getResourceLineMatch(line);
				if (match?.groups?.key) {
					const characterPosition = match?.index || 0;
					const characterLength = match?.groups?.key?.length || 0;
					const location = new vscode.Location(fileUri, new vscode.Range(new vscode.Position(lineNumber, characterPosition), new vscode.Position(lineNumber, characterPosition + characterLength)));
					const locationList = this.resourceDefinitionLocations.get(match.groups.key) || [];
					locationList.push(location);
					this.resourceDefinitionLocations.set(match.groups.key, locationList);
					isAddedNewKey = true;
					keyCount++;
				}
				lineNumber++;
			}

			if (keyCount > 0) {
				Logger.log(`📝 Found ${keyCount} resource definitions in ${fileName}`);
			}

			if (isAddedNewKey && this.initialLoadDone) {
				SettingUtils.fireDebouncedOnDidChangeResourceLocations(this.resourceDefinitionLocations);
			}
		} catch (error) {
			const fileName = path.basename(fileUri.fsPath);
			Logger.log(`❌ ERROR updating locations from resource file ${fileName}:`, error);
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
			Logger.log("❌ ERROR in getAllResourceKeysFromDocument:", error);
			return [];
		}
	}

	dispose() {
		SettingUtils.disposables.forEach(d => d.dispose());
		SettingUtils.disposables = [];
	}
}