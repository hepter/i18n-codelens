import * as vscode from 'vscode';
import { getLanguageResourcesFiles } from '../Utils';

export class HoverProvider implements vscode.HoverProvider {

	private regex!: RegExp;

	constructor(context: vscode.ExtensionContext) {

		this.refreshRegexFromConfig();

		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration("i18n-codelens.languageTranslatorRegex")) {
				this.refreshRegexFromConfig();
			}
		}, null, context.subscriptions);
	}

	private refreshRegexFromConfig() {
		const hoverRegex = vscode.workspace.getConfiguration("i18n-codelens").get("languageTranslatorRegex", "");
		this.regex = new RegExp(hoverRegex, "g");
	}

	async provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken) {

		const resourceList = await getLanguageResourcesFiles();
		let hasMatch = false;
		const hoverText: vscode.MarkdownString = new vscode.MarkdownString();
		const range = document.getWordRangeAtPosition(position, new RegExp(this.regex)); ///(?<=['"])[\w-_.]+(?=['"])/);
		const resourceKey = document.getText(range);

		if (!range || !resourceKey) {
			return;
		}

		resourceList.forEach((item) => {

			if (item.keyValuePairs[resourceKey]) {
				if (!hasMatch) {
					hoverText.appendMarkdown(`**KEY**: ${resourceKey}  \n\n\n`);
				}
				hoverText.appendMarkdown(`- **${item.fileName}**: ${item.keyValuePairs[resourceKey]}  \n\n`);
				hasMatch = true;
			}

		});

		if (!hasMatch) {
			hoverText.appendMarkdown("**Language definition not found!**");
		}
		return new vscode.Hover(hoverText);
	}
}