import * as vscode from 'vscode';
import SettingUtils from '../SettingUtils';




export default class DefinitionProvider implements vscode.DefinitionProvider {
	provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Definition> {
		let keyRange;

		if (SettingUtils.isResourceFilePath(document.uri.fsPath)) {
			keyRange = document.getWordRangeAtPosition(position, SettingUtils.getResourceLineRegex());
		} else {
			keyRange = document.getWordRangeAtPosition(position, SettingUtils.getResourceCodeRegex());
		}


		const key = document.getText(keyRange);
		const locations = SettingUtils.getResourceLocationsByKey(key) || [];
		return locations;
	}
}