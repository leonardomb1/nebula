<script lang="ts">
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages';
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

<main class="relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-8">
	<!-- nebula glow -->
	<div
		class="pointer-events-none absolute -top-40 left-1/2 h-[38rem] w-[38rem] -translate-x-1/2 rounded-full opacity-25 blur-3xl"
		style="background: radial-gradient(circle, var(--nebula-primary-strong), transparent 65%)"
	></div>

	<div
		class="relative w-full max-w-sm rounded-2xl border border-edge bg-surface/80 p-8 backdrop-blur"
	>
		<div class="flex flex-col items-center gap-3">
			<img src="/favicon.svg" alt="" class="h-12 w-12" />
			<h1
				class="bg-gradient-to-r from-primary via-glow to-secondary bg-clip-text text-4xl font-bold tracking-tight text-transparent"
			>
				Nebula
			</h1>
			<p class="text-sm text-ink-muted">{m.app_tagline()}</p>
		</div>

		{#if error}
			<p
				class="mt-6 flex items-start gap-2 rounded-lg border border-err/30 bg-err/5 px-3 py-2 text-sm text-err"
			>
				<Icon name="alert" size={15} class="mt-0.5" />
				{error}
			</p>
		{:else if signedOut}
			<p class="mt-6 rounded-lg border border-edge bg-surface-2 px-3 py-2 text-center text-sm text-ink-muted">
				{m.login_signed_out()}
			</p>
		{/if}

		<a
			href={loginHref}
			class="mt-7 flex w-full items-center justify-center gap-2 rounded-lg bg-primary-strong py-2.5 font-medium text-white shadow-lg shadow-primary-strong/20 transition hover:bg-primary"
			data-sveltekit-preload-data="off"
		>
			{m.login_submit()}
			<Icon name="arrow-right" size={16} />
		</a>
	</div>
</main>
