import * as vscode from 'vscode';
import { getLanguageResourcesFiles } from '../Utils';

export class DecoratorProvider {

	private regex!: RegExp;
	private context!: vscode.ExtensionContext;
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
	constructor(context: vscode.ExtensionContext) {
		this.context = context;
		this.refreshRegexFromConfig();

		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration("i18n-codelens.languageTranslatorRegex")) {
				this.refreshRegexFromConfig();
			}
		}, this.context.subscriptions);
		this.initialize();
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
		}, null, this.context.subscriptions);

		vscode.workspace.onDidChangeTextDocument(event => {
			if (this.activeEditor && event.document === this.activeEditor.document) {
				this.triggerUpdateDecorations(true);
			}
		}, null, this.context.subscriptions);

		const resourceGlobPattern = vscode.workspace.getConfiguration("i18n-codelens").get("languageGlobPattern", "**/locales/*.json");
		const watcher = vscode.workspace.createFileSystemWatcher(resourceGlobPattern, false, false, true);
		watcher.onDidChange((e) => {
			this.triggerUpdateDecorations(true);
		}, null, this.context.subscriptions);

	}

	private refreshRegexFromConfig = () => {
		const hoverRegex = vscode.workspace.getConfiguration("i18n-codelens").get("languageTranslatorRegex", "");
		this.regex = new RegExp(hoverRegex, "g");
	}


	public updateDecorations = async (textEditor?: vscode.TextEditor) => {
		const activeEditor = textEditor || this.activeEditor;
		const isDecorationEnabled = vscode.workspace.getConfiguration("i18n-codelens").get("enableUnderlineResourceDecorator", true);
		if (!activeEditor || !isDecorationEnabled) {
			return;
		}
		const resourceList = await getLanguageResourcesFiles();


		const text = activeEditor.document.getText();
		const successResources: vscode.DecorationOptions[] = [];
		const errorResources: vscode.DecorationOptions[] = [];
		const warnResources: vscode.DecorationOptions[] = [];
		let match;
		while ((match = this.regex.exec(text))) {
			const startPos = activeEditor.document.positionAt(match.index);
			const endPos = activeEditor.document.positionAt(match.index + match[0].length);
			const range = new vscode.Range(startPos, endPos);
			const word = activeEditor.document.getText(range);
			const decoration = { range };

			let matchCount = 0;
			resourceList.forEach((item) => {
				if (item.keyValuePairs[word]) {
					matchCount++;
				}
			});
			const isAllResourcesExist = matchCount == resourceList.length;
			if (isAllResourcesExist) {
				successResources.push(decoration);
			} else if (matchCount > 0) {
				warnResources.push(decoration);
			}
			else {
				errorResources.push(decoration);
			}
		}
		this.regex.lastIndex = 0;
		activeEditor.setDecorations(this.resourceExistDecorationType, successResources);
		activeEditor.setDecorations(this.resourceNotFoundDecorationType, errorResources);
		activeEditor.setDecorations(this.resourceWarnDecorationType, warnResources);

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
}

