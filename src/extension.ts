// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { commands, Disposable, ExtensionContext, languages } from 'vscode';
import ActionAddLanguageResource from './actions/ActionAddLanguageResource';
import ActionEnableDisableCodeLens from './actions/ActionEnableDisableCodeLens';
import ActionRefreshLanguageResource from './actions/ActionRefreshLanguageResource';
import { CodelensProvider } from './providers/CodelensProvider';
import CompletionItemProvider from './providers/CompletionItemProvider';
import { DecoratorProvider } from './providers/DecoratorProvider';
import { HoverProvider } from './providers/HoverProvider';
import ResourceWatcher from './watcher/ResourceWatcher';
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

let disposables: Disposable[] = [];


export function activate(context: ExtensionContext) {

    const codelensProvider = new CodelensProvider();
    const hoverProvider = new HoverProvider();
    const completionItemProvider = new CompletionItemProvider();

    disposables.push(ResourceWatcher());

    disposables.push(languages.registerCodeLensProvider(['javascript', 'typescript'], codelensProvider));
    disposables.push(languages.registerHoverProvider(['javascript', 'typescript'], hoverProvider));
    disposables.push(languages.registerCompletionItemProvider(['javascript', 'typescript'], completionItemProvider, '.'));


    disposables.push(commands.registerCommand("akinon-codelens.enableCodeLens", ActionEnableDisableCodeLens(true)));
    disposables.push(commands.registerCommand("akinon-codelens.disableCodeLens", ActionEnableDisableCodeLens(false)));
    disposables.push(commands.registerCommand("akinon-codelens.refreshLanguageResources", ActionRefreshLanguageResource));
    disposables.push(commands.registerCommand("akinon-codelens.codelensActionAddLanguageResource", ActionAddLanguageResource, ''));

    context.subscriptions.push(...disposables);

    new DecoratorProvider(context);

    console.log('Congratulations, extension "akinon-codelens" is now active!');
}

// this method is called when your extension is deactivated
export function deactivate() {
    if (disposables) {
        disposables.forEach(item => item.dispose());
    }
    disposables = [];
}
