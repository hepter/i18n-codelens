import * as vscode from 'vscode';
import { actions } from '../constants';
import SettingUtils from '../SettingUtils';
/**
 * CodelensProvider
 */
export class CodelensProvider implements vscode.CodeLensProvider {

    private codeLenses: vscode.CodeLens[] = [];
    private codeLensKeyWeakMap = new WeakMap<vscode.CodeLens, {
        languageKey: string,
        missingTranslationList: string[]
    }>();
    private static _onDidChangeCodeLenses = new vscode.EventEmitter<vscode.Disposable[]>();

    public static readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;


    constructor(disposables: vscode.Disposable[]) {
        SettingUtils.onDidChangeResourceLocations(() => {
            CodelensProvider._onDidChangeCodeLenses.fire();
        }, null, disposables);
    }

    public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] {

        if (!SettingUtils.isEnabledCodeLens()) return [];

        const resources = SettingUtils.getResources();
        const resourceRegex = SettingUtils.getResourceCodeRegex();

        this.codeLenses = [];
        const text = document.getText();

        let matches;
        while ((matches = resourceRegex.exec(text)) !== null) {


            const line = document.lineAt(document.positionAt(matches.index).line);
            const indexOf = line.text.indexOf(matches[0]);
            const position = new vscode.Position(line.lineNumber, indexOf);
            const range = document.getWordRangeAtPosition(position, new RegExp(resourceRegex));
            const missingTranslationList: string[] = [];
            const languageKey = matches[0];

            if (languageKey) {
                resources.forEach((item) => {
                    if (!item.keyValuePairs[languageKey]) {
                        missingTranslationList.push(item.fileName);
                    }
                });

            }

            if (range && missingTranslationList.length) {
                this.codeLenses.push(new vscode.CodeLens(range));
                this.codeLensKeyWeakMap.set(this.codeLenses[this.codeLenses.length - 1], { languageKey, missingTranslationList });
            }
        }
        return this.codeLenses;
    }

    public resolveCodeLens(codeLens: vscode.CodeLens, token: vscode.CancellationToken) {

        const codeLensState = this.codeLensKeyWeakMap.get(codeLens);

        if (SettingUtils.isEnabledCodeLens()) {
            codeLens.command = {
                title: `Missing Resource Key ('${codeLensState!.missingTranslationList.join(', ')}')`,
                tooltip: `Click to add missing language translations key ('${codeLensState!.languageKey}' -> ${codeLensState!.missingTranslationList.join(', ')})`,
                command: actions.addResource,
                arguments: [codeLensState!.languageKey, codeLensState!.missingTranslationList]
            };
            return codeLens;
        }
        return null;
    }
}

