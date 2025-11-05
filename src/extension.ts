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
import * as path from 'path';

let disposables: vscode.Disposable[] = [];
let mcpTerminal: vscode.Terminal | undefined;
let mcpProviderDisposable: vscode.Disposable | undefined;

function buildMcpEnv(): Record<string, string> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    const cfg = vscode.workspace.getConfiguration('i18n-codelens');
    const env: Record<string, string> = { WORKSPACE_ROOT: workspaceRoot };
    const resourceGlob = cfg.get<string>('resourceFilesGlobPattern');
    const codeGlob = cfg.get<string>('codeFilesGlobPattern');
    const codeRegex = cfg.get<string>('resourceCodeDetectionRegex');
    const ignoreGlobs = cfg.get<string[]>('ignoreGlobs');
    const structure = cfg.get<string>('resourceStructureStrategy');
    const insertOrder = cfg.get<string>('resourceInsertOrderStrategy');
    if (resourceGlob) env.I18N_GLOB = resourceGlob;
    if (codeGlob) env.I18N_CODE_GLOB = codeGlob;
    if (codeRegex) env.I18N_CODE_REGEX = codeRegex;
    if (ignoreGlobs && ignoreGlobs.length) env.I18N_IGNORE = ignoreGlobs.join(';');
    if (structure) env.I18N_STRUCTURE = structure;
    if (insertOrder) env.I18N_INSERT_ORDER = insertOrder;
    return env;
}

function registerMcpProvider(context: vscode.ExtensionContext) {
    try {
        if ((vscode as any).lm && typeof (vscode as any).lm.registerMcpServerDefinitionProvider === 'function') {
            mcpProviderDisposable?.dispose();
            const providerId = 'i18n-codelens.mcp';
            const serverLabel = 'i18n-codelens';
            const serverJs = context.asAbsolutePath(path.join('out', 'mcp', 'server.js'));

            mcpProviderDisposable = (vscode as any).lm.registerMcpServerDefinitionProvider(providerId, {
                provideMcpServerDefinitions: () => {
                    const env = buildMcpEnv();
                    const def = new (vscode as any).McpStdioServerDefinition(serverLabel, 'node', [serverJs], env);
                    return [def];
                }
            });
            if (mcpProviderDisposable) context.subscriptions.push(mcpProviderDisposable);
            Logger.info('MCP provider registered/updated for i18n CodeLens');
        } else {
            Logger.info('MCP API not available in this VS Code version; skipping MCP provider registration.');
        }
    } catch (err) {
        Logger.warn('Failed to register MCP provider:', err);
    }
}

function startMcpServerInTerminal(context: vscode.ExtensionContext) {
    const serverJs = context.asAbsolutePath(path.join('out', 'mcp', 'server.js'));
    const env = buildMcpEnv();
    // Stop existing
    stopMcpServerInTerminal();
    mcpTerminal = vscode.window.createTerminal({ name: 'i18n MCP Server', env });
    mcpTerminal.sendText(`node "${serverJs}"`, true);
    mcpTerminal.show(false);
}

function stopMcpServerInTerminal() {
    try {
        mcpTerminal?.dispose();
    } finally {
        mcpTerminal = undefined;
    }
}

function restartMcpServerInTerminal(context: vscode.ExtensionContext) {
    stopMcpServerInTerminal();
    startMcpServerInTerminal(context);
}


export async function activate(context: vscode.ExtensionContext) {
    try {
        Logger.info("Starting i18n CodeLens extension activation...");

        const settingUtil = SettingUtils.getInstance();

        // Register MCP server definition provider for GitHub Copilot Agent & other LM clients
        registerMcpProvider(context);

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


        disposables.push(vscode.commands.registerCommand(actions.startMcpServer, () => startMcpServerInTerminal(context)));
        disposables.push(vscode.commands.registerCommand(actions.stopMcpServer, () => stopMcpServerInTerminal()));
        disposables.push(vscode.commands.registerCommand(actions.restartMcpServer, () => restartMcpServerInTerminal(context)));

        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('i18n-codelens.resourceFilesGlobPattern') ||
                e.affectsConfiguration('i18n-codelens.codeFilesGlobPattern') ||
                e.affectsConfiguration('i18n-codelens.resourceCodeDetectionRegex') ||
                e.affectsConfiguration('i18n-codelens.ignoreGlobs') ||
                e.affectsConfiguration('i18n-codelens.resourceStructureStrategy') ||
                e.affectsConfiguration('i18n-codelens.resourceInsertOrderStrategy')) {
                registerMcpProvider(context);
                if (mcpTerminal) {
                    restartMcpServerInTerminal(context);
                    vscode.window.setStatusBarMessage('i18n MCP server restarted due to config changes', 3000);
                }
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

// Note: Avoid auto-writing unregistered settings for MCP/Copilot.

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
