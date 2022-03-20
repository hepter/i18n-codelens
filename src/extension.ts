
import * as vscode from 'vscode';
import ActionAddLanguageResource from './actions/ActionAddLanguageResource';
import ActionDeleteLanguageResource from './actions/ActionDeleteLanguageResource';
import ActionEditLanguageResource from './actions/ActionEditLanguageResource';
import ActionEnableDisableCodeLens from './actions/ActionEnableDisableCodeLens';
import ActionFocusResource from './actions/ActionFocusResource';
import ActionResetAndReloadExtension from './actions/ActionResetAndReloadExtension';
import { ResourceEditCodeAction } from './codeAction/ResourceEditCodeAction';
import { actions, extensionName } from './constants';
import { CodelensProvider } from './providers/CodelensProvider';
import CompletionItemProvider from './providers/CompletionItemProvider';
import { DecoratorProvider } from './providers/DecoratorProvider';
import DefinitionProvider from './providers/DefinitionProvider';
import { HoverProvider } from './providers/HoverProvider';
import { ResourceTreeView } from './providers/ResourceTreeViewProvider';
import SettingUtils from './SettingUtils';
import { Logger } from './Utils';

let disposables: vscode.Disposable[] = [];


export async function activate(context: vscode.ExtensionContext) {


    const settingUtil = SettingUtils.getInstance();

    SettingUtils.onDidLoad((instanceDisposables) => {
        const id = instanceDisposables;
        id.push(new DecoratorProvider());
        id.push(vscode.languages.registerCodeLensProvider(['javascript', 'typescript'], new CodelensProvider(id)));
        id.push(vscode.languages.registerCompletionItemProvider(['javascript', 'typescript'], new CompletionItemProvider(), ''));
        id.push(vscode.languages.registerDefinitionProvider(['javascript', 'typescript', 'json'], new DefinitionProvider()));
        id.push(vscode.languages.registerHoverProvider(['javascript', 'typescript', 'json'], new HoverProvider()));
        id.push(vscode.languages.registerCodeActionsProvider(['javascript', 'typescript', 'json'], new ResourceEditCodeAction()));

        id.push(vscode.commands.registerCommand(actions.enableCodeLens, ActionEnableDisableCodeLens(true)));
        id.push(vscode.commands.registerCommand(actions.disableCodeLens, ActionEnableDisableCodeLens(false)));
        id.push(vscode.commands.registerCommand(actions.resetAndReloadExtension, ActionResetAndReloadExtension));
        id.push(vscode.commands.registerCommand(actions.addResource, ActionAddLanguageResource));
        id.push(vscode.commands.registerCommand(actions.editResource, ActionEditLanguageResource));
        id.push(vscode.commands.registerCommand(actions.deleteResource, ActionDeleteLanguageResource));
        id.push(vscode.commands.registerCommand(actions.focusResource, ActionFocusResource));

        new ResourceTreeView(id);
    }, null, disposables);

    await settingUtil.initialize();

    disposables.push(settingUtil);
    context.subscriptions.push(...disposables);
    Logger.log(`Congratulations, ${extensionName} is now active!`);
}

export function deactivate() {
    if (disposables) {
        disposables.forEach(item => item.dispose());
    }
    disposables = [];
}
