/**
 * Client-only Monaco setup — import this module dynamically from onMount.
 * One worker (the editor core) is enough: SQL has no language service worker.
 */
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';

self.MonacoEnvironment = {
	getWorker: () => new EditorWorker()
};

/** The Nebula theme, mapped from the design tokens in app.css. */
monaco.editor.defineTheme('nebula-dark', {
	base: 'vs-dark',
	inherit: true,
	rules: [
		{ token: 'keyword.sql', foreground: 'a78bfa', fontStyle: 'bold' },
		{ token: 'string.sql', foreground: '7dd3a7' },
		{ token: 'number.sql', foreground: 'fbbf24' },
		{ token: 'comment', foreground: '8f8ab3', fontStyle: 'italic' },
		{ token: 'operator.sql', foreground: '60a5fa' },
		{ token: 'predefined.sql', foreground: '60a5fa' }
	],
	colors: {
		'editor.background': '#12111f',
		'editor.foreground': '#e4e2f4',
		'editor.lineHighlightBackground': '#1a183066',
		'editor.lineHighlightBorder': '#00000000',
		'editor.selectionBackground': '#8b5cf655',
		'editor.selectionHighlightBackground': '#8b5cf626',
		'editor.wordHighlightBackground': '#8b5cf626',
		'editorIndentGuide.background1': '#241f3d',
		'editorIndentGuide.activeBackground1': '#3a3563',
		'editorLineNumber.foreground': '#6a6590',
		'editorLineNumber.activeForeground': '#c4b5fd',
		'editorCursor.foreground': '#c4b5fd',
		'editorGutter.background': '#12111f',
		'editorWidget.background': '#1a1830',
		'editorWidget.border': '#262242',
		'editorHoverWidget.background': '#1a1830',
		'editorHoverWidget.border': '#262242',
		'editorSuggestWidget.background': '#1a1830',
		'editorSuggestWidget.border': '#262242',
		'editorSuggestWidget.selectedBackground': '#8b5cf633',
		'editorSuggestWidget.highlightForeground': '#c4b5fd',
		'editorOverviewRuler.border': '#00000000',
		'minimap.background': '#12111f',
		'input.background': '#0d0c17',
		'input.border': '#262242',
		'focusBorder': '#8b5cf6',
		'scrollbarSlider.background': '#23204399',
		'scrollbarSlider.hoverBackground': '#35305e',
		'scrollbarSlider.activeBackground': '#3a3563',
		'editorWhitespace.foreground': '#241f3d'
	}
});

// ---------------------------------------------------------------------------
// Schema-aware SQL completions. The provider is language-global in Monaco, so
// it registers once and reads a swappable context (current database + cached
// schema) supplied by the workbench.
// ---------------------------------------------------------------------------

export interface TableInfo {
	name: string;
	columns: { name: string; type: string }[];
}

export interface SchemaCompletionContext {
	databases: string[];
	database: string | null;
	/** Cached tables for a database, or null when not fetched yet. */
	tables(db: string): TableInfo[] | null;
	/** Kicks off a fetch for a database's tables (idempotent). */
	ensure(db: string): void;
}

let completionContext: (() => SchemaCompletionContext) | null = null;
let registered = false;

export function setCompletionContext(context: () => SchemaCompletionContext): void {
	completionContext = context;
	if (registered) return;
	registered = true;
	monaco.languages.registerCompletionItemProvider('sql', provider);
}

const KEYWORDS = (
	'SELECT FROM WHERE GROUP BY ORDER HAVING LIMIT OFFSET JOIN INNER LEFT RIGHT FULL OUTER CROSS ON AS ' +
	'AND OR NOT IN EXISTS BETWEEN LIKE IS NULL CASE WHEN THEN ELSE END UNION ALL DISTINCT WITH ' +
	'INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE VIEW MATERIALIZED DROP ALTER TRUNCATE ' +
	'DESC DESCRIBE SHOW USE EXPLAIN VERBOSE COSTS LOGICAL ANALYZE PROFILE PARTITION OVER WINDOW ' +
	'CAST CONVERT COUNT SUM MIN MAX AVG ARRAY_AGG GROUP_CONCAT COALESCE IFNULL NULLIF ' +
	'CURRENT_DATE CURRENT_TIMESTAMP INTERVAL ASC KILL QUERY CONNECTION'
).split(' ');

const provider: import('monaco-editor').languages.CompletionItemProvider = {
	triggerCharacters: ['.'],
	provideCompletionItems(model, position) {
		const context = completionContext?.();
		const word = model.getWordUntilPosition(position);
		const range = new monaco.Range(
			position.lineNumber,
			word.startColumn,
			position.lineNumber,
			word.endColumn
		);
		const suggestions: import('monaco-editor').languages.CompletionItem[] = [];
		const line = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
		const qualifier = /[`]?([A-Za-z0-9_]+)[`]?\.\s*[A-Za-z0-9_]*$/.exec(line)?.[1];

		if (qualifier && context) {
			let incomplete = false;

			// database. → its tables
			if (context.databases.includes(qualifier)) {
				const tables = context.tables(qualifier);
				if (!tables) {
					context.ensure(qualifier);
					incomplete = true;
				}
				for (const table of tables ?? []) {
					suggestions.push({
						label: table.name,
						kind: monaco.languages.CompletionItemKind.Class,
						insertText: table.name,
						detail: qualifier,
						range
					});
				}
			}

			// table. → its columns (searched across every cached database)
			for (const db of context.databases) {
				const table = context.tables(db)?.find((t) => t.name === qualifier);
				for (const column of table?.columns ?? []) {
					suggestions.push({
						label: column.name,
						kind: monaco.languages.CompletionItemKind.Field,
						insertText: column.name,
						detail: column.type,
						range
					});
				}
			}
			return { suggestions, incomplete };
		}

		for (const keyword of KEYWORDS) {
			suggestions.push({
				label: keyword,
				kind: monaco.languages.CompletionItemKind.Keyword,
				insertText: keyword,
				range
			});
		}
		if (context) {
			for (const db of context.databases) {
				suggestions.push({
					label: db,
					kind: monaco.languages.CompletionItemKind.Module,
					insertText: db,
					range
				});
			}
			if (context.database) {
				const tables = context.tables(context.database);
				if (!tables) context.ensure(context.database);
				for (const table of tables ?? []) {
					suggestions.push({
						label: table.name,
						kind: monaco.languages.CompletionItemKind.Class,
						insertText: table.name,
						detail: context.database,
						range
					});
					for (const column of table.columns) {
						suggestions.push({
							label: column.name,
							kind: monaco.languages.CompletionItemKind.Field,
							insertText: column.name,
							detail: `${table.name} · ${column.type}`,
							range
						});
					}
				}
			}
		}
		return { suggestions };
	}
};

export { monaco };
