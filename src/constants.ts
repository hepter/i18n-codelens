export const extensionName = "i18n-codelens";

export const settings = {
	codeLens: "codeLens",
	autoSave: "resourceAutoSave",
	underlineDecorator: "underlineCodeDecorator",
	overviewRulerMarkers: "overviewRulerMarkers",
	autoFocus: "autoFocusAfterModified",
	globPattern: "resourceFilesGlobPattern",
	codeFilesGlobPattern: "codeFilesGlobPattern",
	resourceRegex: "resourceCodeDetectionRegex",
	ignoreGlobs: "ignoreGlobs",
	revealTreeView: "revealResourceInTreeView",
	codeFileRegex: "codeFileRegex",
	structureStrategy: "resourceStructureStrategy",
	insertOrderStrategy: "resourceInsertOrderStrategy",
	logLevel: "logLevel",
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
	startMcpServer: `${extensionName}.startMcpServer`,
	stopMcpServer: `${extensionName}.stopMcpServer`,
	restartMcpServer: `${extensionName}.restartMcpServer`,
};
