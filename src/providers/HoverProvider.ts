import * as vscode from 'vscode';
import SettingUtils from '../SettingUtils';
import { Logger } from '../Utils';
import { actions } from '../constants';

export class HoverProvider implements vscode.HoverProvider {
	provideHover(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken
	): vscode.ProviderResult<vscode.Hover> {
		try {

			let keyRange;
			if (SettingUtils.isResourceFilePath(document.uri.fsPath)) {
				keyRange = document.getWordRangeAtPosition(position, SettingUtils.getResourceLineRegex());
			} else {
				keyRange = document.getWordRangeAtPosition(position, SettingUtils.getResourceCodeRegex());
			}


			const key = keyRange && document.getText(keyRange);
			if (!key) return;

			return this.buildHover(key);
		} catch (err) {
			Logger.error('ERROR in provideHover:', err);
		}
		return;
	}

	private buildHover(key: string): vscode.Hover | undefined {
		try {
			const resources = SettingUtils.getResources();
			const existingFiles: string[] = [];
			const missingFiles: string[] = [];

			for (const res of resources) {
				if (res.keyValuePairs[key]) {
					existingFiles.push(res.fileName);
				} else {
					missingFiles.push(res.fileName);
				}
			}

			const md = new vscode.MarkdownString('');
			md.isTrusted = true;

			// Title and key
			md.appendMarkdown(`### **🔑 ${key}**  \n`);

			// One line per file/language
			for (const res of resources) {
				const text = res.keyValuePairs[key];
				if (text) {
					md.appendMarkdown(
						`**${res.fileName}**: ${text} [✏️](command:${actions.editResource}?${encodeURIComponent(
							JSON.stringify([key, [res.fileName]])
						)})  \n`
					);
				} else {
					md.appendMarkdown(
						`**${res.fileName}**: ❌ [add](command:${actions.addResource}?${encodeURIComponent(
							JSON.stringify([key, [res.fileName]])
						)})  \n`
					);
				}
			}

			// Bottom actions
			const bottom: string[] = [];
			if (existingFiles.length === 0) {
				bottom.push(
					`[Add All](command:${actions.addResource}?${encodeURIComponent(
						JSON.stringify([key, missingFiles])
					)})`
				);
			} else {
				if (missingFiles.length > 0) {
					bottom.push(
						`[Add missing](command:${actions.addResource}?${encodeURIComponent(
							JSON.stringify([key, missingFiles])
						)})`
					);
				}
				bottom.push(
					`[Edit](command:${actions.editResource}?${encodeURIComponent(
						JSON.stringify([key, existingFiles])
					)})`
				);
				bottom.push(
					`[Delete](command:${actions.deleteResource}?${encodeURIComponent(
						JSON.stringify([key])
					)})`
				);
			}
			md.appendMarkdown(`\n${bottom.join(' | ')}  \n`);

			// Bulk edit always at bottom
			const editor = vscode.window.activeTextEditor;
			if (editor) {
				const allKeys = SettingUtils.getAllResourceKeysFromDocument(
					editor.document
				);
				if (allKeys.length > 1) {
					md.appendMarkdown(`\n---\n`);
					md.appendMarkdown(
						`[Bulk edit (${allKeys.length})](command:${actions.bulkEditResources}?${encodeURIComponent(
							JSON.stringify([allKeys, editor.document.uri.toString()])
						)})`
					);
				}
			}

			return new vscode.Hover(md);
		} catch (err) {
			Logger.error('ERROR in buildHover:', err);
			return;
		}
	}
}
