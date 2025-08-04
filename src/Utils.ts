import { closest } from 'fastest-levenshtein';
import * as vscode from "vscode";
import SettingUtils from './SettingUtils';
import { extensionName, settings } from './constants';

async function applyEditByFileUri(fileUri: vscode.Uri, nearestResourceKey: string, resourceKey: string, resourceData: string, isUpdate?: boolean): Promise<void> {
	try {
		const rawData = (await vscode.workspace.fs.readFile(fileUri)).toString();

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

		if (isUpdate) {
			workspaceEdit.replace(fileUri,
				new vscode.Range(
					new vscode.Position(positionLine, 0),
					new vscode.Position(positionLine, positionOffset)
				),
				newLine.replace(/\r?\n/g, ''));
		} else {
			workspaceEdit.insert(fileUri, new vscode.Position(positionLine, positionOffset), newLine);
		}

		let dispose;
		if (SettingUtils.isEnabledAutoSave()) {
			dispose = vscode.workspace.onDidChangeTextDocument(e => {
				e.document.save();
			});
		}

		await vscode.workspace.applyEdit(workspaceEdit);
		dispose?.dispose();

		if (!isUpdate) {
			positionLine++; // Current line is increased by 1
		}

		if (SettingUtils.isEnabledAutoFocus()) {
			const document = await vscode.window.showTextDocument(fileUri, {
				preserveFocus: true,
				preview: false,
			});

			const newLinePosition = new vscode.Position(positionLine, 0);
			const newLinePositionEnd = new vscode.Position(positionLine, newLine.length);
			document.revealRange(new vscode.Range(newLinePosition, newLinePositionEnd), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
			document.selection = new vscode.Selection(newLinePosition, newLinePositionEnd);
		}
	} catch (error) {
		const fileName = vscode.workspace.asRelativePath(fileUri);
		Logger.error(`ERROR applying edit to file ${fileName}:`, error);
		throw error;
	}
}

type TranslationData = {
	[languageFileName: string]: string
};


export async function addNewOrUpdateLanguageTranslation(resourceKey: string, modifiedTranslationsData: TranslationData, isUpdate?: boolean): Promise<void> {
	try {
		Logger.info(`${isUpdate ? 'Updating' : 'Adding'} translations for key: ${resourceKey}`);

		const resourceList = SettingUtils.getResources();
		const processedFiles: string[] = [];

		for (const resource of resourceList) {
			const matchedTranslation = modifiedTranslationsData[resource.fileName];
			if (matchedTranslation) {
				try {
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

					await applyEditByFileUri(resource.uri, closestResourceKey, resourceKey, matchedTranslation, isUpdate);
					processedFiles.push(resource.fileName);
				} catch (error) {
					Logger.error(`ERROR processing file ${resource.fileName}:`, error);
					vscode.window.showErrorMessage(`Failed to update ${resource.fileName}: ${error instanceof Error ? error.message : String(error)}`);
				}
			}
		}

		if (processedFiles.length > 0) {
			Logger.info(`${isUpdate ? "Updated" : "Added"} translation(s) for key '${resourceKey}' in ${processedFiles.length} languages: ${processedFiles.join(", ")}`);
		} else {
			Logger.warn(`No files were processed for key '${resourceKey}'`);
		}
	} catch (error) {
		Logger.error("ERROR in addNewOrUpdateLanguageTranslation:", error);
		throw error;
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

const log = vscode.window.createOutputChannel("i18n CodeLens");

enum LogLevel {
	Off = 0,
	Error = 1,
	Warn = 2,
	Info = 3,
	Debug = 4
}

function getLogLevel(): LogLevel {
	const config = vscode.workspace.getConfiguration(extensionName).get(settings.logLevel, "warn");
	const level = config?.toLowerCase();
	switch (level) {
		case 'debug': return LogLevel.Debug;
		case 'info': return LogLevel.Info;
		case 'warn': return LogLevel.Warn;
		case 'error': return LogLevel.Error;
		default: return LogLevel.Off;
	}
}

export class Logger {
	private static level: LogLevel = getLogLevel();

	public static log(message: any, ...args: any[]) {
		try {
			const date = new Date();
			const time = date.toLocaleTimeString();
			const timeMilliseconds = date.getMilliseconds().toString().padStart(3, '0');
			const timeLog = `[${time}.${timeMilliseconds}]`;

			let msg = message + "";
			if (args?.length) {
				msg = msg.replace(/{(\d+)}/g, function (match, number) {
					return typeof args[number] !== 'undefined' ? args[number] : match;
				});
			}

			if (args.length > 0 && args[0] instanceof Error) {
				msg += `\nStack trace: ${args[0].stack}`;
			}

			msg = `${timeLog} ${msg}`;
			log.appendLine(msg);
			console.log(message, ...args);

			if (message.includes('❌ CRITICAL ERROR')) {
				log.show(true);
			}
		} catch (error) {
			console.error('Logger failed:', error);
			console.log('Original message:', message, ...args);
		}
	}

	public static error(message: string, ...args: any[]) {
		if (this.level >= LogLevel.Error) {
			this.log(`[ERROR] ${message}`, ...args);
		}
	}

	public static warn(message: string, ...args: any[]) {
		if (this.level >= LogLevel.Warn) {
			this.log(`[WARN] ${message}`, ...args);
		}
	}

	public static info(message: string, ...args: any[]) {
		if (this.level >= LogLevel.Info) {
			this.log(`[INFO] ${message}`, ...args);
		}
	}

	public static debug(message: string, ...args: any[]) {
		if (this.level >= LogLevel.Debug) {
			this.log(`[DEBUG] ${message}`, ...args);
		}
	}



	public static showCriticalError(message: string, error?: any) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		const fullMessage = `❌ CRITICAL ERROR: ${message}${error ? `: ${errorMessage}` : ''}`;

		this.log(fullMessage, error);
		vscode.window.showErrorMessage(
			`i18n CodeLens Critical Error: ${message}. Check output panel for details.`,
			'Show Output'
		).then(selection => {
			if (selection === 'Show Output') {
				log.show();
			}
		});
	}
}
