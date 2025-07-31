
import { window } from 'vscode';
import SettingUtils from '../SettingUtils';
import { addNewOrUpdateLanguageTranslation } from '../Utils';
import { Logger } from '../Utils';

export default async function ActionEditLanguageResource(key: string) {
	try {
		Logger.log(`✏️ Starting edit language resource action for key: ${key}`);
		
		const resourceList = SettingUtils.getResources();
		const existResourceList = [];

		for (const resource of resourceList) {
			if (resource.keyValuePairs[key]) {
				existResourceList.push(resource);
			}
		}

		Logger.log(`📝 Found ${existResourceList.length} existing translations to edit`);

		let counter = 1;
		const newTranslationsData: { [key: string]: string } = {};
		let isAborted = false;
		
		for (const resource of existResourceList) {
			try {
				const inputValue = await window.showInputBox({
					validateInput: (input) => input.length ? null : "Please enter a translation",
					prompt: `Please modify '${resource.fileName}' translation of the key '${key}' or press enter to skip next.(${counter}/${existResourceList.length})`,
					ignoreFocusOut: true,
					value: resource.keyValuePairs[key],
				});

				if (!inputValue) {// user cancelled
					Logger.log(`⚠️ User cancelled modification at step ${counter}`);
					window.showInformationMessage("Language text modification aborted!");
					isAborted = true;
					break;
				}
				if (inputValue !== resource.keyValuePairs[key]) {
					newTranslationsData[resource.fileName] = inputValue;
				}
				counter++;
			} catch (error) {
				Logger.log(`❌ ERROR during edit for resource ${resource.fileName}:`, error);
				window.showErrorMessage(`Failed to edit ${resource.fileName}: ${error instanceof Error ? error.message : String(error)}`);
				isAborted = true;
				break;
			}
		}

		if (!isAborted && Object.keys(newTranslationsData).length) {
			Logger.log(`✅ Applying ${Object.keys(newTranslationsData).length} translation changes...`);
			await addNewOrUpdateLanguageTranslation(key, newTranslationsData, true);
		} else if (!isAborted) {
			Logger.log(`ℹ️ No changes were made to translations`);
		}
	} catch (error) {
		Logger.log("❌ ERROR in ActionEditLanguageResource:", error);
		window.showErrorMessage(`Failed to edit language resource: ${error instanceof Error ? error.message : String(error)}`);
	}
}