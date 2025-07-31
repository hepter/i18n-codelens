
import { window } from 'vscode';
import SettingUtils from '../SettingUtils';
import { addNewOrUpdateLanguageTranslation, capitalizeFirstLetter, } from '../Utils';
import { Logger } from '../Utils';

export default async function ActionAddLanguageResource(key: string, missingTranslationList: string[] = []) {
	try {
		Logger.log(`➕ Starting add language resource action for key: ${key}`);
		
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

		Logger.log(`📝 Need to add translations for ${languageFileNames.length} languages: ${languageFileNames.join(', ')}`);

		for (const languageKey of languageFileNames) {
			try {
				const inputValue = await window.showInputBox({
					validateInput: (input) => input.length ? null : "Please enter a translation",
					prompt: `Please enter the '${languageKey}' translation of the key '${key}' (${counter}/${languageFileNames.length})`,
					ignoreFocusOut: true,
					value: capitalizeFirstLetter(key.replace(/\./g, " ")),
				});

				if (!inputValue) {// user cancelled
					Logger.log(`⚠️ User cancelled language input at step ${counter}`);
					window.showInformationMessage("Language input aborted!");
					break;
				}
				newTranslationsData[languageKey] = inputValue;
				counter++;
			} catch (error) {
				Logger.log(`❌ ERROR during input for language ${languageKey}:`, error);
				window.showErrorMessage(`Failed to get input for ${languageKey}: ${error instanceof Error ? error.message : String(error)}`);
				break;
			}
		}

		if (Object.keys(newTranslationsData).length == languageFileNames.length) {
			Logger.log(`✅ All translations collected, applying changes...`);
			await addNewOrUpdateLanguageTranslation(key, newTranslationsData);
		} else {
			Logger.log(`⚠️ Translation process incomplete: ${Object.keys(newTranslationsData).length}/${languageFileNames.length} completed`);
		}
	} catch (error) {
		Logger.log("❌ ERROR in ActionAddLanguageResource:", error);
		window.showErrorMessage(`Failed to add language resource: ${error instanceof Error ? error.message : String(error)}`);
	}
}