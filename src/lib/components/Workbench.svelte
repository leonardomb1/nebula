<script lang="ts">
	import { onMount } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import { Workbench } from '$lib/workbench.svelte';
	import Icon from './Icon.svelte';
	import QueryFiles from './QueryFiles.svelte';
	import SqlEditor from './SqlEditor.svelte';
	import ResultsGrid from './ResultsGrid.svelte';
	import SchemaTree from './SchemaTree.svelte';
	import PlanViewer from './PlanViewer.svelte';
	import Monitor from './Monitor.svelte';

	let { user }: { user: { username: string; displayName: string } } = $props();

	const workbench = new Workbench();

	let sidebarWidth = $state(260);
	let resultsHeight = $state(280);
	let view = $state<'editor' | 'monitor'>('editor');

	/** Shared chrome button geometry — one place, so the toolbar stays even. */
	const BTN = 'flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] transition';
	const GHOST = `${BTN} text-ink-muted hover:bg-surface-2 hover:text-ink disabled:pointer-events-none disabled:opacity-35`;

	onMount(() => {
		workbench.newTab(m.tab_title());
		void workbench.loadDatabases();
		void workbench.loadFiles();
	});

	/** Ctrl/Cmd+S anywhere outside the editor — SqlEditor binds its own. */
	function onKeydown(event: KeyboardEvent): void {
		if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
			event.preventDefault();
			const tab = workbench.activeTab;
			if (tab) void workbench.saveTab(tab);
		}
	}

	/** Closing a tab with unsaved text asks first — there is no undo for it. */
	function closeTab(tab: NonNullable<typeof workbench.activeTab>): void {
		if (tab.dirty && tab.sql.trim() && !confirm(m.discard_confirm({ name: tab.title }))) return;
		workbench.closeTab(tab);
	}

	function startDrag(event: PointerEvent, axis: 'x' | 'y'): void {
		event.preventDefault();
		const startX = event.clientX;
		const startY = event.clientY;
		const fromWidth = sidebarWidth;
		const fromHeight = resultsHeight;

		const move = (e: PointerEvent) => {
			if (axis === 'x') sidebarWidth = Math.min(500, Math.max(160, fromWidth + e.clientX - startX));
			else resultsHeight = Math.min(600, Math.max(120, fromHeight - (e.clientY - startY)));
		};
		const up = () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
	}

	function statusText(tab: NonNullable<typeof workbench.activeTab>): string {
		switch (tab.run.status) {
			case 'starting':
			case 'running':
				return m.status_running();
			case 'done':
				return m.status_done({ ms: tab.run.elapsedMs ?? 0 });
			case 'cancelled':
				return m.status_cancelled();
			case 'error':
				return m.status_error();
			default:
				return m.status_ready();
		}
	}
</script>

{#snippet activityItem(icon: 'explorer' | 'pulse', label: string, target: 'editor' | 'monitor')}
	{@const active = view === target}
	<button
		class="relative flex h-10 w-12 items-center justify-center transition {active
			? 'text-ink'
			: 'text-ink-dim hover:text-ink'}"
		title={label}
		aria-label={label}
		aria-pressed={active}
		onclick={() => (view = target)}
	>
		{#if active}
			<span class="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-r bg-primary"></span>
		{/if}
		<Icon name={icon} size={19} />
	</button>
{/snippet}

<svelte:window onkeydown={onKeydown} />

<div class="flex h-screen flex-col overflow-hidden">
	<div class="flex min-h-0 flex-1">
		<!-- activity bar -->
		<aside class="chrome flex w-12 shrink-0 flex-col items-center border-r border-edge bg-surface">
			<img src="/favicon.svg" alt="" class="my-2.5 h-6 w-6" title="Nebula" />
			{@render activityItem('explorer', m.explorer(), 'editor')}
			{@render activityItem('pulse', m.monitor(), 'monitor')}
			<a
				href="/auth/logout"
				data-sveltekit-preload-data="off"
				class="mt-auto mb-2 flex h-10 w-12 items-center justify-center text-ink-dim transition hover:text-ink"
				title="{m.sign_out()} — {user.displayName}"
				aria-label={m.sign_out()}
			>
				<Icon name="power" size={18} />
			</a>
		</aside>

		{#if view === 'monitor'}
			<div class="min-w-0 flex-1 bg-bg">
				<Monitor />
			</div>
		{:else}
			<!-- sidebar -->
			<aside
				class="chrome flex shrink-0 flex-col overflow-hidden bg-surface"
				style="width: {sidebarWidth}px"
			>
				<header
					class="flex h-9 shrink-0 items-center px-4 text-[11px] font-semibold tracking-widest text-ink-muted uppercase"
				>
					{m.explorer()}
				</header>

				<QueryFiles
					files={workbench.files}
					activeFile={workbench.activeTab?.fileName ?? null}
					bind:renaming={workbench.renaming}
					onOpen={(name) => void workbench.openFile(name)}
					onNew={() => void workbench.saveTab(workbench.newTab(m.tab_title()))}
					onRename={(from, to) => void workbench.renameFile(from, to)}
					onDelete={(name) => void workbench.deleteFile(name)}
				/>

				<SchemaTree
					databases={workbench.databases}
					tablesByDb={workbench.tablesByDb}
					loadTables={(db) => void workbench.loadTables(db)}
					onInsert={(text) => {
						const tab = workbench.activeTab;
						if (tab) tab.sql += (tab.sql && !tab.sql.endsWith(' ') ? ' ' : '') + text;
					}}
				/>
			</aside>
			<div
				role="separator"
				aria-orientation="vertical"
				class="w-px shrink-0 cursor-col-resize bg-edge transition hover:bg-primary-strong"
				onpointerdown={(e) => startDrag(e, 'x')}
			></div>

			<!-- editor column -->
			<div class="flex min-w-0 flex-1 flex-col bg-bg">
				<!-- tab strip -->
				<div class="chrome flex h-9 shrink-0 items-stretch border-b border-edge bg-surface">
					<div class="flex min-w-0 flex-1 items-stretch overflow-x-auto">
						{#each workbench.tabs as tab (tab.id)}
							{@const active = tab.id === workbench.activeTabId}
							<div
								class="group relative flex shrink-0 items-center border-r border-edge-soft {active
									? 'bg-bg text-ink'
									: 'text-ink-muted hover:bg-surface-2/60 hover:text-ink'}"
							>
								{#if active}
									<span class="absolute inset-x-0 top-0 h-[2px] bg-primary"></span>
								{/if}
								<button
									class="flex max-w-52 items-center gap-2 py-1.5 pr-1 pl-3 text-[13px]"
									onclick={() => (workbench.activeTabId = tab.id)}
								>
									<Icon
										name={tab.running ? 'spinner' : 'query'}
										size={14}
										class="{tab.running ? 'animate-spin text-primary' : 'text-ink-dim'} {active &&
										!tab.running
											? 'text-secondary'
											: ''}"
									/>
									<span class="truncate">{tab.title}</span>
								</button>
								<button
									class="mr-1.5 flex h-5 w-5 items-center justify-center rounded text-ink-muted transition hover:bg-surface-3 hover:text-ink {tab.dirty ||
									active
										? ''
										: 'opacity-0 group-hover:opacity-100'}"
									onclick={() => closeTab(tab)}
									title={tab.dirty ? m.unsaved() : m.close_tab()}
									aria-label={m.close_tab()}
								>
									<!-- unsaved shows a dot until you reach for it, like VS Code -->
									<Icon
										name={tab.dirty ? 'dot' : 'close'}
										size={tab.dirty ? 11 : 13}
										class={tab.dirty ? 'text-primary group-hover:hidden' : ''}
									/>
									{#if tab.dirty}
										<Icon name="close" size={13} class="hidden group-hover:block" />
									{/if}
								</button>
							</div>
						{/each}
					</div>
					<button
						class="flex w-9 shrink-0 items-center justify-center text-ink-muted transition hover:bg-surface-2 hover:text-ink"
						onclick={() => workbench.newTab(m.tab_title())}
						title={m.new_tab()}
						aria-label={m.new_tab()}
					>
						<Icon name="plus" size={16} />
					</button>
				</div>

				{#if workbench.activeTab}
					{@const tab = workbench.activeTab}
					<!-- toolbar -->
					<div
						class="chrome flex h-9 shrink-0 items-center gap-1 border-b border-edge bg-surface px-2"
					>
						<div class="relative flex items-center">
							<Icon
								name="explorer"
								size={13}
								class="pointer-events-none absolute left-2 text-ink-dim"
							/>
							<!-- there is no "no database" choice: a query always runs somewhere -->
							<select
								class="h-7 appearance-none rounded-md border border-edge bg-surface-2 py-0 pr-6 pl-7 text-[12px] text-ink transition hover:border-primary-strong/60 disabled:opacity-50"
								bind:value={tab.database}
								disabled={workbench.databases.length === 0}
							>
								{#if workbench.databases.length === 0}
									<option value={null}>
										{workbench.databasesFailed ? m.schema_error() : m.loading()}
									</option>
								{/if}
								{#each workbench.databases as db (db)}
									<option value={db}>{db}</option>
								{/each}
							</select>
							<Icon
								name="chevron-down"
								size={12}
								class="pointer-events-none absolute right-2 text-ink-dim"
							/>
						</div>

						<span class="mx-1 h-4 w-px bg-edge"></span>

						<button
							class="{BTN} bg-primary-strong font-medium text-white shadow-sm shadow-primary-strong/20 hover:bg-primary disabled:pointer-events-none disabled:opacity-35"
							disabled={tab.running || !tab.sql.trim()}
							onclick={() => tab.execute()}
						>
							<Icon name="play" size={13} />
							{m.run()}
						</button>
						<button class={GHOST} disabled={!tab.running} onclick={() => tab.cancel()}>
							<Icon name="stop" size={13} />
							{m.cancel()}
						</button>
						<button
							class={GHOST}
							disabled={tab.plan === 'loading' || !tab.sql.trim()}
							onclick={() => tab.explain()}
						>
							<Icon name="plan" size={14} />
							{m.explain()}
						</button>

						<span class="mx-1 h-4 w-px bg-edge"></span>

						<button
							class={GHOST}
							disabled={tab.fileName ? !tab.dirty : !tab.sql.trim()}
							title="{m.save()} — Ctrl+S"
							onclick={() => void workbench.saveTab(tab)}
						>
							<Icon name="save" size={13} />
							{m.save()}
						</button>

						<button
							class="{BTN} {tab.profileEnabled
								? 'bg-surface-3 text-primary'
								: 'text-ink-muted hover:bg-surface-2 hover:text-ink'}"
							aria-pressed={tab.profileEnabled}
							onclick={() => (tab.profileEnabled = !tab.profileEnabled)}
						>
							<Icon name="zap" size={13} />
							{m.profile_toggle()}
						</button>

						<span class="ml-auto text-[11px] text-ink-dim" title={m.run_hint()}>
							<kbd class="rounded border border-edge bg-surface-2 px-1.5 py-0.5 font-sans"
								>Ctrl+Enter</kbd
							>
						</span>
					</div>

					<!-- editor -->
					<div class="min-h-0 flex-1">
						<SqlEditor
							bind:value={tab.sql}
							onRun={(sql) => tab.execute(sql)}
							onSave={() => void workbench.saveTab(tab)}
							completions={() => ({
								databases: workbench.databases,
								database: workbench.activeTab?.database ?? null,
								tables: (db) => {
									const cached = workbench.tablesByDb[db];
									return Array.isArray(cached) ? cached : null;
								},
								ensure: (db) => void workbench.loadTables(db)
							})}
						/>
					</div>

					<!-- results panel -->
					<div
						role="separator"
						aria-orientation="horizontal"
						class="h-px shrink-0 cursor-row-resize bg-edge transition hover:bg-primary-strong"
						onpointerdown={(e) => startDrag(e, 'y')}
					></div>
					<div class="flex shrink-0 flex-col bg-bg" style="height: {resultsHeight}px">
						<div
							class="chrome flex h-9 shrink-0 items-center gap-0.5 border-b border-edge bg-surface px-1.5"
						>
							{#snippet panelTab(
								selected: boolean,
								icon: 'table' | 'plan' | 'message',
								label: string,
								badge: string | null,
								badgeClass: string,
								select: () => void
							)}
								<button
									class="flex h-9 items-center gap-1.5 border-b-2 px-2.5 text-[11px] font-medium tracking-wide uppercase transition {selected
										? 'border-primary text-ink'
										: 'border-transparent text-ink-muted hover:text-ink'}"
									onclick={select}
								>
									<Icon name={icon} size={13} class={selected ? 'text-primary' : 'text-ink-dim'} />
									{label}
									{#if badge}
										<span
											class="rounded-full bg-surface-2 px-1.5 py-px text-[10px] tracking-normal normal-case {badgeClass}"
											>{badge}</span
										>
									{/if}
								</button>
							{/snippet}

							{#each tab.run.resultsets as set, i (i)}
								{@render panelTab(
									tab.activeResult === i,
									'table',
									`${m.results()}${tab.run.resultsets.length > 1 ? ` ${i + 1}` : ''}`,
									(set.finished && set.columns.length === 0
										? m.affected_rows({ n: set.affectedRows ?? 0 })
										: m.row_count({ n: set.rowCount })) + (set.truncated ? '+' : ''),
									'text-ink-muted',
									() => (tab.activeResult = i)
								)}
							{/each}
							{#if tab.plan}
								{@render panelTab(
									tab.activeResult === -2,
									'plan',
									m.plan_tab(),
									null,
									'',
									() => (tab.activeResult = -2)
								)}
							{/if}
							{@render panelTab(
								tab.activeResult === -1,
								'message',
								m.messages_tab(),
								tab.run.errors.length ? String(tab.run.errors.length) : null,
								'bg-err/15 text-err',
								() => (tab.activeResult = -1)
							)}

							{#if tab.activeResult >= 0 && tab.run.resultsets[tab.activeResult]?.finished}
								{@const activeSet = tab.run.resultsets[tab.activeResult]}
								<span class="ml-auto flex items-center gap-1">
									{#if activeSet.columns.length > 0 && tab.run.id}
										{#each ['csv', 'xlsx'] as format (format)}
											<a
												class="{GHOST} h-6"
												href="/api/query/{tab.run.id}/export?statement={tab.activeResult}&format={format}"
												download
											>
												<Icon name="download" size={12} />
												{format.toUpperCase()}
											</a>
										{/each}
									{/if}
									{#if activeSet.queryId}
										<button class="{GHOST} h-6" onclick={() => tab.loadProfile(activeSet.queryId!)}>
											<Icon name="zap" size={12} />
											{m.view_profile()}
										</button>
									{/if}
								</span>
							{/if}
						</div>

						<div class="min-h-0 flex-1">
							{#snippet emptyState(icon: 'inbox' | 'message' | 'table', text: string)}
								<div
									class="flex h-full flex-col items-center justify-center gap-2 text-ink-dim select-none"
								>
									<Icon name={icon} size={28} stroke={1.2} />
									<p class="text-[12px]">{text}</p>
								</div>
							{/snippet}

							{#if tab.activeResult >= 0 && tab.run.resultsets[tab.activeResult]}
								{@const set = tab.run.resultsets[tab.activeResult]}
								{#if set.columns.length > 0}
									<ResultsGrid resultset={set} />
								{:else}
									{@render emptyState('table', m.affected_rows({ n: set.affectedRows ?? 0 }))}
								{/if}
							{:else if tab.activeResult === -2}
								{#if tab.plan === 'loading'}
									<div class="flex h-full items-center justify-center gap-2 text-ink-dim">
										<Icon name="spinner" size={16} class="animate-spin" />
										<span class="text-[12px]">{m.loading()}</span>
									</div>
								{:else if tab.plan && typeof tab.plan === 'object' && 'error' in tab.plan}
									<div class="h-full overflow-auto p-3">
										<p
											class="flex items-start gap-2 rounded-md border border-err/30 bg-err/5 p-3 font-mono text-xs text-err"
										>
											<Icon name="alert" size={14} class="mt-px" />
											{tab.plan.error}
										</p>
									</div>
								{:else if tab.plan && typeof tab.plan === 'object'}
									<PlanViewer
										nodes={tab.plan.nodes}
										edges={tab.plan.edges}
										summary={tab.plan.summary ?? null}
									/>
								{/if}
							{:else if tab.activeResult === -1}
								{#if tab.run.errors.length === 0}
									{@render emptyState('message', m.no_messages())}
								{:else}
									<div class="h-full space-y-2 overflow-auto p-3">
										{#each tab.run.errors as errorText, i (i)}
											<p
												class="flex items-start gap-2 rounded-md border border-err/30 bg-err/5 p-2.5 font-mono text-xs text-err"
											>
												<Icon name="alert" size={14} class="mt-px" />
												{errorText}
											</p>
										{/each}
										{#if tab.run.needsLogin}
											<a
												href="/auth/login"
												class="inline-flex items-center gap-1.5 text-xs text-secondary hover:underline"
											>
												<Icon name="link" size={13} />
												{m.sign_in_again()}
											</a>
										{/if}
									</div>
								{/if}
							{:else}
								{@render emptyState('inbox', m.no_results_yet())}
							{/if}
						</div>
					</div>

					<!-- status bar -->
					<div
						class="chrome flex h-[24px] shrink-0 items-center gap-3 border-t border-edge bg-surface px-3 text-[11px] text-ink-muted"
					>
						<span
							class="flex items-center gap-1.5 {tab.run.status === 'error'
								? 'text-err'
								: tab.running
									? 'text-glow'
									: ''}"
						>
							<Icon
								name={tab.running ? 'spinner' : tab.run.status === 'error' ? 'alert' : 'check'}
								size={12}
								class={tab.running ? 'animate-spin' : ''}
							/>
							{statusText(tab)}
						</span>
						{#if tab.database}
							<span class="flex items-center gap-1.5">
								<Icon name="explorer" size={12} />
								{tab.database}
							</span>
						{/if}
						<span class="ml-auto flex items-center gap-1.5">
							<Icon name="user" size={12} />
							{user.displayName}
						</span>
					</div>
				{:else}
					<div class="flex flex-1 flex-col items-center justify-center gap-3 text-ink-dim">
						<img src="/favicon.svg" alt="" class="h-10 w-10 opacity-60" />
						<button
							class="{GHOST} border border-edge"
							onclick={() => workbench.newTab(m.tab_title())}
						>
							<Icon name="plus" size={14} />
							{m.new_tab()}
						</button>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>
