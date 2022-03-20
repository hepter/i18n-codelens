
import * as vscode from 'vscode';
import SettingUtils from '../SettingUtils';

export default async function ActionDeleteLanguageResource(key: string) {
	const resources = SettingUtils.getResources();
	const workspaceEdit = new vscode.WorkspaceEdit();

	for (const resource of resources) {
		const fileLines = (await vscode.workspace.fs.readFile(resource.uri)).toString().split(/\r?\n/);
		let lineIndex = 0;

		for (const line of fileLines) {
			const matchKey = SettingUtils.getResourceLineMatch(line)?.groups?.key;
			if (matchKey === key) {
				workspaceEdit.delete(
					resource.uri,
					new vscode.Range(
						new vscode.Position(lineIndex, 0),
						new vscode.Position(lineIndex + 1, 0)
					)
				);
				break;
			}
			lineIndex++;
		}

	}

	if (workspaceEdit.size) {
		//delete prompt
		const deletePrompt = await vscode.window.showInformationMessage(
			`Are you sure you want to delete the key '${key}'?`,
			{ modal: true },
			'Yes'
		);
		if (deletePrompt !== 'Yes') return;

		let dispose;
		if (SettingUtils.isEnabledAutoSave()) {
			dispose = vscode.workspace.onDidChangeTextDocument(e => {
				e.document.save();
			});
		}

		await vscode.workspace.applyEdit(workspaceEdit);
		dispose?.dispose();
	}


}