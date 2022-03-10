
import { window } from 'vscode';
import { addNewOrUpdateLanguageTranslation, getLanguageResourcesFiles } from '../Utils';

export default async (key: string) => {


	const resourceList = await getLanguageResourcesFiles();
	const existResourceList = [];


	for (const resource of resourceList) {
		if (resource.keyValuePairs[key]) {
			existResourceList.push(resource);
		}
	}

	let counter = 1;
	const newTranslationsData: { [key: string]: string } = {};
	let isAborted = false;
	for (const resource of existResourceList) {

		const inputValue = await window.showInputBox({
			validateInput: (input) => input.length ? null : "Please enter a translation",
			prompt: `Please modify '${resource.fileName}' translation of the key '${key}' or press enter to skip next.(${counter}/${existResourceList.length})`,
			ignoreFocusOut: true,
			value: resource.keyValuePairs[key],
		});

		if (!inputValue) {// user cancelled
			window.showInformationMessage("Language text modification aborted!");
			isAborted = true;
			break;
		}
		if (inputValue !== resource.keyValuePairs[key]) {
			newTranslationsData[resource.fileName] = inputValue;
		}
		counter++;
	}

	if (!isAborted && Object.keys(newTranslationsData).length) {
		addNewOrUpdateLanguageTranslation(key, newTranslationsData, true);
	}


};