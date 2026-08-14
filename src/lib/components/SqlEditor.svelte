<script lang="ts">
	import { onMount } from 'svelte';
	import type { monaco as Monaco, SchemaCompletionContext } from '$lib/monaco';

	let {
		value = $bindable(''),
		onRun,
		onSave,
		completions
	}: {
		value?: string;
		/** Called with the selection when there is one, else the whole buffer. */
		onRun?: (sql: string) => void;
		/** Ctrl/Cmd+S — bound inside Monaco so it fires while typing. */
		onSave?: () => void;
		/** Live schema context for autocomplete. */
		completions?: () => SchemaCompletionContext;
	} = $props();

	let container: HTMLDivElement;
	let editor: Monaco.editor.IStandaloneCodeEditor | null = null;

	onMount(() => {
		let disposed = false;

		void (async () => {
			const { monaco, setCompletionContext } = await import('$lib/monaco');
			if (disposed) return;
			if (completions) setCompletionContext(completions);

			editor = monaco.editor.create(container, {
				value,
				language: 'sql',
				theme: 'nebula-dark',
				automaticLayout: true,
				minimap: { enabled: true, renderCharacters: false, maxColumn: 80 },
				fontSize: 13,
				lineHeight: 20,
				fontFamily:
					"ui-monospace, 'JetBrains Mono', 'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace",
				fontLigatures: true,
				padding: { top: 10, bottom: 10 },
				lineNumbersMinChars: 3,
				renderLineHighlight: 'all',
				roundedSelection: false,
				cursorBlinking: 'smooth',
				cursorSmoothCaretAnimation: 'on',
				smoothScrolling: true,
				guides: { indentation: true, bracketPairs: true },
				scrollbar: { verticalScrollbarSize: 11, horizontalScrollbarSize: 11 },
				overviewRulerBorder: false,
				scrollBeyondLastLine: false,
				fixedOverflowWidgets: true
			});

			editor.onDidChangeModelContent(() => {
				value = editor!.getValue();
			});

			editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
				const selection = editor!.getSelection();
				const model = editor!.getModel();
				const selected =
					selection && !selection.isEmpty() ? model?.getValueInRange(selection) : null;
				onRun?.(selected?.trim() || editor!.getValue());
			});

			editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => onSave?.());
		})();

		return () => {
			disposed = true;
			editor?.dispose();
		};
	});

	// External updates (tab switch) — guarded so typing doesn't loop.
	$effect(() => {
		if (editor && value !== editor.getValue()) editor.setValue(value);
	});
</script>

<div bind:this={container} class="h-full w-full"></div>
