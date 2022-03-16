# i18n CodeLens

i18n CodeLens makes it easy to find missing language resources, provides various Code Actions, Hover Information, and tips for you to add or edit the language resources.

It can be made to work in various projects by changing the regex information and glob pattern.

## Change Log

##### v1.0.1

- Definition Provider added so that the language resource references can be found with 'go to definition' command or ctrl + click.
- Unused resources now show as half-transparent and give hover information on `.json` language resource files

##### v1.0.0

- Initial release

## Demo

![Demo](/demo.gif)

## Settings

#### `enableCodeLens`

- Enable or disable the CodeLens for missing resource code. Default: `true`

#### `enableResourceAutoSaveInsertOrUpdate`

- Enable auto save for resource file(s) that saves files after inserted or updated resource data. Default: `true`

#### `enableUnderlineResourceDecorator`

- Enable or disable the underline decorator for missing resource code(s). Default: `true`

#### `enableAutoFocusDocumentAfterAltered`

- Enable auto focus document after inserted or updated target resource file(s). Default: `false`

#### `languageGlobPattern`

- Language file glob patterns. (Language resource files must be key value object files.) `**/locales/*.json`

#### `languageTranslatorRegex`

- Regex to detect hover or codeLenses for Language Default: `(?<=T\\(['\"])[a-zA-Z0-9.-]+?(?=['\"]\\))`
