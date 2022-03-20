
import { workspace } from 'vscode';
import { extensionName, settings } from '../constants';

export default function ActionEnableDisableCodeLens(actionStatus: boolean) {
	return () => {
		workspace.getConfiguration(extensionName).update(settings.codeLens, actionStatus, true);
	};
}
