/**
 * Client-only Monaco setup — import this module dynamically from onMount.
 * One worker (the editor core) is enough: SQL has no language service worker.
 */
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';

self.MonacoEnvironment = {
	getWorker: () => new EditorWorker()
};

/**
 * The two Aurora editor themes, mapped from the design tokens in app.css.
 *
 * Both grounds are fully transparent so the glass panel — and the aurora
 * blooms behind it — show through the code, which is the whole point of the
 * design. Roles are consistent across themes: keywords carry the accent,
 * numbers run warm, strings run green.
 */
function auroraTheme(
	base: 'vs' | 'vs-dark',
	c: {
		keyword: string;
		string: string;
		number: string;
		comment: string;
		operator: string;
		ink: string;
		muted: string;
		faint: string;
		accent: string;
		widget: string;
		border: string;
	}
): monaco.editor.IStandaloneThemeData {
	return {
		base,
		inherit: true,
		rules: [
			{ token: 'keyword.sql', foreground: c.keyword, fontStyle: 'bold' },
			{ token: 'operator.sql', foreground: c.operator },
			{ token: 'predefined.sql', foreground: c.keyword },
			{ token: 'string.sql', foreground: c.string },
			{ token: 'number.sql', foreground: c.number },
			{ token: 'comment', foreground: c.comment, fontStyle: 'italic' }
		],
		colors: {
			// Transparent ground and gutter: the glass panel and the aurora behind
			// it are meant to show through the code.
			'editor.background': '#00000000',
			'editorGutter.background': '#00000000',
			'minimap.background': '#00000000',
			'editor.foreground': c.ink,
			'editor.lineHighlightBackground': c.accent + '14',
			'editor.lineHighlightBorder': '#00000000',
			'editor.selectionBackground': c.accent + '3d',
			'editor.selectionHighlightBackground': c.accent + '1f',
			'editor.wordHighlightBackground': c.accent + '1f',
			'editorLineNumber.foreground': c.faint,
			'editorLineNumber.activeForeground': c.muted,
			'editorCursor.foreground': c.accent,
			'editorIndentGuide.background1': c.border,
			'editorIndentGuide.activeBackground1': c.faint,
			'editorWhitespace.foreground': c.border,
			'editorWidget.background': c.widget,
			'editorWidget.border': c.border,
			'editorSuggestWidget.background': c.widget,
			'editorSuggestWidget.border': c.border,
			'editorSuggestWidget.selectedBackground': c.accent + '33',
			'editorSuggestWidget.highlightForeground': c.accent,
			'editorHoverWidget.background': c.widget,
			'editorHoverWidget.border': c.border,
			'editorOverviewRuler.border': '#00000000',
			'input.background': c.widget,
			'input.border': c.border,
			focusBorder: c.accent,
			'scrollbarSlider.background': c.border,
			'scrollbarSlider.hoverBackground': c.faint,
			'scrollbarSlider.activeBackground': c.muted
		}
	};
}

monaco.editor.defineTheme(
	'aurora-dark',
	auroraTheme('vs-dark', {
		keyword: 'ff9783',
		string: '9ec9a8',
		number: 'ffd7a1',
		comment: 'bda8a2',
		operator: 'c8b6b1',
		ink: 'f4eeec',
		muted: 'c8b6b1',
		faint: '8b7671',
		accent: 'ff563c',
		widget: '#1a1211',
		border: '#ffffff1f'
	})
);

monaco.editor.defineTheme(
	'aurora-light',
	auroraTheme('vs', {
		keyword: 'ae1800',
		string: '1f6b52',
		number: '9a6212',
		comment: '8a8480',
		operator: '6d6866',
		ink: '201e1d',
		muted: '6d6866',
		faint: '9c9694',
		accent: 'ec3013',
		widget: '#fffdfc',
		border: '#201e1d1f'
	})
);

/** Picks the editor theme that matches the resolved app theme. */
export function editorTheme(resolved: 'light' | 'dark'): string {
	return resolved === 'light' ? 'aurora-light' : 'aurora-dark';
}

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
