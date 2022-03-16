import * as vscode from 'vscode';
import { getLanguageResourcesFiles, LanguageResource } from '../Utils';


export const definitionProviderCache = new Map<string, vscode.Location[]>();

export default class DefinitionProvider implements vscode.DefinitionProvider {
	private context: vscode.ExtensionContext
	private regex!: RegExp;
	private resourceList: LanguageResource = [];
	private resourceLineRegex = /(?<=["'])(?<key>[\w\d\-_.]+?)(?=["'])/;
	private static _onDidChangeDefinitionProvider: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();

	private initialLoadDone = false;
	public static readonly onDidChangeDefinitionProvider: vscode.Event<void> = DefinitionProvider._onDidChangeDefinitionProvider.event;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
		this.refreshRegexFromConfig();
		this.init();

	}

	private removeLocationsFromCacheByCodeUri(uri: vscode.Uri) {
		let isRemovedKey = false;
		for (const [key, value] of definitionProviderCache) {
			const newValue = value.filter(v => v.uri.fsPath !== uri.fsPath);
			if (newValue.length != value.length) {
				definitionProviderCache.set(key, newValue);
				isRemovedKey = true;
			}
		}
		if (isRemovedKey && this.initialLoadDone) {
			DefinitionProvider._onDidChangeDefinitionProvider.fire();
		}
	}

	private async init() {
		await this.listenConfigChanges();
		await this.refreshResourceList();
		await this.findAllResourceReferencesFromJson();
		await this.findAllResourceReferencesFromCodeFiles();
		await this.listenAllResourceFiles();
		await this.listenAllWorkspaceCodeFiles();

		this.initialLoadDone = true;
		console.log("Definition Provider Loaded");
		DefinitionProvider._onDidChangeDefinitionProvider.fire();
	}

	private async listenConfigChanges() {
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration("i18n-codelens.languageTranslatorRegex")) {
				this.refreshRegexFromConfig();
			}
		}, null, this.context.subscriptions);
	}

	private async listenAllResourceFiles() {
		const resourceGlobPattern = vscode.workspace.getConfiguration("i18n-codelens").get("languageGlobPattern", "**/locales/*.json");
		const watcher = vscode.workspace.createFileSystemWatcher(resourceGlobPattern, false, false, true);
		watcher.onDidChange(async (e) => {
			await this.refreshResourceList();
			await this.updateLocationsFromResourceFile(e);
		}, null, this.context.subscriptions);
	}
	private async listenAllWorkspaceCodeFiles() {
		const watcher = vscode.workspace.createFileSystemWatcher("**/*.{ts,tsx,js,jsx}");
		const watcherHandler = (type: string) => async (e: vscode.Uri) => {
			if (/^(.(?!.*node_modules))*\.(jsx?|tsx?)$/.test(e.fsPath)) {

				if (type === "delete") {
					this.removeLocationsFromCacheByCodeUri(e);
				}
				else if (type === "create") {
					this.updateLocationsFromCacheByCodeUri(e);
				}
				else {
					this.removeLocationsFromCacheByCodeUri(e);
					this.updateLocationsFromCacheByCodeUri(e);
				}
			}
		};
		watcher.onDidChange(watcherHandler("change"), null, this.context.subscriptions);
		watcher.onDidCreate(watcherHandler("create"), null, this.context.subscriptions);
		watcher.onDidDelete(watcherHandler("delete"), null, this.context.subscriptions);
	}

	private async findAllResourceReferencesFromJson() {
		for (const res of this.resourceList) {
			this.updateLocationsFromResourceFile(vscode.Uri.file(res.path));
		}
	}

	private async findAllResourceReferencesFromCodeFiles() {
		const files = await vscode.workspace.findFiles("**/*.{ts,tsx,js,jsx}", "**/node_modules/**");

		for (const fileUri of files) {
			this.updateLocationsFromCacheByCodeUri(fileUri);
		}
	}

	private async updateLocationsFromCacheByCodeUri(fileUri: vscode.Uri) {
		const file = await vscode.workspace.fs.readFile(fileUri);
		const fileContent = file.toString();

		let lineNumber = 0;
		const lines = fileContent.split("\n");
		let isAddedNewKey = false;
		for (const line of lines) {
			this.regex.lastIndex = 0;
			const match = this.regex.exec(line);
			if (match?.index) {
				const key = match[0];
				const keyLength = key?.length || 0;

				const location = new vscode.Location(fileUri, new vscode.Range(new vscode.Position(lineNumber, match.index), new vscode.Position(lineNumber, match.index + keyLength)));
				const locationList = definitionProviderCache.get(key) || [];
				locationList.push(location);
				definitionProviderCache.set(key, locationList);
				isAddedNewKey = true;
			}
			lineNumber++;
		}
		if (isAddedNewKey && this.initialLoadDone) {
			DefinitionProvider._onDidChangeDefinitionProvider.fire();
		}
	}

	private async updateLocationsFromResourceFile(fileUri: vscode.Uri) {
		const file = await vscode.workspace.fs.readFile(fileUri);
		const fileContent = file.toString();

		let lineNumber = 0;
		const lines = fileContent.split("\n");
		let isAddedNewKey = false;
		for (const line of lines) {

			const match = this.resourceLineRegex.exec(line);
			if (match?.groups?.key) {
				const characterPosition = match?.index || 0;
				const characterLength = match?.groups?.key?.length || 0;
				const location = new vscode.Location(fileUri, new vscode.Range(new vscode.Position(lineNumber, characterPosition), new vscode.Position(lineNumber, characterPosition + characterLength)));
				const locationList = definitionProviderCache.get(match.groups.key) || [];
				locationList.push(location);
				definitionProviderCache.set(match.groups.key, locationList);
				isAddedNewKey = true;
			}
			this.resourceLineRegex.lastIndex = 0;
			lineNumber++;
		}
		if (isAddedNewKey && this.initialLoadDone) {
			DefinitionProvider._onDidChangeDefinitionProvider.fire();
		}
	}


	private async refreshResourceList() {
		const resources = await getLanguageResourcesFiles();
		this.resourceList = resources;
	}

	private refreshRegexFromConfig() {
		const hoverRegex = vscode.workspace.getConfiguration("i18n-codelens").get("languageTranslatorRegex", "");
		this.regex = new RegExp(hoverRegex, "g");
	}

	provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Definition> {
		let keyRange;

		if (document.uri.fsPath.endsWith(".json")) {
			keyRange = document.getWordRangeAtPosition(position, new RegExp(this.resourceLineRegex));
		} else {
			keyRange = document.getWordRangeAtPosition(position, new RegExp(this.regex));
		}

		const key = document.getText(keyRange);
		const locations = definitionProviderCache.get(key) || [];
		return locations;
	}
}