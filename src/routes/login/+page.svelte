<script lang="ts">
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages';
	import Aurora from '$lib/components/Aurora.svelte';
	import Icon from '$lib/components/Icon.svelte';

	let error = $derived.by(() => {
		switch (page.url.searchParams.get('error')) {
			case 'interrupted':
				return m.login_interrupted();
			case 'unavailable':
				return m.login_unavailable();
			default:
				return null;
		}
	});
	let signedOut = $derived(page.url.searchParams.has('signedout'));
	let loginHref = $derived.by(() => {
		const redirectTo = page.url.searchParams.get('redirectTo');
		const target = new URL('/auth/login', page.url.origin);
		if (redirectTo) target.searchParams.set('redirectTo', redirectTo);
		// After an explicit sign-out, make the IdP actually ask again.
		if (signedOut) target.searchParams.set('force', '');
		return target.pathname + target.search;
	});
</script>

<svelte:head>
	<title>{m.login_title()}</title>
</svelte:head>

<main
	class="relative grid min-h-screen place-items-center overflow-hidden p-6"
	style="background: var(--nb-bg)"
>
	<Aurora />

	<div class="nb-glass relative w-[400px] max-w-full p-9">
		<div class="flex flex-col items-center gap-3">
			<img src="/favicon.svg" alt="" class="h-11 w-11" />
			<h1 class="text-[38px] leading-none font-extrabold tracking-tight">Nebula</h1>
			<p class="text-[12.5px] text-ink-muted">{m.app_tagline()}</p>
		</div>

		{#if error}
			<p
				class="mt-6 flex items-start gap-2 rounded-[10px] border border-err/30 px-3 py-2
				       text-[12.5px] text-err"
				style="background: var(--nb-accent-wash)"
			>
				<Icon name="alert" size={15} class="mt-px" />
				{error}
			</p>
		{:else if signedOut}
			<p
				class="mt-6 rounded-[10px] border border-line px-3 py-2 text-center text-[12.5px] text-ink-muted"
			>
				{m.login_signed_out()}
			</p>
		{/if}

		<a
			href={loginHref}
			class="mt-7 flex h-11 w-full items-center justify-center gap-2 rounded-[10px] text-[13px]
			       font-semibold transition-colors"
			style="background: var(--nb-accent); color: var(--nb-accent-ink)"
			data-sveltekit-preload-data="off"
		>
			{m.login_submit()}
			<Icon name="arrow-right" size={16} />
		</a>
	</div>
</main>
