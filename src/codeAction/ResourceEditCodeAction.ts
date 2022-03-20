import * as vscode from 'vscode';
import { actions } from '../constants';
import SettingUtils from '../SettingUtils';

export class ResourceEditCodeAction implements vscode.CodeActionProvider {

	public provideCodeActions(document: vscode.TextDocument, range: vscode.Range): vscode.CodeAction[] | undefined {

		if (!range) return;

		const codeActions = [];

		const line = document.lineAt(range.start);
		const isResourceFile = SettingUtils.isResourceFilePath(document.uri.fsPath);
		const isCodeFile = SettingUtils.isCodeFilePath(document.uri.fsPath);
		let key;
		if (isResourceFile) {
			key = SettingUtils.getResourceLineMatch(line.text)?.groups?.key;
		} else if (isCodeFile) {
			key = SettingUtils.getResourceCodeMatch(line.text)?.groups?.key;
		}
		if (!key) return;

		if (isCodeFile) {
			codeActions.push(...this.getCodeActionsForCode(key));
		}
		codeActions.push(...this.getCodeActionsForResource(key));
		return codeActions;

	}

	private getCodeActionsForResource(key: string) {
		const codeActionList: vscode.CodeAction[] = [];

		const [, existingResourceFileNames = []] = this.getMissingAndExistingResourceFileNames(key);

		if (existingResourceFileNames.length) {
			const titleDelete = `Delete '${key}' resource key. (${existingResourceFileNames.join(", ")})`;
			const actionDelete = new vscode.CodeAction(titleDelete, vscode.CodeActionKind.Refactor);
			actionDelete.command = {
				title: titleDelete,
				command: actions.deleteResource,
				tooltip: 'This will delete the resource key from all resource files.',
				arguments: [key],
			};
			codeActionList.push(actionDelete);
		}
		return codeActionList;
	}
	private getCodeActionsForCode(key: string) {
		const codeActionList: vscode.CodeAction[] = [];


		const [missingResourceFileNames = [], existingResourceFileNames = []] = this.getMissingAndExistingResourceFileNames(key);

		if (missingResourceFileNames.length > 0) {
			const titleAdd = `Add all missing resources for '${key}' resource key. (${missingResourceFileNames.join(", ")})`;
			const actionAdd = new vscode.CodeAction(titleAdd, vscode.CodeActionKind.Refactor);
			actionAdd.command = {
				title: titleAdd,
				command: actions.addResource,
				tooltip: 'This will open the input-box for every target language.',
				arguments: [key]
			};
			codeActionList.push(actionAdd);
		}

		if (existingResourceFileNames.length > 0) {
			const titleEdit = `Update all resources for '${key}' resource key. (${existingResourceFileNames.join(", ")})`;
			const actionEdit = new vscode.CodeAction(titleEdit, vscode.CodeActionKind.QuickFix);
			actionEdit.command = {
				title: titleEdit,
				command: actions.editResource,
				tooltip: 'This will open the input-box for every target language.',
				arguments: [key]
			};
			codeActionList.push(actionEdit);
		}

		return codeActionList;
	}


	private getMissingAndExistingResourceFileNames(key: string): [string[], string[]] {
		const resources = SettingUtils.getResources();
		const missingResourceFileNames = [];
		const existingResourceFileNames = [];
		for (const resource of resources) {
			if (!resource.keyValuePairs[key]) {
				missingResourceFileNames.push(resource.fileName);
			} else {
				existingResourceFileNames.push(resource.fileName);
			}
		}
		return [missingResourceFileNames, existingResourceFileNames];
	}
}
