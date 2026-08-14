<script lang="ts" module>
	/**
	 * Inline SVG icon set (Lucide-style geometry, 24×24 grid, currentColor).
	 * One file instead of an icon dependency — the markup is a static local
	 * constant, so {@html} carries no untrusted input.
	 */
	const ICONS = {
		// chrome / navigation
		explorer:
			'<path d="M12 8c4.97 0 9-1.34 9-3s-4.03-3-9-3-9 1.34-9 3 4.03 3 9 3Z"/><path d="M21 12c0 1.66-4.03 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/>',
		pulse: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
		power: '<path d="M12 3v9"/><path d="M7.05 6.05a8 8 0 1 0 9.9 0"/>',
		user: '<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M4.5 20.5a8 8 0 0 1 15 0"/>',

		// actions
		play: '<path d="M7 4.6v14.8a1 1 0 0 0 1.53.85l11.6-7.4a1 1 0 0 0 0-1.7L8.53 3.75A1 1 0 0 0 7 4.6Z" fill="currentColor" stroke="none"/>',
		stop: '<path d="M7.5 8a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-.5.5H8a.5.5 0 0 1-.5-.5z" fill="currentColor" stroke="none"/>',
		plan: '<path d="M9.5 3h5a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5h-5a.5.5 0 0 1-.5-.5v-3a.5.5 0 0 1 .5-.5Z"/><path d="M3.5 16.5h5a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5h-5a.5.5 0 0 1-.5-.5v-3a.5.5 0 0 1 .5-.5Z"/><path d="M15.5 16.5h5a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5h-5a.5.5 0 0 1-.5-.5v-3a.5.5 0 0 1 .5-.5Z"/><path d="M12 7v6.5"/><path d="M6 16.5v-2a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v2"/>',
		zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
		download:
			'<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
		close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
		plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
		ban: '<path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"/><path d="m5.64 5.64 12.72 12.72"/>',
		search: '<path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z"/><path d="m20 20-3.5-3.5"/>',
		'arrow-right': '<path d="M4 12h15"/><path d="m13 6 6 6-6 6"/>',
		spinner: '<path d="M12 3a9 9 0 1 0 9 9"/>',

		// tree / data
		'chevron-right': '<path d="m9.5 5 7 7-7 7"/>',
		'chevron-down': '<path d="m5 9.5 7 7 7-7"/>',
		table:
			'<path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M4 10h16"/><path d="M10 10v10"/>',
		column:
			'<path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M10 4v16"/><path d="M15 4v16"/>',
		query:
			'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="m10.5 12.5-1.5 2 1.5 2"/><path d="m13.5 12.5 1.5 2-1.5 2"/>',

		// panel / feedback
		message: '<path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/>',
		alert:
			'<path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"/><path d="M12 7.5v5"/><path d="M12 16h.01"/>',
		inbox:
			'<path d="M4 13h4l2 3h4l2-3h4"/><path d="M6.5 4h11l2.5 9v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5z"/>',
		clock: '<path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"/><path d="M12 7v5l3 2"/>',
		check: '<path d="m4.5 12.5 5 5 10-11"/>',
		link: '<path d="M9 15 15 9"/><path d="M11 6.5 12.6 5a4.6 4.6 0 0 1 6.5 6.5L17.5 13"/><path d="M13 17.5 11.4 19a4.6 4.6 0 0 1-6.5-6.5L6.5 11"/>'
	} as const;

	export type IconName = keyof typeof ICONS;
	export { ICONS };
</script>

<script lang="ts">
	let {
		name,
		size = 16,
		stroke = 1.6,
		class: className = ''
	}: { name: IconName; size?: number; stroke?: number; class?: string } = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={stroke}
	stroke-linecap="round"
	stroke-linejoin="round"
	class="shrink-0 {className}"
	aria-hidden="true"
>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- static local constant -->
	{@html ICONS[name]}
</svg>
