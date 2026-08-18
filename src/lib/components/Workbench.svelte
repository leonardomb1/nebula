<script lang="ts">
	import { onMount } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import { settings } from '$lib/settings.svelte';
	import { Workbench } from '$lib/workbench.svelte';
	import Aurora from './Aurora.svelte';
	import Icon from './Icon.svelte';
	import CommandPalette from './CommandPalette.svelte';
	import QueryFiles from './QueryFiles.svelte';
	import SqlEditor from './SqlEditor.svelte';
	import ResultsGrid from './ResultsGrid.svelte';
	import SchemaTree from './SchemaTree.svelte';
	import SettingsModal from './SettingsModal.svelte';
	import PlanViewer from './PlanViewer.svelte';
	import Monitor from './Monitor.svelte';

	let { user }: { user: { username: string; displayName: string } } = $props();

	const workbench = new Workbench();

	let sidebarWidth = $state(238);
	let resultsHeight = $state(320);
	/** Activity bar selection — each view owns the sidebar, like VS Code. */
	let view = $state<'databases' | 'files' | 'monitor'>('databases');
	let palette = $state(false);
	let settingsOpen = $state(false);

	/** Shared chrome button geometry — one place, so the toolbar stays even. */
	const BTN = 'flex h-7 items-center gap-1.5 rounded-[10px] px-2.5 text-[12px] transition-colors';
	const GHOST = `${BTN} text-ink-muted hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-35`;

	let displayName = $derived(settings.displayName.trim() || user.displayName);
	let initials = $derived(
		displayName
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() ?? '')
			.join('') || '?'
	);

	onMount(() => {
		workbench.newTab(m.tab_title());
		void workbench.loadDatabases();
		void workbench.loadFiles();

		// Capture phase: Monaco claims ⌘K as a chord prefix, and the editor also
		// binds ⌘S, so the window must see both before the editor swallows them.
		window.addEventListener('keydown', onKeydown, true);
		return () => window.removeEventListener('keydown', onKeydown, true);
	});

	/** Ctrl/Cmd+S and Ctrl/Cmd+K — SqlEditor binds the same two inside Monaco. */
	function onKeydown(event: KeyboardEvent): void {
		if (!(event.ctrlKey || event.metaKey)) return;
		const key = event.key.toLowerCase();
		if (key === 's') {
			event.preventDefault();
			const tab = workbench.activeTab;
			if (tab) void workbench.saveTab(tab);
		} else if (key === 'k') {
			event.preventDefault();
			palette = true;
		}
	}

	function insertIntoEditor(text: string): void {
		const tab = workbench.activeTab ?? workbench.newTab(m.tab_title());
		tab.sql += (tab.sql && !tab.sql.endsWith(' ') ? ' ' : '') + text;
	}

	/** Context-menu peek at a table: its own tab, run straight away. */
	function selectTop(db: string, table: string): void {
		const tab = workbench.newTab(table);
		tab.database = db;
		tab.sql = `SELECT * FROM \`${db}\`.\`${table}\` LIMIT 100;`;
		tab.savedSql = tab.sql;
		void tab.execute();
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
			if (axis === 'x') sidebarWidth = Math.min(480, Math.max(170, fromWidth + e.clientX - startX));
			else resultsHeight = Math.min(720, Math.max(120, fromHeight - (e.clientY - startY)));
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

{#snippet activityItem(icon: 'explorer' | 'query' | 'pulse', label: string, target: typeof view)}
	{@const active = view === target}
	<button
		class="grid h-[34px] w-[34px] place-items-center rounded-[11px] transition-colors {active
			? 'bg-active text-ink'
			: 'text-ink-muted hover:bg-hover hover:text-ink'}"
		title={label}
		aria-label={label}
		aria-pressed={active}
		onclick={() => (view = target)}
	>
		<Icon name={icon} size={17} />
	</button>
{/snippet}

{#if palette}
	<CommandPalette
		files={workbench.files}
		onclose={() => (palette = false)}
		onOpenFile={(name) => {
			view = 'files';
			void workbench.openFile(name);
		}}
		onUseDatabase={(db) => {
			const tab = workbench.activeTab ?? workbench.newTab(m.tab_title());
			tab.database = db;
			if (!workbench.databases.includes(db)) workbench.databases.push(db);
		}}
		onSelectTop={selectTop}
		onInsert={insertIntoEditor}
	/>
{/if}

{#if settingsOpen}
	<SettingsModal {user} onClose={() => (settingsOpen = false)} />
{/if}

<div class="relative flex h-screen flex-col overflow-hidden" style="background: var(--nb-bg)">
	<Aurora />

	<div class="relative flex min-h-0 flex-1">
		<!-- activity bar -->
		<aside class="chrome flex w-[50px] shrink-0 flex-col items-center gap-1.5 py-3">
			<img src="/favicon.svg" alt="" class="mb-3 h-5 w-5" title="Nebula" />
			{@render activityItem('explorer', m.databases(), 'databases')}
			{@render activityItem('query', m.queries(), 'files')}
			{@render activityItem('pulse', m.monitor(), 'monitor')}
			<button
				class="mt-auto grid h-[30px] w-[30px] place-items-center rounded-full border border-line
				       bg-active text-[11px] font-semibold transition-colors hover:border-accent"
				onclick={() => (settingsOpen = true)}
				title="{m.account()} — {displayName}"
				aria-label={m.account()}
			>
				{initials}
			</button>
		</aside>

		{#if view === 'monitor'}
			<div class="min-w-0 flex-1 py-2.5 pr-2.5">
				<div class="nb-panel h-full overflow-hidden"><Monitor /></div>
			</div>
		{:else}
			<!-- sidebar: one panel per activity-bar view -->
			<aside
				class="nb-glass chrome my-2.5 flex shrink-0 flex-col overflow-hidden"
				style="width: {sidebarWidth}px"
			>
				<header class="flex h-10 shrink-0 items-center gap-1 pr-2 pl-3.5">
					<span class="min-w-0 flex-1 truncate text-sm font-extrabold">
						{view === 'files' ? m.queries() : m.databases()}
					</span>
					{#if view === 'files'}
						<button
							class="grid h-6 w-6 place-items-center rounded-lg text-ink-muted transition-colors
							       hover:bg-hover hover:text-ink"
							title={m.new_query()}
							aria-label={m.new_query()}
							onclick={() => void workbench.saveTab(workbench.newTab(m.tab_title()))}
						>
							<Icon name="plus" size={15} />
						</button>
					{:else}
						<button
							class="grid h-6 w-6 place-items-center rounded-lg text-ink-muted transition-colors
							       hover:bg-hover hover:text-ink"
							title={m.refresh()}
							aria-label={m.refresh()}
							onclick={() => void workbench.refreshSchema()}
						>
							<Icon name="refresh" size={14} />
						</button>
					{/if}
				</header>

				{#if view === 'files'}
					<QueryFiles
						files={workbench.files}
						activeFile={workbench.activeTab?.fileName ?? null}
						bind:renaming={workbench.renaming}
						onOpen={(name) => void workbench.openFile(name)}
						onRename={(from, to) => void workbench.renameFile(from, to)}
						onDelete={(name) => void workbench.deleteFile(name)}
					/>
				{:else}
					<SchemaTree
						databases={workbench.databases}
						tablesByDb={workbench.tablesByDb}
						loadTables={(db) => void workbench.loadTables(db)}
						onInsert={insertIntoEditor}
						onRefresh={() => void workbench.refreshSchema()}
						onUseDatabase={(db) => {
							const tab = workbench.activeTab ?? workbench.newTab(m.tab_title());
							tab.database = db;
						}}
						onSelectTop={selectTop}
					/>
				{/if}
			</aside>
			<div
				role="separator"
				aria-orientation="vertical"
				class="grid w-2.5 shrink-0 cursor-col-resize place-items-center font-mono text-[11px]
				       text-ink-faint hover:text-accent"
				onpointerdown={(e) => startDrag(e, 'x')}
			>
				⋮
			</div>

			<!-- editor column -->
			<div class="flex min-w-0 flex-1 flex-col py-2.5 pr-2.5">
				<!-- tab strip -->
				<div class="chrome flex h-9 shrink-0 items-center gap-1.5">
					<div class="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
						{#each workbench.tabs as tab (tab.id)}
							{@const active = tab.id === workbench.activeTabId}
							<div
								class="group flex h-[30px] shrink-0 items-center gap-1.5 rounded-[10px] pr-1.5 pl-3
								       transition-colors {active
									? 'bg-active text-ink'
									: 'text-ink-muted hover:bg-hover hover:text-ink'}"
							>
								<button
									class="flex max-w-52 items-center gap-2 text-[12.5px] {active
										? 'font-medium'
										: ''}"
									onclick={() => (workbench.activeTabId = tab.id)}
								>
									<Icon
										name={tab.running ? 'spinner' : 'query'}
										size={13}
										class={tab.running ? 'animate-spin text-accent' : 'text-ink-faint'}
									/>
									<span class="truncate">{tab.title}</span>
								</button>
								<button
									class="grid h-5 w-5 place-items-center rounded-md text-ink-muted transition-colors
									       hover:bg-hover hover:text-ink {tab.dirty || active
										? ''
										: 'opacity-0 group-hover:opacity-100'}"
									onclick={() => closeTab(tab)}
									title={tab.dirty ? m.unsaved() : m.close_tab()}
									aria-label={m.close_tab()}
								>
									<!-- unsaved shows a dot until you reach for it, like VS Code -->
									<Icon
										name={tab.dirty ? 'dot' : 'close'}
										size={tab.dirty ? 11 : 12}
										class={tab.dirty ? 'text-accent group-hover:hidden' : ''}
									/>
									{#if tab.dirty}
										<Icon name="close" size={12} class="hidden group-hover:block" />
									{/if}
								</button>
							</div>
						{/each}
						<button
							class="grid h-7 w-7 shrink-0 place-items-center rounded-[10px] text-ink-muted
							       transition-colors hover:bg-hover hover:text-ink"
							onclick={() => workbench.newTab(m.tab_title())}
							title={m.new_tab()}
							aria-label={m.new_tab()}
						>
							<Icon name="plus" size={15} />
						</button>
					</div>
					<button
						class="flex h-7 shrink-0 items-center gap-2 rounded-[10px] border border-line bg-glass
						       px-3 text-ink-muted transition-colors hover:bg-hover hover:text-ink"
						onclick={() => (palette = true)}
					>
						<Icon name="search" size={13} />
						<span class="text-[11.5px]">{m.search()}</span>
						<span class="ml-5 font-mono text-[10px]">⌘K</span>
					</button>
				</div>

				{#if workbench.activeTab}
					{@const tab = workbench.activeTab}
					<div class="nb-panel flex min-h-0 flex-1 flex-col overflow-hidden">
						<!-- toolbar -->
						<div
							class="chrome flex h-11 shrink-0 items-center gap-1 border-b border-line-soft px-2.5"
						>
							<div class="relative flex items-center">
								<span class="pointer-events-none absolute left-3 text-[10.5px] text-ink-muted">
									{m.database()}
								</span>
								<!-- there is no "no database" choice: a query always runs somewhere -->
								<select
									class="h-7 appearance-none rounded-[10px] bg-hover py-0 pr-7 text-[12px]
									       transition-colors hover:bg-active disabled:opacity-50"
									style="padding-left: {m.database().length * 6 + 18}px"
									aria-label={m.database()}
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
									size={11}
									class="pointer-events-none absolute right-2.5 text-ink-muted"
								/>
							</div>

							<span class="mx-1 h-4 w-px bg-line"></span>

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
									? 'bg-active font-medium text-ink'
									: 'text-ink-muted hover:bg-hover hover:text-ink'}"
								aria-pressed={tab.profileEnabled}
								onclick={() => (tab.profileEnabled = !tab.profileEnabled)}
							>
								<Icon name="zap" size={13} />
								{m.profile_toggle()}
							</button>

							<div class="ml-auto flex items-center gap-2.5">
								<span
									class="hidden h-[22px] items-center rounded-lg border border-line px-2 font-mono
									       text-[10.5px] text-ink-muted sm:inline-flex"
									title={m.run_hint()}
								>
									⌃⏎
								</span>
								<button
									class="flex h-[30px] items-center gap-2 rounded-[10px] px-3.5 text-xs font-semibold
									       transition-colors disabled:pointer-events-none disabled:opacity-35"
									style="background: var(--nb-accent); color: var(--nb-accent-ink)"
									disabled={tab.running || !tab.sql.trim()}
									onclick={() => tab.execute()}
								>
									<Icon name="play" size={13} />
									{m.run()}
								</button>
							</div>
						</div>

						<!-- editor -->
						<div class="min-h-0 flex-1">
							<SqlEditor
								bind:value={tab.sql}
								onRun={(sql) => tab.execute(sql)}
								onSave={() => void workbench.saveTab(tab)}
								onSearch={() => (palette = true)}
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
							class="grid h-3 shrink-0 cursor-row-resize place-items-center text-[11px]
							       tracking-[2px] text-ink-faint hover:text-accent"
							onpointerdown={(e) => startDrag(e, 'y')}
						>
							···
						</div>
						<div
							class="flex shrink-0 flex-col border-t border-line-soft"
							style="height: {resultsHeight}px"
						>
							<div class="chrome flex h-[42px] shrink-0 items-center gap-1.5 px-2.5">
								{#snippet panelTab(
									selected: boolean,
									icon: 'table' | 'plan' | 'message',
									label: string,
									badge: string | null,
									badgeClass: string,
									select: () => void
								)}
									<button
										class="flex h-7 items-center gap-2 rounded-[10px] px-3 text-[12.5px]
										       transition-colors {selected
											? 'bg-active font-semibold text-ink'
											: 'text-ink-muted hover:bg-hover hover:text-ink'}"
										onclick={select}
									>
										<Icon name={icon} size={13} class={selected ? 'text-accent' : 'text-ink-faint'} />
										{label}
										{#if badge}
											<span class="font-mono text-[11px] {badgeClass}">{badge}</span>
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
											: set.rowCount.toLocaleString()) + (set.truncated ? '+' : ''),
										'text-ink-muted',
										() => (tab.activeResult = i)
									)}
								{/each}
								{#if tab.plan}
									{@render panelTab(tab.activeResult === -2, 'plan', m.plan_tab(), null, '', () => (
										(tab.activeResult = -2)
									))}
								{/if}
								{@render panelTab(
									tab.activeResult === -1,
									'message',
									m.messages_tab(),
									tab.run.errors.length ? String(tab.run.errors.length) : null,
									'text-err',
									() => (tab.activeResult = -1)
								)}

								<div class="ml-auto flex items-center gap-2.5">
									{#if tab.run.elapsedMs !== null}
										<span class="font-mono text-[11.5px] text-ink-muted">
											{tab.run.elapsedMs} ms
										</span>
									{/if}
									{#if tab.activeResult >= 0 && tab.run.resultsets[tab.activeResult]?.finished}
										{@const activeSet = tab.run.resultsets[tab.activeResult]}
										{#if activeSet.columns.length > 0 && tab.run.id}
											{#each ['csv', 'xlsx'] as format (format)}
												<a
													class="{GHOST} h-7 border border-line"
													href="/api/query/{tab.run.id}/export?statement={tab.activeResult}&format={format}"
													download
												>
													<Icon name="download" size={12} />
													{format.toUpperCase()}
												</a>
											{/each}
										{/if}
										{#if activeSet.queryId}
											<button
												class="{GHOST} h-7 border border-line"
												onclick={() => tab.loadProfile(activeSet.queryId!)}
											>
												<Icon name="zap" size={12} />
												{m.view_profile()}
											</button>
										{/if}
									{/if}
								</div>
							</div>

							<div class="min-h-0 flex-1 border-t border-line-soft">
								{#snippet emptyState(icon: 'inbox' | 'message' | 'table', text: string)}
									<div
										class="flex h-full flex-col items-center justify-center gap-2 text-ink-faint select-none"
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
										<div class="flex h-full items-center justify-center gap-2 text-ink-faint">
											<Icon name="spinner" size={16} class="animate-spin" />
											<span class="text-[12px]">{m.loading()}</span>
										</div>
									{:else if tab.plan && typeof tab.plan === 'object' && 'error' in tab.plan}
										<div class="h-full overflow-auto p-3">
											<p
												class="flex items-start gap-2 rounded-[10px] border border-err/30 p-3
												       font-mono text-xs text-err"
												style="background: var(--nb-accent-wash)"
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
											raw={tab.plan.raw ?? null}
										/>
									{/if}
								{:else if tab.activeResult === -1}
									{#if tab.run.errors.length === 0}
										{@render emptyState('message', m.no_messages())}
									{:else}
										<div class="h-full space-y-2 overflow-auto p-3">
											{#each tab.run.errors as errorText, i (i)}
												<p
													class="flex items-start gap-2 rounded-[10px] border border-err/30 p-2.5
													       font-mono text-xs text-err"
													style="background: var(--nb-accent-wash)"
												>
													<Icon name="alert" size={14} class="mt-px" />
													{errorText}
												</p>
											{/each}
											{#if tab.run.needsLogin}
												<a
													href="/auth/login"
													class="inline-flex items-center gap-1.5 text-xs text-accent-soft hover:underline"
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
					</div>

					<!-- status bar -->
					<div
						class="chrome flex h-[26px] shrink-0 items-center gap-3.5 px-1 text-[11px] text-ink-muted"
					>
						<span
							class="flex items-center gap-1.5 {tab.run.status === 'error'
								? 'text-err'
								: tab.running
									? 'text-accent-soft'
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
							<span class="flex items-center gap-1.5 font-mono">
								<Icon name="explorer" size={12} />
								{tab.database}
							</span>
						{/if}
						{#if tab.fileName}
							<span class="flex items-center gap-1.5">
								<Icon name="query" size={12} />
								{tab.fileName}{tab.dirty ? ' •' : ''}
							</span>
						{/if}
						<span class="ml-auto flex items-center gap-1.5 truncate">
							<Icon name="user" size={12} />
							{displayName}
						</span>
					</div>
				{:else}
					<div class="flex flex-1 flex-col items-center justify-center gap-3 text-ink-faint">
						<img src="/favicon.svg" alt="" class="h-10 w-10 opacity-60" />
						<button
							class="{GHOST} border border-line"
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
