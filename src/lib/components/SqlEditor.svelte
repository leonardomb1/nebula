<script lang="ts">
	import { onMount } from 'svelte';
	import type { monaco as Monaco } from '$lib/monaco';

	let {
		value = $bindable(''),
		onRun
	}: {
		value?: string;
		/** Called with the selection when there is one, else the whole buffer. */
		onRun?: (sql: string) => void;
	} = $props();

	let container: HTMLDivElement;
	let editor: Monaco.editor.IStandaloneCodeEditor | null = null;

	onMount(() => {
		let disposed = false;

		void (async () => {
			const { monaco } = await import('$lib/monaco');
			if (disposed) return;

			editor = monaco.editor.create(container, {
				value,
				language: 'sql',
				theme: 'nebula-dark',
				automaticLayout: true,
				minimap: { enabled: true },
				fontSize: 13,
				padding: { top: 8 },
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
