<script lang="ts">
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages';

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

<main class="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
	<div class="flex flex-col items-center gap-2">
		<h1
			class="bg-gradient-to-r from-primary via-glow to-secondary bg-clip-text text-5xl font-bold tracking-tight text-transparent"
		>
			Nebula
		</h1>
		<p class="text-ink-muted">{m.app_tagline()}</p>
	</div>

	{#if error}
		<p class="rounded-lg border border-err/40 bg-err/10 px-4 py-2 text-sm" style="color: var(--nebula-err)">
			{error}
		</p>
	{:else if signedOut}
		<p class="rounded-lg border border-edge bg-surface px-4 py-2 text-sm text-ink-muted">
			{m.login_signed_out()}
		</p>
	{/if}

	<a
		href={loginHref}
		class="rounded-lg bg-primary-strong px-6 py-3 font-medium text-white transition hover:bg-primary"
		data-sveltekit-preload-data="off"
	>
		{m.login_submit()}
	</a>
</main>
