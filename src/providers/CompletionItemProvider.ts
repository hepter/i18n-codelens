
import * as vscode from 'vscode';
import SettingUtils from '../SettingUtils';
import { normalizeString } from '../Utils';

export default class CompletionItemProvider implements vscode.CompletionItemProvider {


	provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) {


		const resources = SettingUtils.getResources();
		const resourceRegex = SettingUtils.getResourceCodeRegex();

		const range = document.getWordRangeAtPosition(position, resourceRegex);
		const translationKeyMatch = document.getText(range);
		if (!translationKeyMatch) {
			return undefined;
		}

		const resourceList: { key: string, value: { [key: string]: string } }[] = [];

		for (const resource of resources) {
			Object.entries(resource.keyValuePairs).forEach(([key, value]) => {
				const matchedResource = resourceList.find(item => item.key === key);
				if (matchedResource) {
					matchedResource.value[resource.fileName] = value;
				} else {
					resourceList.push({ key, value: { [resource.fileName]: value } });
				}
			});
		}

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