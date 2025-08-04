# i18n CodeLens

i18n CodeLens makes it easy to find missing language resources, provides various Code Actions, Hover Information, and tips for you to add or edit the language resources.

It can be made to work in various projects by changing the regex information and glob pattern.

## ✨ Key Features

- **🔍 Smart Translation Detection**: Automatically detects translation keys in your code using configurable regex patterns
- **📋 Bulk Translation Editor**: Professional WebView-based interface for editing multiple translation keys simultaneously
- **🎯 Interactive Hover Actions**: Click-to-edit, add, or delete translations directly from hover popups
- **🌐 Multi-Language Support**: Works with JavaScript, TypeScript, React (JSX/TSX) files
- **📊 Visual Indicators**: Color-coded decorations showing translation status (missing, partial, complete)
- **🔄 Real-time Validation**: Instant feedback on missing translations with CodeLens integration
- **🗂️ Resource Tree View**: Organized view of all translation keys with quick navigation
- **⚡ Smart Suggestions**: Auto-completion and closest-match positioning for new translations

## Demo

![Demo](/demo.gif)

### Bulk Translation Editor in Action

![Bulk Edit Demo](/bulk.gif)

## 🚀 What's New in v1.1.0

### Bulk Translation Editor
- **WebView Interface**: Modern, responsive editing interface for multiple translation keys
- **Source File Tracking**: Shows which file triggered the bulk edit operation  
- **Visual Grid Layout**: Easy-to-use table format with VS Code theme integration
- **Real-time Validation**: Highlights empty fields and shows completion statistics
- **Safe Delete Operations**: Custom confirmation dialogs for destructive actions

### Enhanced Hover Provider  
- **Action Links**: Direct edit, add, and delete links in hover popups
- **Smart Context**: Shows different actions based on existing vs missing translations
- **Bulk Edit Triggers**: Quick access to bulk editor for documents with multiple keys
- **Translation Status**: Clear indicators of which languages are missing translations

### Improved Reliability
- **JSON-Safe Operations**: Prevents trailing comma corruption during file modifications
- **Enhanced Error Handling**: Comprehensive error reporting with detailed logging
- **Better Performance**: Optimized resource monitoring and change detection
- **Extended Language Support**: Full React (JSX/TSX) compatibility

## Change Log

##### v1.1.1
- **Enhanced**: Logger system with structured log levels (debug, info, warn, error) and configurable `logLevel` setting
- **Added**: New `codeFileRegex` setting for customizable code file pattern matching (default: `/\.(jsx?|tsx?)$/`)
- **Added**: `.gitignore` integration for file filtering during workspace scanning
- **Improved**: Resource scanning performance with optimized regex handling and execution patterns
- **Improved**: Code file detection with proper filtering of ignored files and relative path handling
- **Enhanced**: Input dialogs with VS Code InputBox API, step progress indicators, and validation feedback
- **Enhanced**: Hover provider with improved layout, inline edit actions, and action links
- **Enhanced**: Error handling with proper categorization and user-friendly error messages
- **Fixed**: Type error in `ResourceTreeViewProvider.ts` related to range character access
- **Fixed**: Function closure issue in `ActionResetAndReloadExtension.ts` error handling
- **Fixed**: Code action provider regex matching to use appropriate code detection pattern
- **Fixed**: Resource line regex execution with proper global flag handling
- **Updated**: Dependencies - `fastest-levenshtein` to v1.0.16 and added `ignore` v7.0.5
- **Updated**: TypeScript configuration to ES2020 target with enhanced module resolution

##### v1.1.0
- **Major Feature**: Added comprehensive bulk translation editing system with WebView interface
- **Enhanced**: Hover provider with interactive edit/add/delete action links  
- **Improved**: JSON-safe file operations preventing trailing comma corruption
- **Added**: Source file tracking for bulk edit operations
- **Enhanced**: Error handling and logging throughout the extension
- **Extended**: Language support for React files (JSX/TSX)
- **Fixed**: WebView modal restrictions with custom confirmation dialogs
- **Improved**: Resource tree view performance and reliability

##### v1.0.6
- Internal RegExp & Glob Pattern updated to support better matching

##### v1.0.5
- Multiple resource key detection fixed at single line for Hover and Code Action Providers

##### v1.0.4
- Logs forwarded to custom i18n CodeLens output channel
- Minor fixes

##### v1.0.3
Performance tweaks & refactored with new features
- Resource Tree view added to Explorer with new configs
- Similar providers centralized
- All settings and reloading data moved to SettingUtils
- Resource delete action added for Code or Resource file
- Action & Configuration settings renamed properly
- Resource hover text fixed after save

##### v1.0.2
- Fix: Missing glob validation added to show properly

##### v1.0.1
- Definition Provider added so that language resource references can be found with 'go to definition' command or Ctrl+click
- Unused resources now show as half-transparent and give hover information on `.json` language resource files

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
- Language file glob patterns (Language resource files must be key value object files). Default: `**/locales/**/*.json`

#### `resourceCodeDetectionRegex`
- Regular expression pattern to identify resource keys for hover information and CodeLenses. The default pattern matches: `t('key')`, `T('key')`, or keys preceded by `/** @i18n */` comment. Default: `(?<=\/\*\*\s*?@i18n\s*?\*\/\s*?["']|\W[tT]\(\s*["'])(?<key>[A-Za-z0-9 .-]+?)(?=["'])`

### `codeFileRegex`
- Regular expression pattern to identify code files for translation keys. Default: `/\.(jsx?|tsx?)$/`

#### `logLevel`
- Controls the log level of the i18n CodeLens extension. Set to 'debug' for more verbose logs. Default: `warn`

## 📖 Usage Examples

### Basic Translation Detection
```javascript
// These patterns will be detected automatically:
t('welcome.message')           // Function call pattern
T('user.name')                 // Uppercase function pattern  
/** @i18n */ 'button.submit'   // Comment annotation pattern
```

### Bulk Editing Workflow
1. Open any file with multiple translation keys
2. Hover over any translation key
3. Click "📋 Bulk Edit (X keys)" link
4. Edit all translations in the visual interface
5. Save or delete multiple keys at once

### Resource Management
- **Add**: Hover over missing translation → Click "Add Translations"
- **Edit**: Hover over existing translation → Click "Edit Translations"  
- **Delete**: Hover over any translation → Click "Delete Translations"
- **Bulk Operations**: Use bulk editor for multiple keys

## 🤝 Contributing

Issues and feature requests are welcome! Please check the [GitHub repository](https://github.com/hepter/i18n-codelens) for more information.

## 📄 License

This project is licensed under the MIT License.
