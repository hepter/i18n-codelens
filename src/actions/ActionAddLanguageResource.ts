
import { window } from 'vscode';
import {
	addNewOrUpdateLanguageTranslation,
	capitalizeFirstLetter,
	getLanguageResourcesFiles
} from '../Utils';

export default async (key: string, missingTranslationList: string[] = []) => {


	let counter = 1;
	const newTranslationsData: { [key: string]: string } = {};
	const languageFileNames = missingTranslationList;

	if (languageFileNames.length === 0) {
		const resources = await getLanguageResourcesFiles();
		for (const resource of resources) {
			if (!resource.keyValuePairs[key]) {
				languageFileNames.push(resource.fileName);
			}
		}
	}

	for (const languageKey of languageFileNames) {

		const inputValue = await window.showInputBox({
			validateInput: (input) => input.length ? null : "Please enter a translation",
			prompt: `Please enter the '${languageKey}' translation of the key '${key}' (${counter}/${languageFileNames.length})`,
			ignoreFocusOut: true,
			value: capitalizeFirstLetter(key.replace(/\./g, " ")),
		});

		if (!inputValue) {// user cancelled
			window.showInformationMessage("Language input aborted!");
			break;
		}
		newTranslationsData[languageKey] = inputValue;
		counter++;
	}

	if (Object.keys(newTranslationsData).length == languageFileNames.length) {
		addNewOrUpdateLanguageTranslation(key, newTranslationsData);
	}


};