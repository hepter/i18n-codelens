import * as vscode from 'vscode';
import { getLanguageResourcesFiles } from '../Utils';

export class DecoratorProvider {

	private regex!: RegExp;
	private context!: vscode.ExtensionContext;
	private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
	public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;
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
			this._onDidChangeCodeLenses.fire();
			if (e.affectsConfiguration("akinon-codelens.languageTranslatorRegex")) {
				this.refreshRegexFromConfig();
			}
		});
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

	}

	private refreshRegexFromConfig = () => {
		const hoverRegex = vscode.workspace.getConfiguration("akinon-codelens").get("languageTranslatorRegex", "");
		this.regex = new RegExp(hoverRegex, "g");
	}


	updateDecorations = async () => {
		if (!this.activeEditor) {
			return;
		}
		const resourceList = await getLanguageResourcesFiles();



		const text = this.activeEditor.document.getText();
		const successResources: vscode.DecorationOptions[] = [];
		const errorResources: vscode.DecorationOptions[] = [];
		const warnResources: vscode.DecorationOptions[] = [];
		let match;
		while ((match = this.regex.exec(text))) {
			const startPos = this.activeEditor.document.positionAt(match.index);
			const endPos = this.activeEditor.document.positionAt(match.index + match[0].length);
			const range = new vscode.Range(startPos, endPos);
			const word = this.activeEditor.document.getText(range);
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
		this.activeEditor.setDecorations(this.resourceExistDecorationType, successResources);
		this.activeEditor.setDecorations(this.resourceNotFoundDecorationType, errorResources);
		this.activeEditor.setDecorations(this.resourceWarnDecorationType, warnResources);
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

