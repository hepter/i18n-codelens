import * as vscode from 'vscode';
import SettingUtils from '../SettingUtils';
import { Logger } from '../Utils';

interface BulkEditData {
	[key: string]: {
		[language: string]: string;
	};
}

export default async function ActionBulkEditResources(keysFromDocument: string[], sourceDocument?: vscode.TextDocument) {
	try {
		Logger.info(`Starting bulk edit for ${keysFromDocument.length} keys:`, keysFromDocument);
		
		const sourceFileName = sourceDocument ? sourceDocument.fileName.split('\\').pop()?.split('/').pop() || 'Unknown' : 'Command Palette';
		const sourceFilePath = sourceDocument ? sourceDocument.fileName : '';
		
		Logger.info(`Source file: ${sourceFileName} (${sourceFilePath})`);

		const resources = SettingUtils.getResources();
		if (!resources.length) {
			vscode.window.showWarningMessage('No resource files found.');
			return;
		}

		// Create webview panel
		const panel = vscode.window.createWebviewPanel(
			'bulkEditResources',
			`Bulk Edit Translations - ${sourceFileName}`,
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [],
				enableCommandUris: true
			}
		);

		// Prepare data for webview
		const bulkEditData: BulkEditData = {};
		for (const key of keysFromDocument) {
			bulkEditData[key] = {};
			for (const resource of resources) {
				bulkEditData[key][resource.fileName] = resource.keyValuePairs[key] || '';
			}
		}

		// Generate HTML content
		panel.webview.html = generateBulkEditHtml(bulkEditData, resources.map(r => r.fileName), resources, sourceFileName, sourceFilePath);

		// Handle messages from webview
		panel.webview.onDidReceiveMessage(
			async (message) => {
				switch (message.command) {
					case 'save':
						await saveBulkEditData(message.data);
						panel.dispose();
						break;
					case 'deleteAll':
						await deleteBulkResources(keysFromDocument);
						panel.dispose();
						break;
					case 'cancel':
						panel.dispose();
						break;
				}
			}
		);

	} catch (error) {
		Logger.error("ERROR in ActionBulkEditResources:", error);
		vscode.window.showErrorMessage(`Failed to open bulk edit: ${error instanceof Error ? error.message : String(error)}`);
	}
}

async function deleteBulkResources(keys: string[]) {
	try {
		Logger.info(`Starting bulk delete for ${keys.length} keys:`, keys);

		const resources = SettingUtils.getResources();
		const workspaceEdit = new vscode.WorkspaceEdit();
		let updatedFileCount = 0;

		// Apply deletions to each resource file
		for (const resource of resources) {
			try {
				// Read current JSON content
				const fileContent = (await vscode.workspace.fs.readFile(resource.uri)).toString();
				const jsonData = JSON.parse(fileContent);

				// Delete all specified keys
				let hasChanges = false;
				let deletedCount = 0;
				for (const key of keys) {
					if (key in jsonData) {
						delete jsonData[key];
						hasChanges = true;
						deletedCount++;
					}
				}

				if (hasChanges) {
					// Convert back to formatted JSON
					const newContent = JSON.stringify(jsonData, null, 2) + '\n';

					// Create workspace edit to replace entire file content
					workspaceEdit.replace(
						resource.uri,
						new vscode.Range(
							new vscode.Position(0, 0),
							new vscode.Position(Number.MAX_SAFE_INTEGER, 0)
						),
						newContent
					);
					updatedFileCount++;

					Logger.info(`Deleted ${deletedCount} keys from ${resource.fileName}`);
				}

			} catch (error) {
				Logger.error(`ERROR processing file ${resource.fileName}:`, error);
				vscode.window.showErrorMessage(`Failed to delete from ${resource.fileName}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}

		if (updatedFileCount > 0) {
			// Apply all changes at once
			let dispose;
			if (SettingUtils.isEnabledAutoSave()) {
				dispose = vscode.workspace.onDidChangeTextDocument(e => {
					e.document.save();
				});
			}

			await vscode.workspace.applyEdit(workspaceEdit);
			dispose?.dispose();

			Logger.info(`Bulk delete completed successfully for ${updatedFileCount} files`);
			vscode.window.showInformationMessage(`Successfully deleted ${keys.length} translation keys from ${updatedFileCount} files.`);
		} else {
			Logger.info("No keys were found to delete");
			vscode.window.showInformationMessage("No keys were found to delete.");
		}

	} catch (error) {
		Logger.error("ERROR in bulk delete:", error);
		vscode.window.showErrorMessage(`Failed to delete translations: ${error instanceof Error ? error.message : String(error)}`);
	}
}

async function saveBulkEditData(data: BulkEditData) {
	try {
		Logger.info("Saving bulk edit data...");

		const resources = SettingUtils.getResources();
		const workspaceEdit = new vscode.WorkspaceEdit();
		let updatedFileCount = 0;

		// Group changes by resource file
		const fileChanges: { [fileName: string]: { [key: string]: string } } = {};

		for (const [key, translations] of Object.entries(data)) {
			for (const [language, value] of Object.entries(translations)) {
				if (value.trim() !== '') {
					if (!fileChanges[language]) {
						fileChanges[language] = {};
					}
					fileChanges[language][key] = value.trim();
				}
			}
		}

		// Apply changes to each resource file
		for (const resource of resources) {
			const changes = fileChanges[resource.fileName];
			if (!changes || Object.keys(changes).length === 0) {
				continue;
			}

			try {
				// Read current JSON content
				const fileContent = (await vscode.workspace.fs.readFile(resource.uri)).toString();
				const jsonData = JSON.parse(fileContent);

				// Update JSON with new values
				let hasChanges = false;
				for (const [key, value] of Object.entries(changes)) {
					if (jsonData[key] !== value) {
						jsonData[key] = value;
						hasChanges = true;
					}
				}

				if (hasChanges) {
					// Convert back to formatted JSON
					const newContent = JSON.stringify(jsonData, null, 2) + '\n';

					// Create workspace edit to replace entire file content
					workspaceEdit.replace(
						resource.uri,
						new vscode.Range(
							new vscode.Position(0, 0),
							new vscode.Position(Number.MAX_SAFE_INTEGER, 0)
						),
						newContent
					);
					updatedFileCount++;

					Logger.info(`Updated ${Object.keys(changes).length} keys in ${resource.fileName}`);
				}

			} catch (error) {
				Logger.error(`ERROR processing file ${resource.fileName}:`, error);
				vscode.window.showErrorMessage(`Failed to update ${resource.fileName}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}

		if (updatedFileCount > 0) {
			// Apply all changes at once
			let dispose;
			if (SettingUtils.isEnabledAutoSave()) {
				dispose = vscode.workspace.onDidChangeTextDocument(e => {
					e.document.save();
				});
			}

			await vscode.workspace.applyEdit(workspaceEdit);
			dispose?.dispose();

			Logger.info(`Bulk edit completed successfully for ${updatedFileCount} files`);
			vscode.window.showInformationMessage(`Successfully updated ${updatedFileCount} translation files.`);
		} else {
			Logger.info("No changes were made in bulk edit");
			vscode.window.showInformationMessage("No changes were made.");
		}

	} catch (error) {
		Logger.error("ERROR saving bulk edit data:", error);
		vscode.window.showErrorMessage(`Failed to save translations: ${error instanceof Error ? error.message : String(error)}`);
	}
}

function generateBulkEditHtml(data: BulkEditData, languages: string[], resources: any[], sourceFileName: string, sourceFilePath: string): string {
	const keys = Object.keys(data);
	const resourceFileNames = resources.map(r => r.fileName).join(', ');

	return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bulk Edit Translations - ${sourceFileName}</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
            padding: 20px;
        }
        
        .header {
            margin-bottom: 30px;
            padding-bottom: 15px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .header h1 {
            margin: 0 0 10px 0;
            color: var(--vscode-foreground);
        }
        
        .header p {
            margin: 0 0 10px 0;
            color: var(--vscode-descriptionForeground);
        }
        
        .file-info {
            font-size: 0.9em;
            color: var(--vscode-symbolIcon-fileForeground);
            background-color: var(--vscode-editor-lineHighlightBackground);
            padding: 8px 12px;
            border-radius: 4px;
            border-left: 3px solid var(--vscode-symbolIcon-fileForeground);
        }
        
        .header h1 {
            margin: 0 0 10px 0;
            color: var(--vscode-foreground);
        }
        
        .header p {
            margin: 0;
            color: var(--vscode-descriptionForeground);
        }
        
        .translation-grid {
            display: grid;
            grid-template-columns: minmax(150px, 200px) repeat(${languages.length}, minmax(150px, 1fr));
            gap: 10px;
            margin-bottom: 30px;
            align-items: center;
            overflow-x: auto;
        }
        
        .grid-header {
            font-weight: bold;
            color: var(--vscode-foreground);
            padding: 10px;
            background-color: var(--vscode-editor-lineHighlightBackground);
            border-radius: 3px;
            text-align: center;
        }
        
        .key-cell {
            font-weight: bold;
            color: var(--vscode-symbolIcon-keywordForeground);
            padding: 8px;
            word-break: break-word;
        }
        
        .input-cell {
            padding: 4px 0px;
            box-sizing: border-box;
            min-width: 0; /* Allow shrinking */
        }
        
        .translation-input {
            width: 100%;
            padding: 8px;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 3px;
            font-family: inherit;
            font-size: inherit;
            box-sizing: border-box;
            min-width: 0; /* Allow shrinking */
        }
        
        .translation-input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        
        .translation-input.empty {
            background-color: var(--vscode-inputValidation-warningBackground);
            border-color: var(--vscode-inputValidation-warningBorder);
        }
        
        .actions {
            display: flex;
            gap: 10px;
            justify-content: flex-end;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid var(--vscode-panel-border);
        }
        
        .btn {
            padding: 10px 20px;
            border: 1px solid var(--vscode-button-border);
            border-radius: 3px;
            cursor: pointer;
            font-family: inherit;
            font-size: inherit;
        }
        
        .btn-primary {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        
        .btn-primary:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .btn-secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        
        .btn-secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        
        .btn-danger {
            background-color: var(--vscode-inputValidation-errorBackground);
            color: var(--vscode-inputValidation-errorForeground);
            border-color: var(--vscode-inputValidation-errorBorder);
        }
        
        .btn-danger:hover {
            background-color: var(--vscode-errorForeground);
            color: var(--vscode-editor-background);
        }
        
        .stats {
            background-color: var(--vscode-editor-lineHighlightBackground);
            padding: 10px;
            border-radius: 5px;
            margin-bottom: 20px;
            font-size: 0.9em;
            color: var(--vscode-descriptionForeground);
        }
        
        /* Confirmation Dialog Styles */
        .modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
        }
        
        .modal-content {
            background-color: var(--vscode-editor-background);
            margin: 15% auto;
            padding: 20px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 5px;
            width: 400px;
            max-width: 80%;
        }
        
        .modal h3 {
            margin: 0 0 15px 0;
            color: var(--vscode-errorForeground);
        }
        
        .modal p {
            margin: 0 0 20px 0;
            color: var(--vscode-foreground);
        }
        
        .modal-actions {
            display: flex;
            gap: 10px;
            justify-content: flex-end;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🌐 Bulk Edit Translations</h1>
        <p>Edit translations for ${keys.length} keys across ${languages.length} languages</p>
        <div class="file-info">
            <strong>📝 Source:</strong> ${sourceFileName}
            ${sourceFilePath ? `<br><small>${sourceFilePath}</small>` : ''}
        </div>
        <div class="file-info" style="margin-top: 10px;">
            <strong>📁 Target files:</strong> ${resourceFileNames}
        </div>
    </div>

    <div class="stats">
        📊 <strong>${keys.length}</strong> translation keys • <strong>${languages.length}</strong> languages • <strong>${keys.length * languages.length}</strong> total inputs
    </div>

    <div class="translation-grid">
        <div class="grid-header">Key</div>
        ${languages.map(lang => `<div class="grid-header">${lang}</div>`).join('')}
        
        ${keys.map(key => `
            <div class="key-cell">${key}</div>
            ${languages.map(lang => `
                <div class="input-cell">
                    <input 
                        type="text" 
                        class="translation-input ${data[key][lang] ? '' : 'empty'}" 
                        data-key="${key}" 
                        data-language="${lang}" 
                        value="${data[key][lang] || ''}" 
                        placeholder="Enter ${lang} translation..."
                    />
                </div>
            `).join('')}
        `).join('')}
    </div>

    <div class="actions">
        <button class="btn btn-secondary" onclick="cancel()">Cancel</button>
        <button class="btn btn-danger" onclick="showDeleteConfirm()">🗑️ Delete All Resources</button>
        <button class="btn btn-primary" onclick="save()">Save All Changes</button>
    </div>

    <!-- Delete Confirmation Modal -->
    <div id="deleteModal" class="modal">
        <div class="modal-content">
            <h3>⚠️ Confirm Deletion</h3>
            <p>Are you sure you want to delete all <strong>${keys.length}</strong> translation key(s)?</p>
            <p><em>This action cannot be undone.</em></p>
            <div class="modal-actions">
                <button class="btn btn-secondary" onclick="hideDeleteConfirm()">Cancel</button>
                <button class="btn btn-danger" onclick="confirmDelete()">Delete All</button>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        function save() {
            const data = {};
            const inputs = document.querySelectorAll('.translation-input');
            
            inputs.forEach(input => {
                const key = input.dataset.key;
                const language = input.dataset.language;
                const value = input.value.trim();
                
                if (!data[key]) {
                    data[key] = {};
                }
                data[key][language] = value;
            });
            
            vscode.postMessage({
                command: 'save',
                data: data
            });
        }
        
        function cancel() {
            vscode.postMessage({
                command: 'cancel'
            });
        }
        
        function deleteAll() {
            showDeleteConfirm();
        }
        
        function showDeleteConfirm() {
            document.getElementById('deleteModal').style.display = 'block';
        }
        
        function hideDeleteConfirm() {
            document.getElementById('deleteModal').style.display = 'none';
        }
        
        function confirmDelete() {
            hideDeleteConfirm();
            vscode.postMessage({
                command: 'deleteAll'
            });
        }
        
        // Auto-update empty class
        document.addEventListener('input', (e) => {
            if (e.target.classList.contains('translation-input')) {
                if (e.target.value.trim()) {
                    e.target.classList.remove('empty');
                } else {
                    e.target.classList.add('empty');
                }
            }
        });
        
        // Close modal when clicking outside
        document.addEventListener('click', (e) => {
            const modal = document.getElementById('deleteModal');
            if (e.target === modal) {
                hideDeleteConfirm();
            }
        });
    </script>
</body>
</html>`;
}
