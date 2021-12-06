
import { workspace } from 'vscode';

export default (actionStatus: boolean) => () => {
	workspace.getConfiguration("akinon-codelens").update("enableCodeLens", actionStatus, true);
};
