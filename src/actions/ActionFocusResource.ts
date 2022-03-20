import * as vscode from "vscode";

const goToLocationIndexMap = new Map<string, number>();
let lastUri: vscode.Uri | undefined;
let lastLabel: string;
export default function ActionFocusResource(label: string, location: vscode.Location[]) {

	if (!location.length) return;

	if ((lastUri && lastUri.fsPath !== location[0].uri.fsPath) || (lastLabel && lastLabel !== label)) {
		goToLocationIndexMap.clear();
	}

	lastUri = location?.[0]?.uri;
	lastLabel = label;
	const locationIndex = (goToLocationIndexMap.get(label) || 0) % location.length;
	const locationToFocus = location[locationIndex];
	goToLocationIndexMap.set(label, locationIndex + 1);
	vscode.window.showTextDocument(locationToFocus.uri, {
		preview: false,
		preserveFocus: true,
		selection: locationToFocus.range,
	});
}

