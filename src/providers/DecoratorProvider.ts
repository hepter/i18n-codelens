import * as vscode from 'vscode';
import { extensionName } from '../constants';
import SettingUtils from '../SettingUtils';
import { Logger } from '../Utils';

export class DecoratorProvider implements vscode.Disposable {
	constructor() {
		try {
			Logger.info("Initializing DecoratorProvider...");
			this.initialize();
			Logger.info("DecoratorProvider initialized successfully");
		} catch (error) {
			Logger.error("ERROR initializing DecoratorProvider:", error);
			throw error;
		}
	}

	private disposables: vscode.Disposable[] = [];
	private timeout: ReturnType<typeof setTimeout> | undefined = undefined;
	private activeEditor = vscode.window.activeTextEditor;
	private resourceExistDecorationType!: vscode.TextEditorDecorationType;
	private resourceNotFoundDecorationType!: vscode.TextEditorDecorationType;
	private resourceWarnDecorationType!: vscode.TextEditorDecorationType;
	private resourceNoReferenceDecorationType!: vscode.TextEditorDecorationType;

	private createDecorationTypes() {
		// Dispose old decorations if they exist
		this.resourceExistDecorationType?.dispose();
		this.resourceNotFoundDecorationType?.dispose();
		this.resourceWarnDecorationType?.dispose();
		this.resourceNoReferenceDecorationType?.dispose();

		const showOverviewRuler = SettingUtils.isEnabledOverviewRulerMarkers();

		this.resourceExistDecorationType = vscode.window.createTextEditorDecorationType({
			light: {
				textDecoration: "underline #126e1a"
			},
			dark: {
				textDecoration: "underline #2add38"
			}
		});

		this.resourceNotFoundDecorationType = vscode.window.createTextEditorDecorationType({
			light: {
				textDecoration: "underline #6e1212"
			},
			dark: {
				textDecoration: "underline #df3a3a"
			},
			...(showOverviewRuler && {
				overviewRulerColor: "rgba(223, 58, 58, 0.7)",
				overviewRulerLane: vscode.OverviewRulerLane.Right
			})
		});

		this.resourceWarnDecorationType = vscode.window.createTextEditorDecorationType({
			light: {
				textDecoration: "underline #806a00"
			},
			dark: {
				textDecoration: "underline #ffd91a"
			},
			...(showOverviewRuler && {
				overviewRulerColor: "rgba(255, 217, 26, 0.7)",
				overviewRulerLane: vscode.OverviewRulerLane.Right
			})
		});

		this.resourceNoReferenceDecorationType = vscode.window.createTextEditorDecorationType({
			opacity: "0.5",
			...(showOverviewRuler && {
				overviewRulerColor: "rgba(136, 136, 136, 0.4)",
				overviewRulerLane: vscode.OverviewRulerLane.Right
			})
		});
	}



	dispose() {
		this.resourceExistDecorationType?.dispose();
		this.resourceNotFoundDecorationType?.dispose();
		this.resourceWarnDecorationType?.dispose();
		this.resourceNoReferenceDecorationType?.dispose();
		this.disposables.forEach(item => item.dispose());
		this.disposables = [];
	}


	private initialize = () => {
		// Create initial decoration types
		this.createDecorationTypes();

		// Listen for configuration changes
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(`${extensionName}.overviewRulerMarkers`)) {
				this.createDecorationTypes();
				this.triggerUpdateDecorations(false);
			}
		}, null, this.disposables);

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

		SettingUtils.onDidChangeResourceLocations(e => {
			this.triggerUpdateDecorations(true);
		}, null, this.disposables);

	};


	public updateDecorations = async (textEditor?: vscode.TextEditor) => {
		try {
			const activeEditor = textEditor || this.activeEditor;

			if (!activeEditor || !SettingUtils.isEnabledCodeDecorator()) {
				return;
			}

			const documentPath = activeEditor.document.uri.fsPath;

			if (SettingUtils.isResourceFilePath(documentPath)) {
				this.updateDecorationForResource(activeEditor);
			}
			else if (SettingUtils.isCodeFilePath(documentPath)) {
				this.updateDecorationForCode(activeEditor);
			}
		} catch (error) {
			Logger.error("ERROR in updateDecorations:", error);
		}
	};

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
	};


	updateDecorationForCode(textEditor: vscode.TextEditor) {
		try {
			const resources = SettingUtils.getResources();
			const resourceRegex = SettingUtils.getResourceCodeRegex();

			const text = textEditor.document.getText();

			const successResources: vscode.DecorationOptions[] = [];
			const errorResources: vscode.DecorationOptions[] = [];
			const warnResources: vscode.DecorationOptions[] = [];
			let match;
			while ((match = resourceRegex.exec(text))) {
				const key = match.groups?.key ?? match[0];
				const startOffset = this.getMatchedKeyOffset(match, key);
				const startPos = textEditor.document.positionAt(startOffset);
				const endPos = textEditor.document.positionAt(startOffset + key.length);
				const range = new vscode.Range(startPos, endPos);
				const decoration = { range };

				let matchCount = 0;
				resources.forEach((item) => {
					if (Object.prototype.hasOwnProperty.call(item.keyValuePairs, key)) {
						matchCount++;
					}
				});
				const isAllResourcesExist = resources.length > 0 && matchCount == resources.length;
				Logger.debug(`Decoration match '${key}': ${matchCount}/${resources.length} resource files`);
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
		} catch (error) {
			Logger.error("ERROR in updateDecorationForCode:", error);
		}
	}

	private getMatchedKeyOffset(match: RegExpExecArray, key: string): number {
		if (match[0] === key) {
			return match.index;
		}

		const relativeOffset = match[0].indexOf(key);
		return relativeOffset >= 0 ? match.index + relativeOffset : match.index;
	}

	updateDecorationForResource(textEditor: vscode.TextEditor) {
		try {
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
		} catch (error) {
			Logger.error("ERROR in updateDecorationForResource:", error);
		}
	}

}
