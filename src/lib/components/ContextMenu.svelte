<script lang="ts" module>
	import type { IconName } from './Icon.svelte';

	export interface MenuItem {
		label: string;
		icon: IconName;
		action: () => void;
	}
</script>

<script lang="ts">
	import Icon from './Icon.svelte';

	let {
		x,
		y,
		items,
		onclose
	}: { x: number; y: number; items: MenuItem[]; onclose: () => void } = $props();

	let menu = $state<HTMLDivElement | null>(null);

	/** Flip back inside the viewport when opened near an edge. */
	let left = $derived(menu ? Math.min(x, window.innerWidth - menu.offsetWidth - 8) : x);
	let top = $derived(menu ? Math.min(y, window.innerHeight - menu.offsetHeight - 8) : y);
</script>

<svelte:window
	onpointerdown={(e) => {
		if (menu && !menu.contains(e.target as Node)) onclose();
	}}
	onkeydown={(e) => e.key === 'Escape' && onclose()}
	onblur={onclose}
/>

<div
	bind:this={menu}
	role="menu"
	tabindex="-1"
	class="fixed z-50 min-w-44 rounded-md border border-edge bg-surface-2 py-1 shadow-xl shadow-black/40"
	style="left: {left}px; top: {top}px"
>
	{#each items as item (item.label)}
		<button
			role="menuitem"
			class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-ink-muted hover:bg-surface-3 hover:text-ink"
			onclick={() => {
				item.action();
				onclose();
			}}
		>
			<Icon name={item.icon} size={13} class="text-ink-dim" />
			{item.label}
		</button>
	{/each}
</div>
