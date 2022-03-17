import * as vscode from 'vscode';
import { definitionProviderCache } from './DefinitionProvider';
import { IMinimatch, Minimatch } from 'minimatch';

export class HoverProviderUnusedResources implements vscode.HoverProvider {

	context: vscode.ExtensionContext;
	mm!: IMinimatch;
	resourceLineRegex = /(?<=["'])(?<key>[\w\d\-_.]+?)(?=["'])/;
	constructor(context: vscode.ExtensionContext) {
		this.context = context;
		this.listenConfigChanges();
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


	async provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken) {
		const textRange = document.getWordRangeAtPosition(position, this.resourceLineRegex);

		const key = document.getText(textRange);
		if (key && this.mm.match(document.uri.path)) {

			const locations = definitionProviderCache.get(key);
			const locationsExceptJson = locations?.filter(location => !location.uri.fsPath.endsWith(".json"));
			if (!locationsExceptJson?.length) {
				const hoverText: vscode.MarkdownString = new vscode.MarkdownString();
				hoverText.appendMarkdown(`The **'${key}'** resource key has no reference in any file. \n\n`);
				hoverText.appendMarkdown(`Delete the resource key if you don't need it\n\n\n`);
				hoverText.appendMarkdown(`- Note: It may still be used as dynamically, so please try to check before deleting`);
				return new vscode.Hover(hoverText);
			}
		}
	}
} 