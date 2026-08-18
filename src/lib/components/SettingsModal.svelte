<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import {
		ROW_LIMITS,
		previewTheme,
		settings,
		updateSettings,
		type NebulaSettings,
		type ThemeChoice
	} from '$lib/settings.svelte';

	let {
		user,
		onClose
	}: { user: { username: string; displayName: string }; onClose: () => void } = $props();

	type SectionId = 'profile' | 'appearance' | 'editor' | 'shortcuts';

	const sections: { id: SectionId; icon: string; label: () => string }[] = [
		{ id: 'profile', icon: '◍', label: () => m.settings_profile() },
		{ id: 'appearance', icon: '◐', label: () => m.settings_appearance() },
		{ id: 'editor', icon: '▤', label: () => m.settings_editor() },
		{ id: 'shortcuts', icon: '⌘', label: () => m.settings_shortcuts() }
	];

	const shortcuts: { keys: string; label: () => string }[] = [
		{ keys: '⌃⏎ / ⌘⏎', label: () => m.shortcut_run() },
		{ keys: '⌃K / ⌘K', label: () => m.shortcut_search() },
		{ keys: '⌃⇧⏎ / ⌘⇧⏎', label: () => m.shortcut_explain() },
		{ keys: '⎋', label: () => m.shortcut_dismiss() },
		{ keys: m.shortcut_dblclick(), label: () => m.shortcut_insert() }
	];

	let section = $state<SectionId>('profile');
	// Staged: the dialog edits a copy so Cancelar really cancels. The theme is
	// the exception — it previews live, and the preview is rolled back below.
	let draft = $state<NebulaSettings>({ ...settings });

	const initials = (name: string) =>
		name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() ?? '')
			.join('') || '?';

	let shownName = $derived(draft.displayName.trim() || user.displayName);

	function pickTheme(choice: ThemeChoice): void {
		draft.theme = choice;
		previewTheme(choice);
	}

	function cancel(): void {
		previewTheme(settings.theme);
		onClose();
	}

	function save(): void {
		updateSettings({ ...draft, displayName: draft.displayName.trim() });
		onClose();
	}
</script>

<svelte:window onkeydown={(event) => event.key === 'Escape' && cancel()} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
	class="nb-anim-fade fixed inset-0 z-40 grid place-items-center p-4 backdrop-blur-[4px]"
	style="background: var(--nb-scrim)"
	onclick={cancel}
>
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		tabindex="-1"
		class="nb-anim-modal flex h-[452px] max-h-[calc(100vh-2rem)] w-[760px] max-w-full
		       overflow-hidden rounded-2xl border border-line backdrop-blur-[30px]"
		style="background: var(--nb-modal); box-shadow: var(--nb-shadow)"
		role="dialog"
		aria-modal="true"
		aria-label={m.settings()}
		onclick={(event) => event.stopPropagation()}
	>
		<!-- section rail -->
		<nav
			class="flex w-[214px] shrink-0 flex-col gap-0.5 border-r border-line-soft px-[9px] py-4"
			style="background: color-mix(in srgb, var(--nb-ink) 4%, transparent)"
		>
			<p class="px-[9px] pb-3 text-[10px] font-medium tracking-[0.12em] text-ink-muted uppercase">
				{m.settings()}
			</p>
			{#each sections as item (item.id)}
				<button
					class="flex h-8 items-center gap-[9px] rounded-[10px] px-2.5 text-left text-[12.5px]
					       transition-colors hover:bg-hover
					       {section === item.id ? 'bg-active font-semibold text-ink' : 'text-ink-muted'}"
					onclick={() => (section = item.id)}
				>
					<span class="w-3.5 text-xs text-ink-faint">{item.icon}</span>{item.label()}
				</button>
			{/each}
			<a
				href="/auth/logout"
				data-sveltekit-preload-data="off"
				class="mt-auto flex h-8 items-center gap-[9px] rounded-[10px] px-2.5 text-[12.5px]
				       text-accent-soft transition-colors hover:bg-accent-wash"
			>
				<span class="w-3.5 text-xs">→</span>{m.sign_out()}
			</a>
		</nav>

		<!-- pane -->
		<div class="flex min-w-0 flex-1 flex-col">
			<header class="flex items-center border-b border-line-soft px-[18px] pt-4 pb-3">
				<h2 class="text-[17px] font-extrabold">
					{sections.find((s) => s.id === section)?.label()}
				</h2>
				<button
					class="ml-auto grid h-7 w-7 place-items-center rounded-[9px] text-xs text-ink-muted
					       transition-colors hover:bg-hover"
					onclick={cancel}
					aria-label={m.close()}>✕</button
				>
			</header>

			<div class="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto px-[18px] py-4 text-[12.5px]">
				{#snippet row(label: string)}
					<div class="w-[150px] shrink-0 text-[12.5px] text-ink-muted">{label}</div>
				{/snippet}

				{#if section === 'profile'}
					<div class="flex items-center gap-3">
						<div
							class="grid h-11 w-11 place-items-center rounded-full bg-active text-[15px] font-semibold"
						>
							{initials(shownName)}
						</div>
						<div class="min-w-0">
							<div class="truncate text-[13.5px] font-semibold">{shownName}</div>
							<div class="mt-0.5 font-mono text-[11.5px] text-ink-muted">
								{user.username} · SSO
							</div>
						</div>
					</div>
					<div class="h-px bg-line-soft"></div>
					<label class="flex items-center gap-3.5">
						{@render row(m.settings_display_name())}
						<input
							class="h-[34px] flex-1 rounded-[10px] border border-line bg-glass px-[11px]
							       text-[12.5px] outline-none focus:border-accent"
							bind:value={draft.displayName}
							placeholder={user.displayName}
						/>
					</label>
					<p class="text-[11.5px] leading-relaxed text-ink-muted">
						{m.settings_display_name_hint()}
					</p>
				{:else if section === 'appearance'}
					<div class="flex items-center gap-3.5">
						{@render row(m.settings_theme())}
						<div class="flex overflow-hidden rounded-[11px] border border-line">
							{#each [['light', m.theme_light()], ['dark', m.theme_dark()], ['system', m.theme_system()]] as const as [value, label] (value)}
								<button
									class="h-8 px-[15px] text-xs transition-colors
									       {draft.theme === value
										? 'bg-active font-semibold text-ink'
										: 'text-ink-muted hover:bg-hover'}"
									onclick={() => pickTheme(value)}>{label}</button
								>
							{/each}
						</div>
					</div>
					<div class="flex items-center gap-3.5">
						{@render row(m.settings_density())}
						<div class="flex flex-1 items-center gap-3">
							<input
								type="range"
								min="24"
								max="40"
								step="2"
								class="max-w-[220px] flex-1 accent-[var(--nb-accent)]"
								bind:value={draft.rowHeight}
							/>
							<span class="font-mono text-[11.5px] text-ink-muted">{draft.rowHeight}px</span>
						</div>
					</div>
				{:else if section === 'editor'}
					<div class="flex items-center gap-3.5">
						{@render row(m.settings_row_limit())}
						<select
							class="h-[34px] flex-1 rounded-[10px] border border-line bg-glass px-[11px]
							       font-mono text-[12.5px] outline-none focus:border-accent"
							bind:value={draft.rowLimit}
						>
							{#each ROW_LIMITS as limit (limit)}
								<option value={limit}>{limit.toLocaleString()}</option>
							{/each}
						</select>
					</div>
					<div class="flex items-center gap-3.5">
						{@render row(m.settings_font_size())}
						<div class="flex flex-1 items-center gap-3">
							<input
								type="range"
								min="11"
								max="20"
								step="1"
								class="max-w-[220px] flex-1 accent-[var(--nb-accent)]"
								bind:value={draft.editorFontSize}
							/>
							<span class="font-mono text-[11.5px] text-ink-muted">{draft.editorFontSize}px</span>
						</div>
					</div>
					<div class="flex items-start gap-3.5">
						{@render row(m.settings_on_run())}
						<div class="flex flex-col gap-[9px]">
							<label class="flex items-center gap-[9px] text-[12.5px]">
								<input type="checkbox" class="sr-only" bind:checked={draft.profileOnRun} />
								<span
									class="grid h-[15px] w-[15px] shrink-0 place-items-center rounded-[5px] text-[9px]
									       {draft.profileOnRun
										? 'bg-accent text-accent-ink'
										: 'border border-line'}">{draft.profileOnRun ? '✓' : ''}</span
								>
								<span class={draft.profileOnRun ? '' : 'text-ink-muted'}>
									{m.settings_profile_on_run()}
								</span>
							</label>
							<label class="flex items-center gap-[9px] text-[12.5px]">
								<input type="checkbox" class="sr-only" bind:checked={draft.planFirst} />
								<span
									class="grid h-[15px] w-[15px] shrink-0 place-items-center rounded-[5px] text-[9px]
									       {draft.planFirst ? 'bg-accent text-accent-ink' : 'border border-line'}"
									>{draft.planFirst ? '✓' : ''}</span
								>
								<span class={draft.planFirst ? '' : 'text-ink-muted'}>
									{m.settings_plan_first()}
								</span>
							</label>
							<label class="flex items-center gap-[9px] text-[12.5px]">
								<input type="checkbox" class="sr-only" bind:checked={draft.minimap} />
								<span
									class="grid h-[15px] w-[15px] shrink-0 place-items-center rounded-[5px] text-[9px]
									       {draft.minimap ? 'bg-accent text-accent-ink' : 'border border-line'}"
									>{draft.minimap ? '✓' : ''}</span
								>
								<span class={draft.minimap ? '' : 'text-ink-muted'}>{m.settings_minimap()}</span>
							</label>
						</div>
					</div>
				{:else}
					<ul class="flex flex-col">
						{#each shortcuts as shortcut (shortcut.keys)}
							<li class="flex items-baseline justify-between gap-4 border-b border-line-faint py-2">
								<span class="text-[12.5px]">{shortcut.label()}</span>
								<span
									class="shrink-0 rounded-lg border border-line px-2 py-0.5 font-mono text-[10.5px]
									       text-ink-muted">{shortcut.keys}</span
								>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			<footer class="flex items-center gap-[9px] border-t border-line-soft px-[18px] py-3">
				<button
					class="ml-auto flex h-8 items-center rounded-[10px] px-3.5 text-xs text-ink-muted
					       transition-colors hover:bg-hover"
					onclick={cancel}>{m.cancel()}</button
				>
				<button
					class="flex h-8 items-center rounded-[10px] bg-accent px-4 text-xs font-semibold
					       text-accent-ink transition-colors hover:bg-accent-hover"
					onclick={save}>{m.save()}</button
				>
			</footer>
		</div>
	</div>
</div>
