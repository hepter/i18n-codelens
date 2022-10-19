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
		Logger.log("i18n CodeLens initializing...");
		this.initialLoadDone = false;

		this.readAndListenConfigs();
		await this.readAndListenFiles();

		this.initialLoadDone = true;

		Logger.log("i18n CodeLens initialize finished!");
		SettingUtils._onDidLoad.fire(SettingUtils.disposables);
	}

	private readAndListenConfigs() {
		this.refreshGlobFromConfig();
		this.refreshRegexFromConfig();

		vscode.workspace.onDidChangeConfiguration(async (e) => {
			let isChanged = false;
			if (e.affectsConfiguration(settings.globPattern)) {
				this.refreshGlobFromConfig();
				this.refreshResourceFromFiles(true);
				this.findAllResourceReferencesFromJson();
				isChanged = true;
			} else if (e.affectsConfiguration(settings.resourceRegex)) {
				this.refreshRegexFromConfig();
				this.findAllResourceReferencesFromCodeFiles();
				isChanged = true;
			}
			
			if (isChanged) Logger.log(`i18n CodeLens config changes were applied!`);

		}, null, SettingUtils.disposables);
	}


	private refreshGlobFromConfig() {
		this.globPattern = vscode.workspace.getConfiguration(extensionName).get(settings.globPattern, "**/locales/*.json");
		this.mm = new Minimatch(this.globPattern);
	}

	private refreshRegexFromConfig = () => {
		const rx = vscode.workspace.getConfiguration(extensionName).get(settings.resourceRegex, "");
		this.codeRegex = new RegExp(rx, "g");
	}
	private async refreshResourceFromFiles(noCache = false) {
		const vscodeUriList = await vscode.workspace.findFiles(this.globPattern, excludePattern);
		if (noCache) {
			this.languageResourcesFilesCache = [];
		}
		await Promise.all(vscodeUriList.map(uri => this.insertOrUpdateResourceByUri(uri)));
	}

	private async insertOrUpdateResourceByUri(fileUri: vscode.Uri, isDelete?: boolean) {
		if (isDelete) {
			this.languageResourcesFilesCache = this.languageResourcesFilesCache.filter(r => r.uri.fsPath !== fileUri.fsPath);
			return;
		}
		const filePath = path.parse(fileUri.fsPath);

		try {

			const data = (await vscode.workspace.fs.readFile(fileUri)).toString();
			const keyValuePairs = JSON.parse(data);

			if (!keyValuePairs) {
				vscode.window.showErrorMessage(`${filePath.name} is not a valid json file and resource file will be ignored!`);
				return;
			}
			const newResource: ResourceItem = ({
				uri: fileUri,
				fileName: filePath.name,
				keyValuePairs
			});

			const matchedResource = this.languageResourcesFilesCache.find(res => res.uri.fsPath === newResource.uri.fsPath);
			if (matchedResource) {
				matchedResource.keyValuePairs = newResource.keyValuePairs;
			} else {
				this.languageResourcesFilesCache.push(newResource);
			}

			if (this.initialLoadDone) {
				SettingUtils.fireDebouncedOnDidChangeResource(this.languageResourcesFilesCache);
			}
		} catch (error) {
			Logger.log("Resource file parse error: " + filePath.name, error);
		}
	}

	private async readAndListenFiles() {
		await Promise.all([
			this.readAndListenResourceFiles(),
			this.readAndListenCodeFiles()
		]);
	}

	private async readAndListenResourceFiles() {
		await this.refreshResourceFromFiles();
		await this.findAllResourceReferencesFromJson();


		const watcher = vscode.workspace.createFileSystemWatcher(this.globPattern);
		const watcherHandler = (type: "change" | "create" | "delete") => (e: vscode.Uri) => {
			const file = path.parse(e.fsPath);
			Logger.log(`Resource file '${file.name}' was affected by '${type}' event!`);
			this.insertOrUpdateResourceByUri(e, type === "delete");
			if (type === "delete") {
				this.removeLocationsByUri(e);
			}
			else if (type === "change") {
				this.removeLocationsByUri(e);
				this.updateLocationsFromResourceFile(e);
			}
			else if (type === "create") {
				this.updateLocationsFromResourceFile(e);
			}
		};

		watcher.onDidChange(watcherHandler("change"), null, SettingUtils.disposables);
		watcher.onDidCreate(watcherHandler("create"), null, SettingUtils.disposables);
		watcher.onDidDelete(watcherHandler("delete"), null, SettingUtils.disposables);
	}

	private async readAndListenCodeFiles() {
		await this.findAllResourceReferencesFromCodeFiles();

		const watcher = vscode.workspace.createFileSystemWatcher("**/*.{ts,tsx,js,jsx}");
		const watcherHandler = (type: string) => async (e: vscode.Uri) => {
			if (/^(.(?!.*node_modules))*\.(jsx?|tsx?)$/.test(e.fsPath)) {
				if (type === "delete") {
					this.removeLocationsByUri(e);
				}
				else if (type === "create") {
					this.updateLocationsFromCacheByCodeUri(e);
				}
				else if (type === "change") {
					this.removeLocationsByUri(e);
					this.updateLocationsFromCacheByCodeUri(e);
				}
			}
		};
		watcher.onDidChange(watcherHandler("change"), null, SettingUtils.disposables);
		watcher.onDidCreate(watcherHandler("create"), null, SettingUtils.disposables);
		watcher.onDidDelete(watcherHandler("delete"), null, SettingUtils.disposables);
	}

	private async findAllResourceReferencesFromJson() {
		await Promise.all(this.languageResourcesFilesCache.map(res => this.updateLocationsFromResourceFile(res.uri)));
	}

	private async findAllResourceReferencesFromCodeFiles() {
		const files = await vscode.workspace.findFiles("**/*.{ts,tsx,js,jsx}", excludePattern);
		await Promise.all(files.map(fileUri => this.updateLocationsFromCacheByCodeUri(fileUri)));
	}

	private async updateLocationsFromCacheByCodeUri(fileUri: vscode.Uri) {
		const file = await vscode.workspace.fs.readFile(fileUri);
		const fileContent = file.toString();

		let lineNumber = 0;
		const lines = fileContent.split(/\r?\n/);
		let isAddedNewKey = false;
		for (const line of lines) {
			const match = SettingUtils.getResourceCodeMatch(line);

			if (match?.index) {
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
			}
			lineNumber++;
		}
		if (isAddedNewKey && this.initialLoadDone) {
			SettingUtils.fireDebouncedOnDidChangeResourceLocations(this.resourceDefinitionLocations);
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
		const file = await vscode.workspace.fs.readFile(fileUri);
		const fileContent = file.toString();

		let lineNumber = 0;
		const lines = fileContent.split(/\r?\n/);
		let isAddedNewKey = false;
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
			}
			lineNumber++;
		}
		if (isAddedNewKey && this.initialLoadDone) {
			SettingUtils.fireDebouncedOnDidChangeResourceLocations(this.resourceDefinitionLocations);
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

	dispose() {
		SettingUtils.disposables.forEach(d => d.dispose());
		SettingUtils.disposables = [];
	}
}