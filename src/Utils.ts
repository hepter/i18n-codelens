import * as vscode from "vscode";

import * as fs from 'fs';
import * as path from 'path';
import { closest } from 'fastest-levenshtein';

export type LanguageResource = {

	path: string
	dir: string,
	fileName: string
	keyValuePairs: { [key: string]: string }
}[];

let languageResourcesFilesCache: LanguageResource | null = null;

const generateLanguageResource = (fsPath: string) => {
	const data = fs.readFileSync(fsPath);
	const filePath = path.parse(fsPath);
	const keyValuePairs = JSON.parse(data.toString());

	return ({
		path: fsPath,
		fileName: filePath.name,
		dir: filePath.dir,
		keyValuePairs
	});
};


export async function getLanguageResourcesFiles(clearCache = false, fileFsPath?: string): Promise<LanguageResource> {

	const response: LanguageResource = [];
	const globPattern = vscode.workspace.getConfiguration("akinon-codelens").get("languageGlobPattern", "**/locales/*.json");
	if (languageResourcesFilesCache?.length && !clearCache) {
		return languageResourcesFilesCache;
	}
	else if (fileFsPath) {
		languageResourcesFilesCache ??= [];
		const oldResourceIndex = languageResourcesFilesCache.findIndex(item => item.path === fileFsPath);
		try {
			const newResourceFile = generateLanguageResource(fileFsPath);
			if (newResourceFile) {
				if (oldResourceIndex > -1) {
					languageResourcesFilesCache[oldResourceIndex] = newResourceFile;
				} else {
					languageResourcesFilesCache.push(newResourceFile);
				}
			}
		} catch (error) {
			console.log("Resource file parse error:" + fileFsPath, error);
		}
		return languageResourcesFilesCache;
	}

	const vscodeUriList = await vscode.workspace.findFiles(globPattern, "**/node_modules/**");
	const fileCount = vscodeUriList.length;
	console.log(`${fileCount + " " || ""}Language files${fileCount ? "" : " not"} found!`);


	for (const uri of vscodeUriList) {
		try {
			response.push(generateLanguageResource(uri.fsPath));
		} catch (error) {
			console.log("Resource file parse error:" + uri, error);
		}
	}

	languageResourcesFilesCache = response;
	return response;
}


async function applyEditByFilePath(filePath: string, nearestResourceKey: string, resourceKey: string, resourceData: string, isUpdate?: boolean): Promise<void> {
	const rawData = fs.readFileSync(filePath).toString();

	const lineRegex = /([\t ]*?)(["']).*?(,?)(\r?\n)/;// 4 RegExp groups
	const resourceLineRegex = new RegExp(`(?<=["'])${nearestResourceKey}(?=["']).*\r?(?:\n|$)`);
	const matchGroups = rawData.match(lineRegex);
	const isAutoSaveEnabled = vscode.workspace.getConfiguration("akinon-codelens").get("enableResourceAutoSaveInsertOrUpdate", true);
	const isAutoFocusEnabled = vscode.workspace.getConfiguration("akinon-codelens").get("enableAutoFocusDocumentAfterAltered", false);

	let newLine = `\n  "${resourceKey}": "${resourceData}",`;
	if (matchGroups?.length == 5) { // 4 groups + 1 for the whole match
		const space = matchGroups[1];
		const quote = matchGroups[2];
		const comma = matchGroups[3];
		const newLineChar = matchGroups[4];

		newLine = `${newLineChar}${space}${quote}${resourceKey}${quote}: ${quote}${resourceData}${quote}${comma}`;
	}


	// let previousPositionLine = 0;
	// let previousPositionOffset = 0;

	let positionLine = 0;
	let positionOffset = 0;

	let lineCounter = 0;
	const lines = rawData.split(/\r?\n/);
	for (const line of lines) {
		const matchNearestLine = resourceLineRegex.exec(line);
		if (matchNearestLine) {
			// previousPositionLine = positionLine;
			// previousPositionOffset = positionOffset;
			positionLine = lineCounter;
			positionOffset = line.length;
			break;
		}
		lineCounter++;
	}

	const workspaceEdit = new vscode.WorkspaceEdit();

	if (isUpdate) {
		workspaceEdit.replace(vscode.Uri.file(filePath),
			new vscode.Range(
				new vscode.Position(positionLine, 0),
				new vscode.Position(positionLine, positionOffset)
			),
			newLine.replace(/\r?\n/g, ''));
	} else {
		workspaceEdit.insert(vscode.Uri.file(filePath), new vscode.Position(positionLine, positionOffset), newLine);
	}

	let dispose;
	if (isAutoSaveEnabled) {
		dispose = vscode.workspace.onDidChangeTextDocument(e => {
			e.document.save();
		});
	}

	await vscode.workspace.applyEdit(workspaceEdit);
	dispose?.dispose();

	if (!isUpdate) {
		positionLine++; // Current line is increased by 1
	}


	if (isAutoFocusEnabled) {
		const document = await vscode.window.showTextDocument(vscode.Uri.file(filePath), {
			preserveFocus: true,
			preview: false,
		});

		const newLinePosition = new vscode.Position(positionLine, 0);
		const newLinePositionEnd = new vscode.Position(positionLine, newLine.length);
		document.revealRange(new vscode.Range(newLinePosition, newLinePositionEnd), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
		document.selection = new vscode.Selection(newLinePosition, newLinePositionEnd);
	}
}

type TranslationData = {
	[languageFileName: string]: string
};


export async function addNewOrUpdateLanguageTranslation(resourceKey: string, modifiedTranslationsData: TranslationData, isUpdate?: boolean): Promise<void> {

	const resourceList = await getLanguageResourcesFiles(true);
	for (const resource of resourceList) {
		const matchedTranslation = modifiedTranslationsData[resource.fileName];
		if (matchedTranslation) {
			let closestResourceKey = resourceKey;
			if (!isUpdate) {
				const newKeySections = resourceKey.split('.');
				const resourceKeys = Object.keys(resource.keyValuePairs);
				let matchSequenceCount = 0;
				let partialMatchedKeys = [];

				// Find the closest key after sequentially matching the new key sections with the existing keys
				for (const resourceKey of resourceKeys) {
					const resourceSections = resourceKey.split('.');
					let matchCount = 0;
					for (let i = 0; i < newKeySections.length; i++) {
						if (resourceSections[i] == newKeySections[i]) {
							matchCount++;
						} else {
							break;
						}
					}
					if (matchCount > matchSequenceCount) {
						matchSequenceCount = matchCount;
						partialMatchedKeys = [];
					}
					if (matchCount === matchSequenceCount) {
						partialMatchedKeys.push(resourceKey);
					}
				}
				closestResourceKey = closest(resourceKey, partialMatchedKeys) ?? resourceKey;
			}
			try {
				await applyEditByFilePath(resource.path, closestResourceKey, resourceKey, matchedTranslation, isUpdate);
			} catch (error) {
				console.log(error);
			}
		}
	}
}


export function capitalizeFirstLetter(str: string) {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

export const normalizeString = (str: string) => {
	const charMap = {
		ş: 's',
		Ş: 'S',
		ı: 'i',
		İ: 'I',
		ü: 'u',
		Ü: 'U',
		ğ: 'g',
		Ğ: 'G',
		ö: 'o',
		Ö: 'O',
		ç: 'c',
		Ç: 'C',
	} as { [key: string]: string };

	// convert turkish chars to english chars
	let replacedString = str.replace(/[^A-Za-z0-9\\[\] ]/g, function (a) {
		return charMap[a] || a;
	});

	// remove all other non accepted characters
	replacedString = replacedString.replace(/[^A-Za-z0-9\\[\] -_]/g, '');
	return replacedString;
};