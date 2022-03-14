
import * as vscode from 'vscode';
import { getLanguageResourcesFiles, LanguageResource, normalizeString } from '../Utils';

export default class CompletionItemProvider implements vscode.CompletionItemProvider {

	private regex!: RegExp;
	private resourceList: LanguageResource = [];
	constructor(context: vscode.ExtensionContext) {

		this.refreshRegexFromConfig();
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration("i18n-codelens.languageTranslatorRegex")) {
				this.refreshRegexFromConfig();
			}
		}, null, context.subscriptions);
		this.refreshResourceList();

		const resourceGlobPattern = vscode.workspace.getConfiguration("i18n-codelens").get("languageGlobPattern", "**/locales/*.json");
		const watcher = vscode.workspace.createFileSystemWatcher(resourceGlobPattern, false, false, true);
		watcher.onDidChange((e) => {
			this.refreshResourceList();
		}, null, context.subscriptions);

	}
	private async refreshResourceList() {
		const resources = await getLanguageResourcesFiles();
		this.resourceList = resources;
	}
	private refreshRegexFromConfig() {
		const hoverRegex = vscode.workspace.getConfiguration("i18n-codelens").get("languageTranslatorRegex", "");
		this.regex = new RegExp(hoverRegex, "g");
	}

	provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) {

		const range = document.getWordRangeAtPosition(position, new RegExp(this.regex));
		const translationKeyMatch = document.getText(range);
		if (!translationKeyMatch) {
			return undefined;
		}

		const resourceList: { key: string, value: { [key: string]: string } }[] = [];
		this.resourceList.forEach(resource => {
			Object.entries(resource.keyValuePairs).forEach(([key, value]) => {
				const matchedResource = resourceList.find(item => item.key === key);
				if (matchedResource) {
					matchedResource.value[resource.fileName] = value;
				} else {
					resourceList.push({ key, value: { [resource.fileName]: value } });
				}
			});

		});

		const codeCompletionList: vscode.CompletionItem[] = [];
		for (const resource of resourceList) {
			const valuesArray = Object.values(resource.value).map(value => normalizeString(value).toLowerCase());

			const filterText = resource.key + "." + valuesArray.join(".");
			const hasMatch = filterText.includes(translationKeyMatch.toLowerCase());
			if (!hasMatch) continue;

			const descriptionArray = Object.entries(resource.value).map(([key, value]) => ({ key, value }));

			const detail = descriptionArray.map(item => `${item.key}: ${item.value}`).join(", ");

			const documentation = new vscode.MarkdownString();
			descriptionArray.forEach((item) => {
				documentation.appendMarkdown(`- **${item.key}**: ${item.value}  \n`);
			});

			const codeCompletionItem = new vscode.CompletionItem(resource.key, vscode.CompletionItemKind.Constant);
			codeCompletionItem.detail = detail;
			codeCompletionItem.filterText = filterText;
			codeCompletionItem.documentation = documentation;
			codeCompletionItem.range = range;
			codeCompletionItem.sortText = filterText;
			codeCompletionList.push(codeCompletionItem);
		}
		return codeCompletionList;
	}



}