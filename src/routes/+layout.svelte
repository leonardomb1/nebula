<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { initSettings, THEME_BOOTSTRAP } from '$lib/settings.svelte';

	let { children } = $props();

	// Split so the closing tag never appears literally in this module.
	const themeBootstrap = `<script>${THEME_BOOTSTRAP}<` + `/script>`;

	onMount(() => initSettings());
</script>

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		rel="stylesheet"
		href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
	/>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- static, authored above -->
	{@html themeBootstrap}
</svelte:head>

{@render children()}
