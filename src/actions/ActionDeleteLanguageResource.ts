
import * as vscode from 'vscode';
import SettingUtils from '../SettingUtils';
import { Logger } from '../Utils';

export default async function ActionDeleteLanguageResource(key: string) {
	try {
		Logger.log(`🗑️ Starting delete language resource action for key: ${key}`);
		
		const resources = SettingUtils.getResources();
		const workspaceEdit = new vscode.WorkspaceEdit();
		let deletionCount = 0;

		for (const resource of resources) {
			try {
				// Check if key exists in this resource
				if (!resource.keyValuePairs[key]) {
					continue; // Key doesn't exist in this resource file
				}

				// Read and parse JSON content
				const fileContent = (await vscode.workspace.fs.readFile(resource.uri)).toString();
				const jsonData = JSON.parse(fileContent);
				
				// Delete the key if it exists
				if (key in jsonData) {
					delete jsonData[key];
					deletionCount++;
					
					// Convert back to formatted JSON
					const newContent = JSON.stringify(jsonData, null, 2) + '\n';
					
					// Replace entire file content
					workspaceEdit.replace(
						resource.uri,
						new vscode.Range(
							new vscode.Position(0, 0),
							new vscode.Position(Number.MAX_SAFE_INTEGER, 0)
						),
						newContent
					);
					
					Logger.log(`📝 Marked key '${key}' for deletion from ${resource.fileName}`);
				}
				
			} catch (error) {
				Logger.log(`❌ ERROR processing file ${resource.fileName}:`, error);
				vscode.window.showWarningMessage(`Failed to process ${resource.fileName}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}

		if (deletionCount > 0) {
			Logger.log(`🔍 Found ${deletionCount} instances to delete, asking for confirmation...`);
			
			//delete prompt
			const deletePrompt = await vscode.window.showInformationMessage(
				`Are you sure you want to delete the key '${key}' from ${deletionCount} file(s)?`,
				{ modal: true },
				'Yes'
			);
			if (deletePrompt !== 'Yes') {
				Logger.log(`⚠️ User cancelled deletion`);
				return;
			}

			let dispose;
			if (SettingUtils.isEnabledAutoSave()) {
				dispose = vscode.workspace.onDidChangeTextDocument(e => {
					e.document.save();
				});
			}

			await vscode.workspace.applyEdit(workspaceEdit);
			Logger.log(`✅ Successfully deleted translation(s) for key '${key}' from ${deletionCount} file(s)`);
			dispose?.dispose();
		} else {
			Logger.log(`ℹ️ No instances of key '${key}' found to delete`);
			vscode.window.showInformationMessage(`Key '${key}' not found in any resource files.`);
		}
	} catch (error) {
		Logger.log("❌ ERROR in ActionDeleteLanguageResource:", error);
		vscode.window.showErrorMessage(`Failed to delete language resource: ${error instanceof Error ? error.message : String(error)}`);
	}
}