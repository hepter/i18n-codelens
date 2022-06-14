import * as vscode from 'vscode';
import SettingUtils from '../SettingUtils';

export class HoverProvider implements vscode.HoverProvider {
	provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken) {
		const keyRange = document.getWordRangeAtPosition(position, SettingUtils.getResourceLineRegex());		
		const key = document.getText(keyRange);
		if (!key) return;

		if (SettingUtils.isResourceFilePath(document.uri.path)) {
			return this.hoverForResource(key);
		} else if (SettingUtils.isCodeFilePath(document.uri.path)) {
			return this.hoverForCode(key);
		}
	}

	private hoverForResource(key: string) {
		const locations = SettingUtils.getResourceLocationsByKey(key);
		const codeLocations = locations?.filter(location => SettingUtils.isCodeFilePath(location.uri.fsPath));
		if (!codeLocations?.length) {
			const hoverText = new vscode.MarkdownString();
			hoverText.appendMarkdown(`The **'${key}'** resource key has no reference in any file. \n\n`);
			hoverText.appendMarkdown(`Delete the resource key if you don't need it\n\n\n`);
			hoverText.appendMarkdown(`- Note: It may still be used as dynamically, so please try to check before deleting`);
			return new vscode.Hover(hoverText);
		}
	}

	private hoverForCode(key: string) {
		const resources = SettingUtils.getResources();
		let hasMatch = false;
		const hoverText: vscode.MarkdownString = new vscode.MarkdownString();

		for (const resource of resources) {
			if (resource.keyValuePairs[key]) {
				if (!hasMatch) {
					hoverText.appendMarkdown(`**KEY**: ${key}  \n\n\n`);
				}
				hoverText.appendMarkdown(`- **${resource.fileName}**: ${resource.keyValuePairs[key]}  \n\n`);
				hasMatch = true;
			}
		}

		if (!hasMatch) {
			hoverText.appendMarkdown("**Language definition not found!**");
		}
		return new vscode.Hover(hoverText);
	}
}