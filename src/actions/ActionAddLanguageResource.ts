import { window } from 'vscode';
import SettingUtils from '../SettingUtils';
import { addNewOrUpdateLanguageTranslation, capitalizeFirstLetter, } from '../Utils';
import { Logger } from '../Utils';

export default async function ActionAddLanguageResource(key: string, missingTranslationList: string[] = []) {
	try {
		Logger.info(`Starting add language resource action for key: ${key}`);

		let counter = 1;
		const newTranslationsData: { [key: string]: string } = {};
		const languageFileNames = missingTranslationList;

		if (languageFileNames.length === 0) {
			const resources = SettingUtils.getResources();
			for (const resource of resources) {
				if (!resource.keyValuePairs[key]) {
					languageFileNames.push(resource.fileName);
				}
			}
		}

		Logger.info(`Need to add translations for ${languageFileNames.length} languages: ${languageFileNames.join(', ')}`);

		for (const languageKey of languageFileNames) {
			try {
				const box = window.createInputBox();

				box.placeholder = capitalizeFirstLetter(key.replace(/\./g, " "));
				box.value = capitalizeFirstLetter(key.replace(/\./g, " "));
				box.title = `Add Translation for ${languageKey.toUpperCase()} - '${key}'`;

				if (languageFileNames.length > 1) {
					box.step = counter;
					box.totalSteps = languageFileNames.length;
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

				if (!inputValue) {// user cancelled
					Logger.warn(`User cancelled language input at step ${counter}`);
					window.showInformationMessage("Language input aborted!");
					break;
				}
				newTranslationsData[languageKey] = inputValue;
				counter++;
			} catch (error) {
				Logger.error(`ERROR during input for language ${languageKey}:`, error);
				window.showErrorMessage(`Failed to get input for ${languageKey}: ${error instanceof Error ? error.message : String(error)}`);
				break;
			}
		}

		if (Object.keys(newTranslationsData).length == languageFileNames.length) {
			Logger.info(`All translations collected, applying changes...`);
			await addNewOrUpdateLanguageTranslation(key, newTranslationsData);
		} else {
			Logger.warn(`Translation process incomplete: ${Object.keys(newTranslationsData).length}/${languageFileNames.length} completed`);
		}
	} catch (error) {
		Logger.error("ERROR in ActionAddLanguageResource:", error);
		window.showErrorMessage(`Failed to add language resource: ${error instanceof Error ? error.message : String(error)}`);
	}
}
