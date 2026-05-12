# i18n CodeLens

**Professional internationalization management for VS Code**

i18n CodeLens is a comprehensive translation management extension that streamlines localization workflows for JavaScript, TypeScript, and React projects. It provides intelligent detection of translation keys, visual indicators for missing translations, and powerful editing tools—all integrated directly into your development environment.

> **Architecture update**: The standalone MCP server and shared i18n engine now live in the companion npm package [`i18n-codelens-mcp`](https://www.npmjs.com/package/i18n-codelens-mcp) ([GitHub](https://github.com/hepter/i18n-codelens-mcp)). This repository stays focused on the VS Code extension experience and automatically wires that backend into VS Code.

### Key Capabilities

The extension can be customized for different project structures through configurable regex patterns and glob settings, making it adaptable to various i18n frameworks and conventions.

## ✨ Key Features

- **🤖 MCP Integration & Automation**: MCP integration with rich i18n tools; auto-registers via VS Code LM API and shares its engine with the standalone `i18n-codelens-mcp` package
- **🔍 Smart Translation Detection**: Automatically detects translation keys in your code using configurable regex patterns
- **📋 Bulk Translation Editor**: Professional WebView-based interface for editing multiple translation keys simultaneously
- **📝 Resource Edit Screen**: WebView-based multiline add/edit screen for individual translation actions, with a setting to fall back to legacy single-line inputs
- **🎯 Interactive Hover Actions**: Click-to-edit, add, or delete translations directly from hover popups
- **🌐 Multi-Language Support**: Works with JavaScript, TypeScript, React (JSX/TSX) files
- **📊 Visual Indicators**: Color-coded decorations showing translation status (missing, partial, complete)
- **🔄 Real-time Validation**: Instant feedback on missing translations with CodeLens integration
- **🗂️ Resource Tree View**: Organized view of all translation keys with quick navigation
- **⚡ Smart Suggestions**: Auto-completion and closest-match positioning for new translations
- **🧱 Flat/Nested Awareness**: Detects flat translation dictionaries and deeply nested JSON, preserving structure during edits
- **🧭 Insert Order Strategies**: Control how new keys are placed in locale files — append to end, insert near the closest key (Levenshtein), or fully sort A→Z

## Demo

![Demo](/demo.gif)

### Bulk Translation Editor in Action

![Bulk Edit Demo](/bulk.gif)

## 🚀 What's New in v1.3.0

Concise highlights only (see full details in the Change Log below):

- MCP architecture split
  - Standalone MCP server and shared i18n engine are now published from `i18n-codelens-mcp`
  - This extension remains focused on VS Code UX and auto-registers that shared backend
  - External MCP clients should use the npm package instead of this repository as the integration surface
- Expanded MCP capability surface
  - Shared backend now includes project info, search, namespace inspection, audit, unused key detection, and formatting tools
- New resource edit experience
  - Add/edit translation actions can open the new WebView-based multiline resource edit screen
  - `experimental.multilineTranslationInput` controls whether the new screen or legacy single-line inputs are used
- Shared behavior across editor and standalone flows
  - Config, resource structure handling, ordering rules, and file safety checks now come from the same package

## 🤖 MCP Automation Tools

The extension includes Model Context Protocol (MCP) integration for AI-powered automation.

### Integration Options

**VS Code LM API (Recommended)**  
The extension automatically registers with VS Code's Language Model API. Compatible clients like GitHub Copilot Agentic, Claude for VS Code, and other MCP-aware tools can invoke the tools without additional configuration.

**Standalone MCP Package**  
External CLI and desktop clients should use the separate [`i18n-codelens-mcp`](https://github.com/hepter/i18n-codelens-mcp) package. That package contains the public `npx -y i18n-codelens-mcp` server, external client setup examples, and the full standalone MCP documentation.

Helpful links:

- npm: [i18n-codelens-mcp](https://www.npmjs.com/package/i18n-codelens-mcp)
- GitHub: [hepter/i18n-codelens-mcp](https://github.com/hepter/i18n-codelens-mcp)

> **Note**: The `npm run mcp` and `npm run inspect` scripts in this repository are kept for extension development and inspector testing.

### Environment Variables

Customize server behavior with these environment variables:

- `I18N_GLOB` — Pattern for resource files (defaults to `**/locales/**/*.json`)
- `I18N_CODE_REGEX` — Custom regex for detecting translation keys
- `I18N_CODE_GLOB` — Pattern for code files (defaults to `**/*.{ts,tsx,js,jsx}`)
- `I18N_IGNORE` — Additional glob patterns to ignore (e.g., `**/dist/**;**/.next/**`); `.gitignore` is also respected
- `I18N_STRUCTURE` — Controls write structure (`auto` | `flat` | `nested`)
- `I18N_INSERT_ORDER` — Controls insert order (`append` | `nearby` | `sort`)

You can also override the workspace root via CLI args:

- `--workspaceRoot <path>` (or `--workspace-root <path>`, including `--workspaceRoot=<path>`)

Workspace root resolution order is: CLI arg → `WORKSPACE_ROOT` env → `process.cwd()` → server path fallback.

> **Note**: Auto-registration requires VS Code `1.118.0` or newer. External MCP clients should use the standalone `i18n-codelens-mcp` package.

### Available Tools

| Tool | Description |
|------|-------------|
| `i18n_project_info` | Returns resolved workspace/config metadata and compact locale/key counts |
| `i18n_list_locales` | Lists available locale files with normalized tags and human-friendly descriptions |
| `i18n_check_keys` | Checks translation key presence across locales; keys ending with a dot are treated as namespace prefixes |
| `i18n_get_translations` | Retrieves translations for specified keys and locales |
| `i18n_search_keys` | Searches keys or values with compact preview output |
| `i18n_get_namespace` | Returns a compact view of keys under a namespace prefix |
| `i18n_upsert_translations` | Bulk add or update translations across multiple locales (supports dry-run) |
| `i18n_delete_key` | Removes a translation key from all locale files (supports locale filter and dry-run) |
| `i18n_diff_locales` | Diffs base vs. compare locales: missing/extra keys and placeholder parity |
| `i18n_scan_workspace_missing` | Scans code for referenced keys missing in resources and surfaces references |
| `i18n_key_references` | Surfaces non-locale code references for given keys with file/line/column details |
| `i18n_rename_key` | Renames a key across all locales with collision checks (supports dry-run) |
| `i18n_move_namespace` | Moves a key prefix (namespace) across locales with safety checks (supports dry-run) |
| `i18n_validate_placeholders` | Validates placeholder consistency across locales |
| `i18n_unused_keys` | Finds locale keys that are not referenced in source code |
| `i18n_audit` | Returns a compact audit summary for missing, mismatched, or unused translations |
| `i18n_format_resources` | Previews or applies normalized JSON formatting and optional key sorting |
| `i18n_untranslated_keys_on_page` | Returns keys used in one source file that are missing from at least one locale |

These tools integrate with AI workflows to automate translation validation, identify gaps, and streamline localization management.

### MCP Client Setup Examples

External client setup examples for Claude Code, Gemini CLI, OpenAI Codex CLI, Claude Desktop, Cursor, Windsurf, and manual MCP config files are maintained in the standalone package documentation:

- npm: [i18n-codelens-mcp](https://www.npmjs.com/package/i18n-codelens-mcp)
- GitHub: [hepter/i18n-codelens-mcp](https://github.com/hepter/i18n-codelens-mcp)

## 🧱 Flat & Nested JSON Support

The extension intelligently handles both flat and nested translation file structures:

- **Automatic detection**: Identifies whether files use flat key-value maps or nested object hierarchies
- **Internal flattening**: Processes nested structures internally for search and CodeLens functionality
- **Structure preservation**: Maintains original formatting when writing updates to disk
- **Flexibility**: Edit deeply nested locale files without manual flattening, while keeping MCP automation fully functional

## Change Log

##### v1.3.0
- **Changed**: Standalone MCP server and shared i18n engine are now distributed from the published `i18n-codelens-mcp` package.
- **Changed**: This extension remains the editor-facing layer and auto-registers that shared MCP backend via the VS Code LM API.
- **Added**: New WebView-based multiline resource edit screen for add/edit translation actions.
- **Added**: `experimental.multilineTranslationInput` setting to switch between the new resource edit screen and legacy single-line inputs.
- **Added**: README guidance now points external MCP clients to the npm package for setup, installation, and the expanded tool surface.
- **Refactored**: Shared config and resource utilities are sourced from the MCP package so editor and standalone behavior stay aligned.

##### v1.2.4
- **Fixed**: Standalone MCP now prefers `process.cwd()` as the workspace root, improving multi-project usage in external MCP clients.
- **Added**: CLI override for workspace root via `--workspaceRoot` / `--workspace-root` (also supports `--workspaceRoot=<path>`).
- **Fixed**: Standalone MCP logging uses stderr-safe output to avoid stdio protocol interference.
- **Fixed**: Workspace scanning now skips symbolic links and suppresses traversal errors, preventing `EPERM`/broken-link scan failures.
- **Improved**: MCP file operations enforce workspace-bound writes/reads and reject symlink-based path escapes.

##### v1.2.3
- Stabilized MCP registration (single supported constructor, no fallbacks, with new log channel for MCP Server)
- Non‑blocking logging with graceful console fallback
- Useful diagnostics: startup config + per‑tool success/error with durations

##### v1.2.2
- **Fixed**: MCP duplicate tool registrations in GitHub Copilot Chat by pruning stale/invalid `mcpServers` entries and keeping only the current server path at activation.
- **Improved**: More robust MCP provider lifecycle (re-register/dispose) with safer error handling.
- **Note**: After upgrading, use “Developer: Reload Window”. If duplicates persist, remove old entries under `github.copilotChat.mcpServers` once in Settings (JSON).

##### v1.2.1
- **Added**: `resourceInsertOrderStrategy` setting with configurable strategies (`append`, `nearby`, `sort`) so you decide how new translations are positioned; `nearby` uses closest-match heuristics by default.
- **Added**: `I18N_INSERT_ORDER` environment variable and MCP wiring to keep Copilot/Inspector automation aligned with the chosen insert strategy.
- **Improved**: Translation writes (flat or nested JSON) preserve original ordering unless explicit alphabetical sorting is requested, preventing unexpected churn in locale files.
- **Improved**: Shared ordering utilities reuse the same Levenshtein-based placement logic across extension actions and MCP tools for consistent behaviour.

##### v1.2.0
- **Added**: Model Context Protocol stdio server with five automation tools and VS Code LM auto-registration
- **Added**: Automatic detection of nested translation files with safe flatten/unflatten helpers
- **Added**: `overviewRulerMarkers` setting for scroll bar indicators
- **Improved**: Resource sorting and `.gitignore` handling for stable results across features
- **Improved**: Manual MCP usage through the standalone `i18n-codelens-mcp` package and environment overrides
- **Improved**: Cleaner scroll bar with smart indicators - only problematic translations are highlighted
- **Updated**: Minimum VS Code version to `^1.96.0` to enable LM/MCP integration

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

## Configuration

### Core Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `codeLens` | Enable CodeLens indicators for missing translations | `true` |
| `underlineCodeDecorator` | Show underline decorations for missing translations | `true` |
| `overviewRulerMarkers` | Show scroll bar markers for problematic translations (warnings/errors only) | `true` |
| `resourceAutoSave` | Auto-save resource files after edits | `true` |
| `autoFocusAfterModified` | Focus editor on modified resource files | `false` |
| `experimental.multilineTranslationInput` | Use the new Webview-based multiline resource edit screen for add/edit actions instead of legacy single-line input boxes | `true` |

### Tree View Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `resourceTreeViewVisible` | Display Resource Tree View in Explorer | `true` |
| `revealResourceInTreeView` | Auto-reveal selected resources in Tree View | `false` |

### Pattern Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `resourceFilesGlobPattern` | Glob pattern for locating translation files | `**/locales/**/*.json` |
| `codeFilesGlobPattern` | Glob pattern used to scan code files for i18n references | `**/*.{ts,tsx,js,jsx}` |
| `resourceCodeDetectionRegex` | Regex for detecting translation keys in code | See below |
| `codeFileRegex` | Pattern for identifying code files | `/\.(jsx?|tsx?)$/` |
| `ignoreGlobs` | Additional ignore globs for scans (both code and resources) | `['**/node_modules/**']` |
| `resourceStructureStrategy` | Write structure: `auto`, `flat`, or `nested` | `auto` |
| `resourceInsertOrderStrategy` | Insert order: `append`, `nearby`, or `sort` | `nearby` |

**Default detection regex:**  
`(?<=\/\*\*\s*?@i18n\s*?\*\/\s*?["']|\W[tT]\(\s*["'])(?<key>[A-Za-z0-9 .-_]+?)(?=["])`

This matches:
- `t('key')` or `T('key')` — Function call patterns
- `/** @i18n */ 'key'` — Comment annotation pattern

### Logging

| Setting | Description | Default |
|---------|-------------|---------|
| `logLevel` | Control extension log verbosity (`debug`, `info`, `warn`, `error`, `off`) | `warn` |

## 📖 Usage Guide

### Translation Key Detection

The extension automatically detects translation keys using these patterns:

```javascript
// Function call patterns
t('welcome.message')           // lowercase
T('user.greeting')             // uppercase

// JSX/TSX usage
<Text>{t('button.submit')}</Text>

// Annotation pattern
/** @i18n */ 'settings.title'
```

### Quick Actions

**Add Missing Translations**
1. Hover over any translation key with missing translations
2. Click **"Add Translations"** in the hover popup
3. Enter translations in the WebView-based multiline resource edit screen when `experimental.multilineTranslationInput` is enabled
4. Files are saved automatically (if `resourceAutoSave` is enabled)

**Edit Existing Translations**
1. Hover over a translation key
2. Click **"Edit Translations"**
3. Modify values in the WebView-based multiline resource edit screen when `experimental.multilineTranslationInput` is enabled
4. Changes are applied instantly

**Delete Translations**
1. Hover over a translation key
2. Click **"Delete Translations"**
3. Confirm removal
4. Key is removed from all locale files

### Bulk Editing

For efficient multi-key editing:

1. Open a file containing multiple translation keys
2. Hover over any key and click **"📋 Bulk Edit (X keys)"**
3. The visual editor opens with all keys from the current file
4. Edit, add, or delete multiple translations simultaneously
5. Click **Save** to apply all changes at once

### Navigation & Discovery

**Go to Definition**  
`Ctrl+Click` (or `Cmd+Click`) on any translation key to jump to its definition in locale files.

**Resource Tree View**  
View all translations used in the active file organized by key, with visual indicators for:
- ✅ Complete translations (all languages present)
- ⚠️ Partial translations (some languages missing)
- ❌ Missing translations (key not found)

## 🤝 Contributing

Issues and feature requests are welcome! Please check the [GitHub repository](https://github.com/hepter/i18n-codelens) for more information.

## 📄 License

This project is licensed under the MIT License.
