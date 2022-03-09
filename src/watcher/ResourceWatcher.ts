import * as path from 'path';
import * as vscode from 'vscode';
import ActionRefreshLanguageResource from '../actions/ActionRefreshLanguageResource';


export default function ResourceWatcher() {
	const resourceGlobPattern = vscode.workspace.getConfiguration("akinon-codelens").get("languageGlobPattern", "**/locales/*.json");

	const watcher = vscode.workspace.createFileSystemWatcher(resourceGlobPattern, false, false, true);


	return watcher.onDidChange((e) => {
		const file = path.parse(e.fsPath);

		console.log(`Resource file '${file.name}' was changed!`);
		ActionRefreshLanguageResource(e.fsPath);
	});
}