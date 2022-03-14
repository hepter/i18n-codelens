
import { workspace } from 'vscode';

export default (actionStatus: boolean) => () => {
	workspace.getConfiguration("i18n-codelens").update("enableCodeLens", actionStatus, true);
};
