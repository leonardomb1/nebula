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
		'editor.lineHighlightBackground': '#1a183055',
		'editor.selectionBackground': '#8b5cf655',
		'editorLineNumber.foreground': '#8f8ab3',
		'editorLineNumber.activeForeground': '#c4b5fd',
		'editorCursor.foreground': '#c4b5fd',
		'editorWidget.background': '#1a1830',
		'editorWidget.border': '#2b2749',
		'editorSuggestWidget.selectedBackground': '#8b5cf633',
		'input.background': '#12111f',
		'scrollbarSlider.background': '#2b274988',
		'scrollbarSlider.hoverBackground': '#2b2749'
	}
});

export { monaco };
