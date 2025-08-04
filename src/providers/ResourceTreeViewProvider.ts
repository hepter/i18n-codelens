import * as vscode from 'vscode';
import SettingUtils from '../SettingUtils';
import * as path from 'path';
import { actions } from '../constants';
import { Logger } from '../Utils';

export class ResourceTreeView {
	constructor(disposables: vscode.Disposable[]) {
		try {
			Logger.info("Initializing ResourceTreeView...");
			
			const viewRef: { ref: vscode.TreeView<ResourceTreeItem> | null } = { ref: null };

			const view = vscode.window.createTreeView('i18nResourceDefinitions', { 
				treeDataProvider: new ResourceTreeViewProvider(disposables, viewRef), 
				showCollapseAll: true 
			});
			viewRef.ref = view;

			disposables.push(view);
			// add supported languages to 'when' clause's context for the tree view
			vscode.commands.executeCommand('setContext', 'i18TreeView.supportedLanguages', [
				'javascript',
				'typescript',
				'javascriptreact',
				'typescriptreact',
			]);

			// Go to location when selecting a resource in the tree view
			disposables.push(vscode.commands.registerCommand(actions.revealResource, async (key: string) => {
				try {
					if (!SettingUtils.isRevealTreeView()) return;

					const matchedTreeItem = ResourceTreeViewProvider.getTreeItems().find(item => item.key === key);
					if (matchedTreeItem) {
						await view.reveal(matchedTreeItem, { select: true, focus: true });
					}
				} catch (error) {
					Logger.error("ERROR in revealResource command:", error);
				}
			}));

			//Reveal resource in tree view when clicked on the resource in the editor 
			disposables.push(vscode.window.onDidChangeTextEditorSelection((e) => {
				try {
					const doc = e.textEditor.document;

					if (
						SettingUtils.isCodeFilePath(doc.uri.fsPath) &&
						e.selections.length === 1 &&
						[
							vscode.TextEditorSelectionChangeKind.Mouse,
							vscode.TextEditorSelectionChangeKind.Keyboard
						].some(k => k == e.kind)) {
						const selection = e.selections[0];
						const keyRange = doc.getWordRangeAtPosition(selection.start, SettingUtils.getResourceCodeRegex());
						const key = doc.getText(keyRange);
						if (key) {
							vscode.commands.executeCommand(actions.revealResource, key);
						}
					}
				} catch (error) {
					Logger.error("ERROR in text editor selection change:", error);
				}
			}));

			Logger.info("ResourceTreeView initialized successfully");
		} catch (error) {
			Logger.error("ERROR initializing ResourceTreeView:", error);
			throw error;
		}
	}
}

class ResourceTreeViewProvider implements vscode.TreeDataProvider<ResourceTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ResourceTreeItem>();
  private activeUri: vscode.Uri | undefined;
  private static resourceTreeItemList: ResourceTreeItem[] = [];
  private viewRef: { ref: vscode.TreeView<ResourceTreeItem> | null };

  readonly onDidChangeTreeData: vscode.Event<ResourceTreeItem> = this._onDidChangeTreeData.event;

  public static getTreeItems() {
    return ResourceTreeViewProvider.resourceTreeItemList;
  }

  constructor(disposables: vscode.Disposable[], viewRef: { ref: vscode.TreeView<ResourceTreeItem> | null }) {
    this.activeUri = vscode.window.activeTextEditor?.document.uri;
    this.viewRef = viewRef;

    vscode.window.onDidChangeActiveTextEditor((e) => {
      this.activeUri = e?.document?.uri;
      ResourceTreeViewProvider.resourceTreeItemList = [];
      this._onDidChangeTreeData.fire();
    }, null, disposables);
    SettingUtils.onDidChangeResourceLocations(() => {
      ResourceTreeViewProvider.resourceTreeItemList = [];
      this._onDidChangeTreeData.fire();
    }, null, disposables);

  }
  getChildren(element: ResourceTreeItem) {
    if (!this.activeUri || !SettingUtils.isCodeFilePath(this.activeUri.fsPath)) return [];
    const keyLocPairs = SettingUtils.getResourceKeysByUri(this.activeUri);
    const resources = SettingUtils.getResources();

    const sortedKeyArrayByLocs = Object.keys(keyLocPairs).sort((a, b) => {

      const aRange = keyLocPairs?.[a]?.[0].range;
      const bRange = keyLocPairs?.[b]?.[0].range;
      if (aRange && bRange) {
        if (aRange.start.line === bRange.start.line) {
          return aRange.start.character - bRange.start.character;
        }
        return aRange.start.line - bRange.start.line;
      }
      return 0;
    });


    if (!element?.key) {
      let totalResourceCount = 0;
      ResourceTreeViewProvider.resourceTreeItemList = sortedKeyArrayByLocs.map(key => {
        const descriptionList = resources.filter(item => item.keyValuePairs[key]).filter(Boolean);
        const locations = keyLocPairs[key];
        const sortedLocationsByRange = locations?.sort((a, b) => {
          const aRange = a.range;
          const bRange = b.range;
          if (aRange.start.line === bRange.start.line) {
            return aRange.start.character - bRange.start.character;
          }
          return aRange.start.line - bRange.start.line;
        });
        const keyLocationCount = sortedLocationsByRange?.length || 0;
        totalResourceCount += keyLocationCount;

        return new ResourceTreeItem(key,
          `Count: ${sortedLocationsByRange?.length || 0}`,
          vscode.TreeItemCollapsibleState.Collapsed,
          descriptionList.length === 0 ? "error" : descriptionList.length === resources.length ? "normal" : "warn",
          false,
          sortedLocationsByRange
        );
      });
      if (this.viewRef.ref) {
        const titleBase = this.viewRef.ref.title?.split(" - ")?.[0] || this.viewRef.ref.title;
        this.viewRef.ref.title = `${titleBase} - ${totalResourceCount}`;
      }
      return ResourceTreeViewProvider.resourceTreeItemList;
    }

    return resources.map(res => {
      const locations = SettingUtils.getResourceLocationsByKey(element.key);
      const location = locations.find(item => item.uri.fsPath === res.uri.fsPath);
      return new ResourceTreeItem(res.fileName, res.keyValuePairs[element.key] || "", vscode.TreeItemCollapsibleState.None, null, true, location && [location]);
    });

  }
  getTreeItem(element: ResourceTreeItem): vscode.TreeItem {
    return element;
  }
  getParent(dep: ResourceTreeItem) {
    return dep;
  }

}

class ResourceTreeItem extends vscode.TreeItem {
  public key: string;
  constructor(
    public readonly label: string,
    private desc: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public iconType: "warn" | "error" | "normal" | null = "normal",
    public isLeaf: boolean = false,
    public locations?: vscode.Location[],
  ) {
    super(label, collapsibleState);
    this.key = label;
    this.description = this.desc;

    const langDarkNormal = vscode.Uri.file(path.join(__filename, '..', '..', '..', 'resources', 'dark', 'lang-normal.svg'));
    const langDarkWarn = vscode.Uri.file(path.join(__filename, '..', '..', '..', 'resources', 'dark', 'lang-warn.svg'));
    const langDarkError = vscode.Uri.file(path.join(__filename, '..', '..', '..', 'resources', 'dark', 'lang-error.svg'));
    const dotDark = vscode.Uri.file(path.join(__filename, '..', '..', '..', 'resources', 'dark', 'dot.svg'));


    const langLightNormal = vscode.Uri.file(path.join(__filename, '..', '..', '..', 'resources', 'light', 'lang-normal.svg'));
    const langLightWarn = vscode.Uri.file(path.join(__filename, '..', '..', '..', 'resources', 'light', 'lang-warn.svg'));
    const langLightError = vscode.Uri.file(path.join(__filename, '..', '..', '..', 'resources', 'light', 'lang-error.svg'));
    const dotLight = vscode.Uri.file(path.join(__filename, '..', '..', '..', 'resources', 'light', 'dot.svg'));

    this.iconPath = {
      dark: isLeaf ? dotDark : iconType === "normal" ? langDarkNormal : iconType === "warn" ? langDarkWarn : langDarkError,
      light: isLeaf ? dotLight : iconType === "normal" ? langLightNormal : iconType === "warn" ? langLightWarn : langLightError,
    };
    if (locations) {
      this.command = {
        command: actions.focusResource,
        title: 'Go to resource location',
        arguments: [label, locations]
      };
    }
    this.resourceUri = locations?.[0]?.uri;



  }

}
