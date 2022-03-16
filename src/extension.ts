
import { commands, Disposable, ExtensionContext, languages, window } from 'vscode';
import ActionAddLanguageResource from './actions/ActionAddLanguageResource';
import ActionEditLanguageResource from './actions/ActionEditLanguageResource';
import ActionEnableDisableCodeLens from './actions/ActionEnableDisableCodeLens';
import ActionRefreshLanguageResource from './actions/ActionRefreshLanguageResource';
import { ResourceEditCodeAction } from './codeAction/ResourceEditCodeAction';
import { CodelensProvider } from './providers/CodelensProvider';
import CompletionItemProvider from './providers/CompletionItemProvider';
import { DecoratorProvider } from './providers/DecoratorProvider';
import DefinitionProvider from './providers/DefinitionProvider';
import { HoverProvider } from './providers/HoverProvider';
import ResourceWatcher from './watcher/ResourceWatcher';

let disposables: Disposable[] = [];


export function activate(context: ExtensionContext) {

    const codelensProvider = new CodelensProvider(context);
    const hoverProvider = new HoverProvider(context);
    const completionItemProvider = new CompletionItemProvider(context);
    const codeActionsProvider = new ResourceEditCodeAction(context);
    const definitionProvider = new DefinitionProvider(context);

    disposables.push(ResourceWatcher());

    disposables.push(languages.registerCodeLensProvider(['javascript', 'typescript'], codelensProvider));
    disposables.push(languages.registerHoverProvider(['javascript', 'typescript'], hoverProvider));
    disposables.push(languages.registerCompletionItemProvider(['javascript', 'typescript'], completionItemProvider, ''));
    disposables.push(languages.registerCodeActionsProvider(['javascript', 'typescript'], codeActionsProvider));
    disposables.push(languages.registerDefinitionProvider(['javascript', 'typescript', 'json'], definitionProvider));


    disposables.push(commands.registerCommand("i18n-codelens.enableCodeLens", ActionEnableDisableCodeLens(true)));
    disposables.push(commands.registerCommand("i18n-codelens.disableCodeLens", ActionEnableDisableCodeLens(false)));
    disposables.push(commands.registerCommand("i18n-codelens.refreshLanguageResources", ActionRefreshLanguageResource));
    disposables.push(commands.registerCommand("i18n-codelens.codelensActionAddLanguageResource", ActionAddLanguageResource, ''));
    disposables.push(commands.registerCommand("i18n-codelens.codeActionEditLanguageResource", ActionEditLanguageResource, ''));



    context.subscriptions.push(...disposables);

    new DecoratorProvider(context);

    console.log('Congratulations, extension "i18n-codelens" is now active!');
}

// this method is called when your extension is deactivated
export function deactivate() {
    if (disposables) {
        disposables.forEach(item => item.dispose());
    }
    disposables = [];
}
