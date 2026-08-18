<script lang="ts">
	import { onMount } from 'svelte';
	import { settings, theme } from '$lib/settings.svelte';
	import type { monaco as Monaco, SchemaCompletionContext } from '$lib/monaco';

	let {
		value = $bindable(''),
		onRun,
		completions
	}: {
		value?: string;
		/** Called with the selection when there is one, else the whole buffer. */
		onRun?: (sql: string) => void;
		/** Live schema context for autocomplete. */
		completions?: () => SchemaCompletionContext;
	} = $props();

	let container: HTMLDivElement;
	let editor = $state<Monaco.editor.IStandaloneCodeEditor | null>(null);
	let api = $state<typeof Monaco | null>(null);
	let pickTheme = $state<((resolved: 'light' | 'dark') => string) | null>(null);

	onMount(() => {
		let disposed = false;

		void (async () => {
			const { monaco, setCompletionContext, editorTheme } = await import('$lib/monaco');
			if (disposed) return;
			if (completions) setCompletionContext(completions);

			editor = monaco.editor.create(container, {
				value,
				language: 'sql',
				theme: editorTheme(theme.resolved),
				automaticLayout: true,
				minimap: { enabled: settings.minimap },
				fontSize: settings.editorFontSize,
				fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
				lineHeight: 1.7,
				padding: { top: 12, bottom: 12 },
				renderLineHighlight: 'line',
				scrollBeyondLastLine: false,
				fixedOverflowWidgets: true
			});
			api = monaco;
			pickTheme = editorTheme;

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

	// Preferences are live: the editor re-reads them rather than being rebuilt.
	$effect(() => {
		editor?.updateOptions({
			fontSize: settings.editorFontSize,
			minimap: { enabled: settings.minimap }
		});
	});

	$effect(() => {
		if (api && pickTheme) api.editor.setTheme(pickTheme(theme.resolved));
	});
</script>

<div bind:this={container} class="h-full w-full"></div>
