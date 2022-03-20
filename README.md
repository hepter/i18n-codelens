# i18n CodeLens

i18n CodeLens, makes it easy to find missing language resources, provides various Code Actions, Hover Information, and tips for you to add or edit the language resources.

It can be made to work in various projects by changing the regex information and glob pattern.

## Demo

![Demo](/demo.gif)

## Change Log

##### v1.0.3

Performance tweaks & refactored with new features

- Resource Tree view added to Explorer with new configs.
- Similar providers centralized.
- All settings and reloading data's moved to SettingUtils.
- Resource delete action added for Code or Resource file
- Action & Conmfiguration settings renamed properly.
- Resource hover text fixed after save.

##### v1.0.2

- Fix: Missing glob validation added to shows properly.

##### v1.0.1

- Definition Provider added so that the language resource references can be found with 'go to definition' command or ctrl + click.
- Unused resources now show as half-transparent and give hover information on `.json` language resource files.

##### v1.0.0

- Initial release

## Settings

#### `codeLens`

- Enable or disable the CodeLens for missing resource code. Default: `true`

#### `resourceAutoSave`

- Enable auto save for resource file(s) that saves files after inserted or updated resource data. Default: `true`

#### `underlineCodeDecorator`

- Enable or disable the underline decorator for missing resource code(s). Default: `true`

#### `autoFocusAfterModified`

- Enable auto focus document after inserted or updated target resource file(s). Default: `false`

#### `revealResourceInTreeView`

- Enable or disable the automatic reveal resource item in the Resource Tree View when selected resource file on the editor. Default: `false`

#### `resourceTreeViewVisible`

- Enable or disable the Resource Tree View. Default: `true`

#### `resourceFilesGlobPattern`

- Language file glob patterns (Language resource files must be key value object files). Default: `**/locales/*.json`

#### `resourceCodeDetectionRegex`

- Regex to detect hover or codeLenses for Language Default: `(?<=T\\(['\"])(?<key>[a-zA-Z0-9.-]+?)(?=['\"]\\))`
