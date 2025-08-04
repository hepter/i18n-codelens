import { window } from 'vscode';
import SettingUtils from '../SettingUtils';
import { addNewOrUpdateLanguageTranslation } from '../Utils';
import { Logger } from '../Utils';

export default async function ActionEditLanguageResource(key: string, languageKeys: string[] | undefined) {
	try {
		Logger.info(`Starting edit language resource action for key: ${key}`);

		const resourceList = SettingUtils.getResources();
		const existResourceList = [];

		for (const resource of resourceList) {
			if (resource.keyValuePairs[key]) {
				if (languageKeys && languageKeys.length > 0) {
					if (languageKeys.includes(resource.fileName)) {
						existResourceList.push(resource);
					}
				} else {
					existResourceList.push(resource);
				}
			}
		}

		Logger.info(`Found ${existResourceList.length} existing translations to edit`);

		let counter = 1;
		const newTranslationsData: { [key: string]: string } = {};
		let isAborted = false;

		for (const resource of existResourceList) {
			try {
				const box = window.createInputBox();

				box.placeholder = resource.keyValuePairs[key];
				box.value = resource.keyValuePairs[key];
				box.title = `Edit Translation for ${resource.fileName.toUpperCase()} - '${key}'`;

				if (existResourceList.length > 1) {
					box.step = counter;
					box.totalSteps = existResourceList.length;
				}

				box.onDidChangeValue((value) => {
					box.validationMessage = value.length
						? undefined
						: "🚫 Please enter a translation";
				});

				box.ignoreFocusOut = true;
				box.show();

				const inputValue = await new Promise<string | undefined>((resolve) => {
					box.onDidAccept(() => resolve(box.value));
					box.onDidHide(() => resolve(undefined));
				});

				box.dispose();

				if (!inputValue) {
					Logger.warn(`User cancelled modification at step ${counter}`);
					window.showInformationMessage("Language text modification aborted!");
					isAborted = true;
					break;
				}
				if (inputValue !== resource.keyValuePairs[key]) {
					newTranslationsData[resource.fileName] = inputValue;
				}
				counter++;
			} catch (error) {
				Logger.error(`ERROR during edit for resource ${resource.fileName}:`, error);
				window.showErrorMessage(`Failed to edit ${resource.fileName}: ${error instanceof Error ? error.message : String(error)}`);
				isAborted = true;
				break;
			}
		}

		if (!isAborted && Object.keys(newTranslationsData).length) {
			Logger.info(`Applying ${Object.keys(newTranslationsData).length} translation changes...`);
			await addNewOrUpdateLanguageTranslation(key, newTranslationsData, true);
		} else if (!isAborted) {
			Logger.info(`No changes were made to translations`);
		}
	} catch (error) {
		Logger.error("ERROR in ActionEditLanguageResource:", error);
		window.showErrorMessage(`Failed to edit language resource: ${error instanceof Error ? error.message : String(error)}`);
	}
}
