# Akinon CodeLens

Akinon CodeLens makes it easy to find missing language resources, provides various Code Actions, Hover Information, and tips for you to add or edit the language resources.

It can be made to work in various projects by changing the regex information and glob pattern.




# Extension link
VS Code Extension: [Akinon CodeLens](https://marketplace.visualstudio.com/items?itemName=mustafa-kuru.akinon-codelens)


## Demo
![Demo](/demo.gif)



## Settings
 change git remote origin address: 

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
 
	 

 



