import * as vscode from 'vscode';
import { getLanguageResourcesFiles } from '../Utils';

export class HoverProvider implements vscode.HoverProvider {

	private regex!: RegExp;

	constructor() {
		this.refreshRegexFromConfig();
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration("akinon-codelens.languageTranslatorRegex")) {
				this.refreshRegexFromConfig();
			}
		});
	}

	private refreshRegexFromConfig() {
		const hoverRegex = vscode.workspace.getConfiguration("akinon-codelens").get("languageTranslatorRegex", "");
		this.regex = new RegExp(hoverRegex, "g");
	}

	async provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken) {

		const resourceList = await getLanguageResourcesFiles();
		let hasMatch = false;
		const hoverText: vscode.MarkdownString = new vscode.MarkdownString();
		const range = document.getWordRangeAtPosition(position, new RegExp(this.regex)); ///(?<=['"])[\w-_.]+(?=['"])/);
		const word = document.getText(range);

		if (!range || !word) {
			return;
		}

		resourceList.forEach((item) => {

			if (item.keyValuePairs[word]) {
				if (!hasMatch) {
					hoverText.appendMarkdown(`**KEY**: ${word}  \n\n\n`);
				}
				hoverText.appendMarkdown(`- **${item.fileName}**: ${item.keyValuePairs[word]}  \n\n`);
				hasMatch = true;
			}

		});

		if (!hasMatch) {
			hoverText.appendMarkdown("**Language definition not found!**");
		}
		return new vscode.Hover(hoverText);
	}
}