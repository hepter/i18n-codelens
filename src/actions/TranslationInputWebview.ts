import * as vscode from 'vscode';

export type TranslationInputMode = 'add' | 'edit';

export type TranslationInputItem = {
	language: string;
	value: string;
	placeholder?: string;
};

export type TranslationInputResult = Record<string, string>;

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function getNonce(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let nonce = '';
	for (let i = 0; i < 32; i++) {
		nonce += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return nonce;
}

export async function collectTranslationsWithWebview(
	key: string,
	items: TranslationInputItem[],
	mode: TranslationInputMode,
): Promise<TranslationInputResult | undefined> {
	const panel = vscode.window.createWebviewPanel(
		'i18nTranslationInput',
		`${mode === 'add' ? 'Add' : 'Edit'} Translation - ${key}`,
		vscode.ViewColumn.Active,
		{
			enableScripts: true,
			retainContextWhenHidden: true,
			localResourceRoots: [],
		},
	);

	panel.webview.html = getTranslationInputHtml(key, items, mode);

	return new Promise<TranslationInputResult | undefined>((resolve) => {
		let settled = false;
		const finish = (result: TranslationInputResult | undefined) => {
			if (settled) return;
			settled = true;
			resolve(result);
			panel.dispose();
		};

		panel.webview.onDidReceiveMessage((message) => {
			if (message?.command === 'cancel') {
				finish(undefined);
				return;
			}

			if (message?.command === 'save') {
				const data = message.data as TranslationInputResult | undefined;
				const missing = items.filter(item => !data?.[item.language]?.trim()).map(item => item.language);
				if (missing.length) {
					void vscode.window.showWarningMessage(`Please fill translations for: ${missing.join(', ')}`);
					return;
				}
				finish(data);
			}
		});

		panel.onDidDispose(() => finish(undefined));
	});
}

function getTranslationInputHtml(key: string, items: TranslationInputItem[], mode: TranslationInputMode): string {
	const nonce = getNonce();
	const safeItemsJson = JSON.stringify(items).replace(/</g, '\\u003c');
	const escapedKey = escapeHtml(key);
	const title = mode === 'add' ? 'Add translations' : 'Edit translations';
	const primaryLabel = mode === 'add' ? 'Add translations' : 'Save changes';

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
	<title>${escapeHtml(title)}</title>
	<style nonce="${nonce}">
		:root {
			color-scheme: light dark;
		}

		body {
			box-sizing: border-box;
			min-width: 320px;
			margin: 0;
			padding: 20px;
			color: var(--vscode-foreground);
			background: var(--vscode-editor-background);
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
		}

		* {
			box-sizing: border-box;
		}

		.header {
			display: flex;
			flex-direction: column;
			gap: 8px;
			margin-bottom: 18px;
		}

		h1 {
			margin: 0;
			font-size: 20px;
			font-weight: 600;
			letter-spacing: 0;
		}

		.key {
			width: fit-content;
			max-width: 100%;
			padding: 6px 8px;
			overflow-wrap: anywhere;
			border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
			border-radius: 4px;
			color: var(--vscode-descriptionForeground);
			background: var(--vscode-input-background);
			font-family: var(--vscode-editor-font-family);
		}

		.grid {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
			gap: 12px;
			margin-bottom: 74px;
		}

		.field {
			display: flex;
			flex-direction: column;
			min-width: 0;
			border: 1px solid var(--vscode-panel-border);
			border-radius: 6px;
			background: var(--vscode-sideBar-background);
		}

		.field-header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 8px;
			padding: 8px 10px;
			border-bottom: 1px solid var(--vscode-panel-border);
		}

		.locale {
			min-width: 0;
			font-weight: 600;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.count {
			flex: 0 0 auto;
			color: var(--vscode-descriptionForeground);
			font-size: 12px;
		}

		textarea {
			width: 100%;
			min-height: 132px;
			resize: vertical;
			padding: 10px;
			border: 0;
			outline: 0;
			color: var(--vscode-input-foreground);
			background: var(--vscode-input-background);
			font-family: var(--vscode-editor-font-family);
			font-size: var(--vscode-editor-font-size);
			line-height: 1.45;
		}

		textarea:focus {
			box-shadow: inset 0 0 0 1px var(--vscode-focusBorder);
		}

		textarea.invalid {
			box-shadow: inset 0 0 0 1px var(--vscode-inputValidation-errorBorder);
		}

		.footer {
			position: fixed;
			left: 0;
			right: 0;
			bottom: 0;
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 12px;
			padding: 12px 20px;
			border-top: 1px solid var(--vscode-panel-border);
			background: var(--vscode-editor-background);
		}

		.status {
			min-width: 0;
			color: var(--vscode-descriptionForeground);
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.actions {
			display: flex;
			gap: 8px;
			flex: 0 0 auto;
		}

		button {
			min-width: 88px;
			padding: 7px 12px;
			border: 1px solid var(--vscode-button-border, transparent);
			border-radius: 4px;
			font: inherit;
			cursor: pointer;
		}

		button.primary {
			color: var(--vscode-button-foreground);
			background: var(--vscode-button-background);
		}

		button.primary:hover {
			background: var(--vscode-button-hoverBackground);
		}

		button.secondary {
			color: var(--vscode-button-secondaryForeground);
			background: var(--vscode-button-secondaryBackground);
		}

		button.secondary:hover {
			background: var(--vscode-button-secondaryHoverBackground);
		}

		button:disabled {
			opacity: 0.55;
			cursor: not-allowed;
		}
	</style>
</head>
<body>
	<header class="header">
		<h1>${escapeHtml(title)}</h1>
		<div class="key">${escapedKey}</div>
	</header>

	<main class="grid" id="fields"></main>

	<footer class="footer">
		<div class="status" id="status"></div>
		<div class="actions">
			<button class="secondary" id="cancel" type="button">Cancel</button>
			<button class="secondary" id="reset" type="button">Reset</button>
			<button class="primary" id="save" type="button">${escapeHtml(primaryLabel)}</button>
		</div>
	</footer>

	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		const items = ${safeItemsJson};
		const fields = document.getElementById('fields');
		const statusEl = document.getElementById('status');
		const saveButton = document.getElementById('save');

		function escapeText(value) {
			return String(value)
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#39;');
		}

		function render() {
			fields.innerHTML = items.map(item => \`
				<section class="field">
					<div class="field-header">
						<div class="locale" title="\${escapeText(item.language)}">\${escapeText(item.language)}</div>
						<div class="count">0</div>
					</div>
					<textarea
						data-language="\${escapeText(item.language)}"
						placeholder="\${escapeText(item.placeholder || '')}"
						spellcheck="true"
					>\${escapeText(item.value || '')}</textarea>
				</section>
			\`).join('');
			document.querySelector('textarea')?.focus();
			updateState();
		}

		function collect() {
			const data = {};
			document.querySelectorAll('textarea').forEach(textarea => {
				data[textarea.dataset.language] = textarea.value;
			});
			return data;
		}

		function updateState() {
			let missing = 0;
			document.querySelectorAll('textarea').forEach(textarea => {
				const value = textarea.value;
				const empty = !value.trim();
				if (empty) missing++;
				textarea.classList.toggle('invalid', empty);
				const count = textarea.closest('.field')?.querySelector('.count');
				if (count) count.textContent = String(value.length);
			});
			saveButton.disabled = missing > 0;
			statusEl.textContent = missing ? \`\${missing} translation\${missing === 1 ? '' : 's'} missing\` : \`\${items.length} translation\${items.length === 1 ? '' : 's'} ready\`;
			vscode.setState(collect());
		}

		function save() {
			updateState();
			if (saveButton.disabled) return;
			vscode.postMessage({ command: 'save', data: collect() });
		}

		document.getElementById('cancel').addEventListener('click', () => {
			vscode.postMessage({ command: 'cancel' });
		});

		document.getElementById('reset').addEventListener('click', () => {
			document.querySelectorAll('textarea').forEach(textarea => {
				const original = items.find(item => item.language === textarea.dataset.language);
				textarea.value = original?.value || '';
			});
			updateState();
		});

		document.addEventListener('input', event => {
			if (event.target instanceof HTMLTextAreaElement) updateState();
		});

		document.addEventListener('keydown', event => {
			if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
				event.preventDefault();
				save();
			}
			if (event.key === 'Escape') {
				event.preventDefault();
				vscode.postMessage({ command: 'cancel' });
			}
		});

		render();
		const previous = vscode.getState();
		if (previous) {
			document.querySelectorAll('textarea').forEach(textarea => {
				if (Object.prototype.hasOwnProperty.call(previous, textarea.dataset.language)) {
					textarea.value = previous[textarea.dataset.language];
				}
			});
			updateState();
		}

		saveButton.addEventListener('click', save);
	</script>
</body>
</html>`;
}
