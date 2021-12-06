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
export async function getLanguageResourcesFiles(clearCache = false): Promise<LanguageResource> {

	const response: LanguageResource = [];
	const globPattern = vscode.workspace.getConfiguration("akinon-codelens").get("languageGlobPattern", "**/locales/*.json");
	if (languageResourcesFilesCache?.length && !clearCache) {
		return languageResourcesFilesCache;
	}
	const vscodeUriList = await vscode.workspace.findFiles(globPattern, "**/node_modules/**");

	console.log(`Language files ${vscodeUriList.length ? "" : "not"} found!`);


	for (const uri of vscodeUriList) {
		try {
			const data = fs.readFileSync(uri.path);
			const filePath = path.parse(uri.path);
			const keyValuePairs = JSON.parse(data.toString());

			response.push({
				path: uri.path,
				fileName: filePath.name,
				dir: filePath.dir,
				keyValuePairs
			});
		} catch (error) {
			console.log("Resource file parse error:" + uri, error);
		}
	}

	languageResourcesFilesCache = response;
	return response;
}


async function applyEditByFilePath(filePath: string, nearestResourceKey: string, resourceKey: string, resourceData: string): Promise<void> {
	const rawData = fs.readFileSync(filePath).toString();

	const lineRegex = /([\t ]*?)(["']).*?(,?)(\r?\n)/;// 4 RegExp groups
	const resourceLineRegex = new RegExp(`(?<=["'])${nearestResourceKey}(?=["']).*\r?(?:\n|$)`);
	const matchGroups = rawData.match(lineRegex);

	let newLine = `\n  "${resourceKey}": "${resourceData}",`;
	if (matchGroups?.length == 5) { // 4 groups + 1 for the whole match
		const space = matchGroups[1];
		const quote = matchGroups[2];
		const comma = matchGroups[3];
		const newLineChar = matchGroups[4];

		newLine = `${newLineChar}${space}${quote}${resourceKey}${quote}: ${quote}${resourceData}${quote}${comma}`;
	}

	let positionLine = 0;
	let positionOffset = 0;

	let lineCounter = 0;
	const lines = rawData.split(/\r?\n/);
	for (const line of lines) {
		const matchNearestLine = resourceLineRegex.exec(line);
		if (matchNearestLine) {
			positionLine = lineCounter;
			positionOffset = line.length;
			break;
		}
		lineCounter++;
	}

	const workspaceEdit = new vscode.WorkspaceEdit();
	workspaceEdit.insert(vscode.Uri.file(filePath), new vscode.Position(positionLine, positionOffset), newLine);
	await vscode.workspace.applyEdit(workspaceEdit);

	positionLine++; // Current line is increased by 1

	const document = await vscode.window.showTextDocument(vscode.Uri.file(filePath), {
		preserveFocus: true,
		preview: false,
	});

	const newLinePosition = new vscode.Position(positionLine, 0);
	const newLinePositionEnd = new vscode.Position(positionLine, newLine.length);
	document.revealRange(new vscode.Range(newLinePosition, newLinePositionEnd), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
	document.selection = new vscode.Selection(newLinePosition, newLinePositionEnd);
}


/**
 * [resourceKey]: 'Translated Data'
 */
type TranslationData = {
	[languageFileName: string]: string
};


export async function addNewLanguageTranslation(resourceKey: string, translationsData: TranslationData) {

	const resourceList = await getLanguageResourcesFiles(true);
	for (const resource of resourceList) {

		const matchedTranslation = translationsData[resource.fileName];
		const closestResourceKey = closest(resourceKey, Object.keys(resource.keyValuePairs)) ?? resourceKey;
		try {
			await applyEditByFilePath(resource.path, closestResourceKey, resourceKey, matchedTranslation);
		} catch (error) {
			console.log(error);
		}
	}
}


export function capitalizeFirstLetter(str: string) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}