import * as vscode from 'vscode';
import { definitionProviderCache } from './DefinitionProvider';

export class HoverProviderUnusedResources implements vscode.HoverProvider {

	context: vscode.ExtensionContext;
	constructor(context: vscode.ExtensionContext) {
		this.context = context;
	}

	resourceLineRegex = /(?<=["'])(?<key>[\w\d\-_.]+?)(?=["'])/;
	async provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken) {
		const textRange = document.getWordRangeAtPosition(position, this.resourceLineRegex);

		const key = document.getText(textRange);
		if (key && document.uri.fsPath.endsWith(".json")) {

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