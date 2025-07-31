import * as vscode from 'vscode';
import SettingUtils from '../SettingUtils';
import { Logger } from '../Utils';
import { actions } from '../constants';

export class HoverProvider implements vscode.HoverProvider {
	provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken) {
		try {
			const keyRange = document.getWordRangeAtPosition(position, SettingUtils.getResourceLineRegex());		
			const key = document.getText(keyRange);
			if (!key) return;

			if (SettingUtils.isResourceFilePath(document.uri.path)) {
				return this.hoverForResource(key);
			} else if (SettingUtils.isCodeFilePath(document.uri.path)) {
				return this.hoverForCode(key);
			}
		} catch (error) {
			Logger.log("❌ ERROR in provideHover:", error);
			return undefined;
		}
	}

	private hoverForResource(key: string) {
		try {
			const locations = SettingUtils.getResourceLocationsByKey(key);
			const codeLocations = locations?.filter(location => SettingUtils.isCodeFilePath(location.uri.fsPath));
			
			const resources = SettingUtils.getResources();
			const missingResourceFileNames = [];
			const existingResourceFileNames = [];

			for (const resource of resources) {
				if (resource.keyValuePairs[key]) {
					existingResourceFileNames.push(resource.fileName);
				} else {
					missingResourceFileNames.push(resource.fileName);
				}
			}

			if (!codeLocations?.length) {
				const hoverText = new vscode.MarkdownString();
				hoverText.isTrusted = true;
				hoverText.appendMarkdown(`The **'${key}'** resource key has no reference in any file. \n\n`);
				
				if (missingResourceFileNames.length > 0) {
					hoverText.appendMarkdown(`[Edit/Add Translations](command:${actions.addResource}?${encodeURIComponent(JSON.stringify([key, missingResourceFileNames]))}) \n\n`);
					hoverText.appendMarkdown(`Missing translations: ${missingResourceFileNames.join(', ')} \n\n`);
				} else {
					hoverText.appendMarkdown(`[Edit Translations](command:${actions.editResource}?${encodeURIComponent(JSON.stringify([key]))}) \n\n`);
				}
				
				if (existingResourceFileNames.length > 0) {
					hoverText.appendMarkdown(`[Delete Translations](command:${actions.deleteResource}?${encodeURIComponent(JSON.stringify([key]))}) \n\n`);
				}

				// Add Bulk Edit button for resource files - get all keys from current document
				const activeEditor = vscode.window.activeTextEditor;
				if (activeEditor && SettingUtils.isResourceFilePath(activeEditor.document.uri.fsPath)) {
					const text = activeEditor.document.getText();
					const lines = text.split(/\r?\n/);
					const allKeys = [];
					for (const line of lines) {
						const match = SettingUtils.getResourceLineMatch(line);
						if (match?.groups?.key) {
							allKeys.push(match.groups.key);
						}
					}
					if (allKeys.length > 1) {
						hoverText.appendMarkdown(`---\n\n`);
						hoverText.appendMarkdown(`[📋 Bulk Edit (${allKeys.length} keys)](command:${actions.bulkEditResources}?${encodeURIComponent(JSON.stringify([allKeys, activeEditor.document.uri.toString()]))})`);
					}
				}
				
				hoverText.appendMarkdown(`\n\nDelete the resource key if you don't need it\n\n\n`);
				hoverText.appendMarkdown(`- Note: It may still be used as dynamically, so please try to check before deleting`);
				return new vscode.Hover(hoverText);
			}
		} catch (error) {
			Logger.log("❌ ERROR in hoverForResource:", error);
			return undefined;
		}
	}

	private hoverForCode(key: string) {
		try {
			const resources = SettingUtils.getResources();
			let hasMatch = false;
			const hoverText: vscode.MarkdownString = new vscode.MarkdownString();
			hoverText.isTrusted = true;

			const missingResourceFileNames = [];
			const existingResourceFileNames = [];

			for (const resource of resources) {
				if (resource.keyValuePairs[key]) {
					if (!hasMatch) {
						hoverText.appendMarkdown(`**KEY**: ${key}  \n\n`);
					}
					hoverText.appendMarkdown(`- **${resource.fileName}**: ${resource.keyValuePairs[key]}  \n\n`);
					hasMatch = true;
					existingResourceFileNames.push(resource.fileName);
				} else {
					missingResourceFileNames.push(resource.fileName);
				}
			}

			if (hasMatch) {
				if (missingResourceFileNames.length > 0) {
					hoverText.appendMarkdown(`[Edit/Add Translations](command:${actions.addResource}?${encodeURIComponent(JSON.stringify([key, missingResourceFileNames]))}) \n\n`);
					hoverText.appendMarkdown(`Missing translations: ${missingResourceFileNames.join(', ')} \n\n`);
				} else {
					hoverText.appendMarkdown(`[Edit Translations](command:${actions.editResource}?${encodeURIComponent(JSON.stringify([key]))}) \n\n`);
				}
				hoverText.appendMarkdown(`[Delete Translations](command:${actions.deleteResource}?${encodeURIComponent(JSON.stringify([key]))}) \n\n`);
			} else {
				hoverText.appendMarkdown("**Language definition not found!**");
				hoverText.appendMarkdown(`\n\n[Add Translations](command:${actions.addResource}?${encodeURIComponent(JSON.stringify([key]))}) \n\n`);
			}

			// Add Bulk Edit button - get all keys from current document
			const activeEditor = vscode.window.activeTextEditor;
			if (activeEditor) {
				const allKeys = SettingUtils.getAllResourceKeysFromDocument(activeEditor.document);
				if (allKeys.length > 1) {
					hoverText.appendMarkdown(`---\n\n`);
					hoverText.appendMarkdown(`[📋 Bulk Edit (${allKeys.length} keys)](command:${actions.bulkEditResources}?${encodeURIComponent(JSON.stringify([allKeys, activeEditor.document.uri.toString()]))})`);
				}
			}

			return new vscode.Hover(hoverText);
		} catch (error) {
			Logger.log("❌ ERROR in hoverForCode:", error);
			return undefined;
		}
	}
}