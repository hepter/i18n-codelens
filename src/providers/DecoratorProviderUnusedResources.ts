import * as vscode from 'vscode';
import DefinitionProvider, { definitionProviderCache } from './DefinitionProvider';

import { IMinimatch, Minimatch } from 'minimatch';
export class DecoratorProviderUnusedResources {

	private mm!: IMinimatch;
	private context!: vscode.ExtensionContext;
	private resourceLineRegex = /(?<=["'])(?<key>[\w\d\-_.]+?)(?=["'])/;
	private timeout: NodeJS.Timer | undefined = undefined;
	private activeEditor = vscode.window.activeTextEditor;
	private resourceNoReferenceDecorationType = vscode.window.createTextEditorDecorationType({
		opacity: "0.5"
	});


	constructor(context: vscode.ExtensionContext) {
		this.context = context;
		this.listenConfigChanges();
		this.initialize();

		DefinitionProvider.onDidChangeDefinitionProvider((e) => {
			this.triggerUpdateDecorations(true);
		}, null, this.context.subscriptions);
	}



	private initialize = () => {

		if (this.activeEditor) {
			this.triggerUpdateDecorations(false);
		}

		vscode.window.onDidChangeActiveTextEditor(editor => {
			this.activeEditor = editor;
			if (editor) {
				this.triggerUpdateDecorations(false);
			}
		}, null, this.context.subscriptions);

		vscode.workspace.onDidChangeTextDocument(event => {
			if (this.activeEditor && event.document === this.activeEditor.document) {
				this.triggerUpdateDecorations(true);
			}
		}, null, this.context.subscriptions);

		const resourceGlobPattern = vscode.workspace.getConfiguration("i18n-codelens").get("languageGlobPattern", "**/locales/*.json");
		const watcher = vscode.workspace.createFileSystemWatcher(resourceGlobPattern, false, false, true);
		watcher.onDidChange((e) => {
			this.triggerUpdateDecorations(true);
		}, null, this.context.subscriptions);

	}

	private async listenConfigChanges() {
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration("i18n-codelens.languageGlobPattern")) {
				this.refreshGlobFromConfig();
			}
		}, null, this.context.subscriptions);
		this.refreshGlobFromConfig();
	}
	private async refreshGlobFromConfig() {
		const globPattern = vscode.workspace.getConfiguration("i18n-codelens").get("languageGlobPattern", "**/locales/*.json");
		this.mm = new Minimatch(globPattern);
	}



	public updateDecorations = async (textEditor?: vscode.TextEditor) => {
		const activeEditor = textEditor || this.activeEditor;

		const text = activeEditor?.document.getText();
		if (text && activeEditor && this.mm.match(activeEditor.document?.uri?.path || "")) {

			const lines = text.split(/\r?\n/g);
			let lineNumber = 0;
			const unusedResources = [];
			for (const line of lines) {
				const match = this.resourceLineRegex.exec(line);
				const key = match?.groups?.key;
				if (key) {
					const locations = definitionProviderCache.get(key);
					const locationsExceptJson = locations?.filter(location => !location.uri.fsPath.endsWith(".json"));
					if (!locationsExceptJson?.length) {
						const range = new vscode.Range(new vscode.Position(lineNumber, 0), new vscode.Position(lineNumber, line.length));
						const decoration = { range };
						unusedResources.push(decoration);
					}
				}
				this.resourceLineRegex.lastIndex = 0;
				lineNumber++;
			}

			activeEditor.setDecorations(this.resourceNoReferenceDecorationType, unusedResources);
		}

	}

	triggerUpdateDecorations = (throttle: boolean) => {
		if (this.timeout) {
			clearTimeout(this.timeout);
			this.timeout = undefined;
		}
		if (throttle) {
			this.timeout = setTimeout(this.updateDecorations, 500);
		} else {
			this.updateDecorations();
		}
	}
}

