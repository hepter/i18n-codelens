import * as vscode from 'vscode';
import SettingUtils from '../SettingUtils';

export class DecoratorProvider implements vscode.Disposable {
	constructor() {
		this.initialize();
	}

	private disposables: vscode.Disposable[] = [];
	private timeout: NodeJS.Timer | undefined = undefined;
	private activeEditor = vscode.window.activeTextEditor;
	private resourceExistDecorationType = vscode.window.createTextEditorDecorationType({
		light: {
			textDecoration: "underline #126e1a"
		},
		dark: {
			textDecoration: "underline #2add38"
		}
	});
	private resourceNotFoundDecorationType = vscode.window.createTextEditorDecorationType({
		light: {
			textDecoration: "underline #6e1212"
		},
		dark: {
			textDecoration: "underline #df3a3a"
		}
	});
	private resourceWarnDecorationType = vscode.window.createTextEditorDecorationType({
		light: {
			textDecoration: "underline #806a00"
		},
		dark: {
			textDecoration: "underline #ffd91a"
		}
	});
	private resourceNoReferenceDecorationType = vscode.window.createTextEditorDecorationType({
		opacity: "0.5"
	});



	dispose() {
		this.disposables.forEach(item => item.dispose());
		this.disposables = [];
	}


	private initialize = () => {

		if (this.activeEditor) {
			this.triggerUpdateDecorations(false);
		}

		vscode.window.onDidChangeActiveTextEditor(editor => {
			this.activeEditor = editor;
			if (editor) {
				this.triggerUpdateDecorations(false);
			}
		}, null, this.disposables);

		vscode.workspace.onDidChangeTextDocument(event => {
			if (this.activeEditor && event.document === this.activeEditor.document) {
				this.triggerUpdateDecorations(true);
			}
		}, null, this.disposables);

		SettingUtils.onDidChangeResource(e => {
			this.triggerUpdateDecorations(true);
		}, null, this.disposables);

	}


	public updateDecorations = async (textEditor?: vscode.TextEditor) => {
		const activeEditor = textEditor || this.activeEditor;

		if (!activeEditor || !SettingUtils.isEnabledCodeDecorator()) {
			return;
		}

		if (SettingUtils.isResourceFilePath(activeEditor.document?.uri?.path)) {
			this.updateDecorationForResource(activeEditor);
		}
		else if (SettingUtils.isCodeFilePath(activeEditor.document?.uri?.path)) {
			this.updateDecorationForCode(activeEditor);
		}
	}

	triggerUpdateDecorations = (throttle: boolean) => {
		if (this.timeout) {
			clearTimeout(this.timeout);
			this.timeout = undefined;
		}
		if (throttle) {
			this.timeout = setTimeout(this.updateDecorations, 500);
		} else {
			this.updateDecorations();
		}
	}


	updateDecorationForCode(textEditor: vscode.TextEditor) {


		const resources = SettingUtils.getResources();
		const resourceRegex = SettingUtils.getResourceCodeRegex();

		const text = textEditor.document.getText();

		const successResources: vscode.DecorationOptions[] = [];
		const errorResources: vscode.DecorationOptions[] = [];
		const warnResources: vscode.DecorationOptions[] = [];
		let match;
		while ((match = resourceRegex.exec(text))) {
			const startPos = textEditor.document.positionAt(match.index);
			const endPos = textEditor.document.positionAt(match.index + match[0].length);
			const range = new vscode.Range(startPos, endPos);
			const word = textEditor.document.getText(range);
			const decoration = { range };

			let matchCount = 0;
			resources.forEach((item) => {
				if (item.keyValuePairs[word]) {
					matchCount++;
				}
			});
			const isAllResourcesExist = matchCount == resources.length;
			if (isAllResourcesExist) {
				successResources.push(decoration);
			} else if (matchCount > 0) {
				warnResources.push(decoration);
			}
			else {
				errorResources.push(decoration);
			}
		}

		textEditor.setDecorations(this.resourceExistDecorationType, successResources);
		textEditor.setDecorations(this.resourceNotFoundDecorationType, errorResources);
		textEditor.setDecorations(this.resourceWarnDecorationType, warnResources);

	}

	updateDecorationForResource(textEditor: vscode.TextEditor) {

		const text = textEditor.document.getText();
		const lines = text.split(/\r?\n/g);
		let lineNumber = 0;
		const unusedResources = [];


		for (const line of lines) {
			const match = SettingUtils.getResourceLineMatch(line);
			const key = match?.groups?.key;
			if (key) {
				const locations = SettingUtils.getResourceLocationsByKey(key);
				const locationsExceptResourceFiles = locations?.filter(location => !SettingUtils.isResourceFilePath(location.uri.fsPath));
				if (!locationsExceptResourceFiles?.length) {
					const range = new vscode.Range(new vscode.Position(lineNumber, 0), new vscode.Position(lineNumber, line.length));
					const decoration = { range };
					unusedResources.push(decoration);
				}
			}
			lineNumber++;
		}

		textEditor.setDecorations(this.resourceNoReferenceDecorationType, unusedResources);
	}

}

