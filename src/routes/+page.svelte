<script lang="ts">
	import Workbench from '$lib/components/Workbench.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Nebula</title>
</svelte:head>

<Workbench user={data.user} />
