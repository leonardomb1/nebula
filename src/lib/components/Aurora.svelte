<script lang="ts">
	/**
	 * The aurora ground: three oversized, heavily blurred blooms behind the
	 * glass panels. Purely decorative — hues, weights and the blur budget come
	 * from the theme tokens so light and dark each get their own atmosphere.
	 */
</script>

<div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
	<div
		class="absolute rounded-full"
		style="left:-10vw;top:-24vh;width:min(62vw,860px);height:min(72vh,700px);
		       background:var(--nb-bloom-a);opacity:var(--nb-bloom-a-o);filter:blur(96px)"
	></div>
	<div
		class="absolute rounded-full"
		style="right:-8vw;top:-16vh;width:min(52vw,720px);height:min(58vh,560px);
		       background:var(--nb-bloom-b);opacity:var(--nb-bloom-b-o);filter:blur(104px)"
	></div>
	<div
		class="absolute rounded-full"
		style="left:38%;bottom:-32vh;width:min(70vw,960px);height:min(66vh,640px);
		       background:var(--nb-bloom-c);opacity:var(--nb-bloom-c-o);filter:blur(110px)"
	></div>
</div>
