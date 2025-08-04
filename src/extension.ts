import * as vscode from 'vscode';
import ActionAddLanguageResource from './actions/ActionAddLanguageResource';
import ActionDeleteLanguageResource from './actions/ActionDeleteLanguageResource';
import ActionEditLanguageResource from './actions/ActionEditLanguageResource';
import ActionEnableDisableCodeLens from './actions/ActionEnableDisableCodeLens';
import ActionFocusResource from './actions/ActionFocusResource';
import ActionResetAndReloadExtension from './actions/ActionResetAndReloadExtension';
import ActionBulkEditResources from './actions/ActionBulkEditResources';
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
    try {
        Logger.info("Starting i18n CodeLens extension activation...");

        const settingUtil = SettingUtils.getInstance();

        Logger.info("Setting up event listeners...");
        SettingUtils.onDidLoad((instanceDisposables) => {
            try {
                Logger.info("Registering providers and commands...");
                const id = instanceDisposables;

                // Register providers
                id.push(new DecoratorProvider());
                id.push(vscode.languages.registerCodeLensProvider(['javascript', 'typescript', 'javascriptreact', 'typescriptreact'], new CodelensProvider(id)));
                id.push(vscode.languages.registerCompletionItemProvider(['javascript', 'typescript', 'javascriptreact', 'typescriptreact'], new CompletionItemProvider(), ''));
                id.push(vscode.languages.registerDefinitionProvider(['javascript', 'typescript', 'javascriptreact', 'typescriptreact', 'json'], new DefinitionProvider()));
                id.push(vscode.languages.registerHoverProvider(['javascript', 'typescript', 'javascriptreact', 'typescriptreact', 'json'], new HoverProvider()));
                id.push(vscode.languages.registerCodeActionsProvider(['javascript', 'typescript', 'javascriptreact', 'typescriptreact', 'json'], new ResourceEditCodeAction()));

				// Register commands
				id.push(vscode.commands.registerCommand(actions.enableCodeLens, ActionEnableDisableCodeLens(true)));
				id.push(vscode.commands.registerCommand(actions.disableCodeLens, ActionEnableDisableCodeLens(false)));
				id.push(vscode.commands.registerCommand(actions.resetAndReloadExtension, ActionResetAndReloadExtension));
				id.push(vscode.commands.registerCommand(actions.addResource, ActionAddLanguageResource));
				id.push(vscode.commands.registerCommand(actions.editResource, ActionEditLanguageResource));
				id.push(vscode.commands.registerCommand(actions.deleteResource, ActionDeleteLanguageResource));
				id.push(vscode.commands.registerCommand(actions.focusResource, ActionFocusResource));
				id.push(vscode.commands.registerCommand(actions.bulkEditResources, async (keys: string[], documentUri?: string) => {
					let sourceDocument: vscode.TextDocument | undefined;
					if (documentUri) {
						try {
							sourceDocument = await vscode.workspace.openTextDocument(vscode.Uri.parse(documentUri));
						} catch (error) {
							Logger.warn("Could not open source document:", error);
						}
					}
					return ActionBulkEditResources(keys, sourceDocument);
				}));                // Initialize tree view
                new ResourceTreeView(id);

                Logger.info("Providers and commands registered successfully");
            } catch (error) {
                Logger.error("ERROR registering providers and commands:", error);
                vscode.window.showErrorMessage(`Failed to register extension components: ${error instanceof Error ? error.message : String(error)}`);
            }
        }, null, disposables);

        Logger.info("Starting initialization...");
        await settingUtil.initialize();

        disposables.push(settingUtil);
        context.subscriptions.push(...disposables);

        Logger.info(`${extensionName} extension activated successfully!`);
    } catch (error) {
        Logger.showCriticalError("during extension activation:", error);
        vscode.window.showErrorMessage(
            `i18n CodeLens failed to activate: ${error instanceof Error ? error.message : String(error)}. Check output panel for details.`
        );
    }
}

export function deactivate() {
    try {
        Logger.info("Deactivating i18n CodeLens extension...");
        if (disposables) {
            disposables.forEach(item => {
                try {
                    item.dispose();
                } catch (error) {
                    Logger.warn("ERROR disposing resource:", error);
                }
            });
        }
        disposables = [];
        Logger.info("i18n CodeLens extension deactivated successfully");
    } catch (error) {
        Logger.error("ERROR during extension deactivation:", error);
    }
}
