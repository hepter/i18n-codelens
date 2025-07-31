export const extensionName = "i18n-codelens";

export const settings = {
	codeLens: "codeLens",
	autoSave: "resourceAutoSave",
	underlineDecorator: "underlineCodeDecorator",
	autoFocus: "autoFocusAfterModified",
	globPattern: "resourceFilesGlobPattern",
	resourceRegex: "resourceCodeDetectionRegex",
	revealTreeView: "revealResourceInTreeView"
};

export const actions = {
	enableCodeLens: `${extensionName}.enableCodeLensAction`,
	disableCodeLens: `${extensionName}.disableCodeLensAction`,
	resetAndReloadExtension: `${extensionName}.resetAndReloadExtensionAction`,
	addResource: `${extensionName}.addLanguageResourceAction`,
	editResource: `${extensionName}.editLanguageResourceAction`,
	deleteResource: `${extensionName}.deleteLanguageResourceAction`,
	focusResource: `${extensionName}.focusResourceAction`,
	revealResource: `${extensionName}.revealResourceAction`,
	bulkEditResources: `${extensionName}.bulkEditResourcesAction`,
};
