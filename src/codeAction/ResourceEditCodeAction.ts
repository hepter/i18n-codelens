import * as vscode from 'vscode';
import { getLanguageResourcesFiles } from '../Utils';

export class ResourceEditCodeAction implements vscode.CodeActionProvider {

	private regex!: RegExp;

	constructor(context: vscode.ExtensionContext) {
		this.refreshRegexFromConfig();
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration("i18n-codelens.languageTranslatorRegex")) {
				this.refreshRegexFromConfig();
			}
		}, null, context.subscriptions);
	}

	private refreshRegexFromConfig() {
		const hoverRegex = vscode.workspace.getConfiguration("i18n-codelens").get("languageTranslatorRegex", "");
		this.regex = new RegExp(hoverRegex, "g");
	}

	public static readonly providedCodeActionKinds = [
		vscode.CodeActionKind.Refactor
	];

	public async provideCodeActions(document: vscode.TextDocument, range: vscode.Range): Promise<vscode.CodeAction[] | undefined> {
		const codeActionList: vscode.CodeAction[] = [];

		const startPosition = new vscode.Position(range.start.line, range.start.character);
		const keyRange = document.getWordRangeAtPosition(startPosition, new RegExp(this.regex)); ///(?<=['"])[\w-_.]+(?=['"])/);
		const resourceKey = document.getText(keyRange);

		if (!range || !resourceKey) {
			return;
		}

		const resources = await getLanguageResourcesFiles();
		const missingResourceFileNames = [];
		const existingResourceFileNames = [];
		for (const resource of resources) {
			if (!resource.keyValuePairs[resourceKey]) {
				missingResourceFileNames.push(resource.fileName);
			} else {
				existingResourceFileNames.push(resource.fileName);
			}
		}


		if (missingResourceFileNames.length > 0) {
			const titleAdd = `Add all missing resources for '${resourceKey}' resource key. (${missingResourceFileNames.join(", ")})`;
			const actionAdd = new vscode.CodeAction(titleAdd, vscode.CodeActionKind.Refactor);
			actionAdd.command = {
				title: titleAdd,
				command: "i18n-codelens.codelensActionAddLanguageResource",
				tooltip: 'This will open the input-box for every target language.',
				arguments: [resourceKey]
			};
			codeActionList.push(actionAdd);
		}

		if (existingResourceFileNames.length > 0) {
			const titleEdit = `Update all resources for '${resourceKey}' resource key. (${existingResourceFileNames.join(", ")})`;
			const actionEdit = new vscode.CodeAction(titleEdit, vscode.CodeActionKind.Refactor);
			actionEdit.command = {
				title: titleEdit,
				command: "i18n-codelens.codeActionEditLanguageResource",
				tooltip: 'This will open the input-box for every target language.',
				arguments: [resourceKey]
			};
			codeActionList.push(actionEdit);
		}

		return codeActionList;
	}

}
