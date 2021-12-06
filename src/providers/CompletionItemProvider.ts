
import * as vscode from 'vscode';
import { getLanguageResourcesFiles, LanguageResource } from '../Utils';

export default class CompletionItemProvider implements vscode.CompletionItemProvider {

	private regex!: RegExp;
	private resourceList: LanguageResource = [];
	constructor() {
		this.refreshRegexFromConfig();
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration("akinon-codelens.languageTranslatorRegex")) {
				this.refreshRegexFromConfig();
			}
		});
		getLanguageResourcesFiles().then(resourceList => { this.resourceList = resourceList; });
	}

	private refreshRegexFromConfig() {
		const hoverRegex = vscode.workspace.getConfiguration("akinon-codelens").get("languageTranslatorRegex", "");
		this.regex = new RegExp(hoverRegex, "g");
	}

	provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) {

		document.getWordRangeAtPosition(position);
		const translationKeyMatch = document.lineAt(position).text.match(this.regex)?.[0];
		if (!translationKeyMatch) {
			return undefined;
		}
		let resourceKeyList: string[] = [];

		this.resourceList.forEach(resource => {
			resourceKeyList.push(...Object.keys(resource.keyValuePairs));
		});

		resourceKeyList = [...new Set(resourceKeyList)];

		const filteredList = resourceKeyList.filter(item => item.startsWith(translationKeyMatch));
		const codeCompletionList: vscode.CompletionItem[] = [];



		filteredList.forEach(item => {

			const codeCompletionItem = new vscode.CompletionItem(item, vscode.CompletionItemKind.Constant);
			codeCompletionItem.detail = this.resourceList.map((resourceList) => {
				if (resourceList.keyValuePairs[item])
					return `${resourceList.fileName}:${resourceList.keyValuePairs[item]}`;
				return '';
			}).join(', \n');

			codeCompletionList.push(codeCompletionItem);

		});

		return codeCompletionList;
	}



}