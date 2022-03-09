
import { window } from 'vscode';
import { addNewLanguageTranslation, capitalizeFirstLetter } from '../Utils';

export default async (key: string, missingTranslationList: string[]) => {


	let counter = 1;
	const newTranslationsData: { [key: string]: string } = {};
	for (const languageKey of missingTranslationList) {

		const inputValue = await window.showInputBox({
			validateInput: (input) => input.length ? null : "Please enter a translation",
			prompt: `Please enter the '${languageKey}' translation of the key '${key}' (${counter}/${missingTranslationList.length})`,
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

	if (Object.keys(newTranslationsData).length == missingTranslationList.length) {
		addNewLanguageTranslation(key, newTranslationsData);
	}


};