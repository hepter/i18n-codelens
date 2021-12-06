import * as vscode from 'vscode';
import { getLanguageResourcesFiles } from '../Utils';
/**
 * CodelensProvider
 */
export class CodelensProvider implements vscode.CodeLensProvider {

    private codeLenses: vscode.CodeLens[] = [];
    private regex!: RegExp;
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;
    private codeLensKeyWeakMap = new WeakMap<vscode.CodeLens, {
        languageKey: string,
        missingTranslationList: string[]
    }>();
    constructor() {
        this.refreshRegexFromConfig();

        vscode.workspace.onDidChangeConfiguration((e) => {
            this._onDidChangeCodeLenses.fire();
            if (e.affectsConfiguration("akinon-codelens.languageTranslatorRegex")) {
                this.refreshRegexFromConfig();
            }
        });
    }

    private refreshRegexFromConfig() {
        const hoverRegex = vscode.workspace.getConfiguration("akinon-codelens").get("languageTranslatorRegex", "");
        this.regex = new RegExp(hoverRegex, "g");
    }
    public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {

        if (vscode.workspace.getConfiguration("akinon-codelens").get("enableCodeLens", true)) {
            return getLanguageResourcesFiles().then((languageResources) => {

                this.codeLenses = [];
                const regex = new RegExp(this.regex);
                const text = document.getText();
                let matches;

                while ((matches = regex.exec(text)) !== null) {
                    const line = document.lineAt(document.positionAt(matches.index).line);
                    const indexOf = line.text.indexOf(matches[0]);
                    const position = new vscode.Position(line.lineNumber, indexOf);
                    const range = document.getWordRangeAtPosition(position, new RegExp(this.regex));
                    const missingTranslationList: string[] = [];
                    const languageKey = matches[0];

                    if (languageKey) {
                        languageResources.forEach((item) => {
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
            });
        }
        return [];
    }

    public resolveCodeLens(codeLens: vscode.CodeLens, token: vscode.CancellationToken) {

        const codeLensState = this.codeLensKeyWeakMap.get(codeLens);

        if (vscode.workspace.getConfiguration("akinon-codelens").get("enableCodeLens", true)) {
            codeLens.command = {
                title: `Missing translation key! ('${codeLensState!.languageKey}')`,
                tooltip: `Add missing language translations key ('${codeLensState!.languageKey}' -> ${codeLensState!.missingTranslationList.join(', ')})`,
                command: "akinon-codelens.codelensActionAddLanguageResource",
                arguments: [codeLensState!.languageKey, codeLensState!.missingTranslationList]
            };

            return codeLens;
        }
        return null;
    }
}

