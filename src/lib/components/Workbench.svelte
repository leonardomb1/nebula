<script lang="ts">
	import { onMount } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import { settings } from '$lib/settings.svelte';
	import { Workbench, type ResultSet, type Tab } from '$lib/workbench.svelte';
	import Aurora from './Aurora.svelte';
	import CommandPalette from './CommandPalette.svelte';
	import Monitor from './Monitor.svelte';
	import PlanViewer from './PlanViewer.svelte';
	import ResultsGrid from './ResultsGrid.svelte';
	import SchemaTree from './SchemaTree.svelte';
	import SettingsModal from './SettingsModal.svelte';
	import SqlEditor from './SqlEditor.svelte';

	let { user }: { user: { username: string; displayName: string } } = $props();

	const workbench = new Workbench();

	let sidebarWidth = $state(238);
	let resultsHeight = $state(340);
	let view = $state<'editor' | 'monitor'>('editor');
	let settingsOpen = $state(false);
	let paletteOpen = $state(false);
	let exportOpen = $state(false);
	let copied = $state('');

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

		// Capture phase: Monaco treats ⌘K as a chord prefix and would otherwise
		// swallow it whenever the caret is in the editor.
		window.addEventListener('keydown', onKeydown, true);
		return () => window.removeEventListener('keydown', onKeydown, true);
	});

	/** True when the event started inside the export menu or on its trigger. */
	function insideExportMenu(target: EventTarget | null): boolean {
		return target instanceof Element && target.closest('[data-export-menu]') !== null;
	}

	/* ------------------------------------------------------------- layout */

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

	function onKeydown(event: KeyboardEvent): void {
		const meta = event.metaKey || event.ctrlKey;
		if (meta && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			paletteOpen = true;
		} else if (meta && event.shiftKey && event.key === 'Enter') {
			event.preventDefault();
			void workbench.activeTab?.explain();
		} else if (event.key === 'Escape') {
			exportOpen = false;
		}
	}

	function statusText(tab: Tab): string {
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

	function insert(text: string): void {
		const tab = workbench.activeTab;
		if (tab) tab.sql += (tab.sql && !tab.sql.endsWith(' ') ? ' ' : '') + text;
	}

	/* ------------------------------------------------------------- export */

	const text = (cell: unknown) =>
		cell === null ? '' : typeof cell === 'object' ? JSON.stringify(cell) : String(cell);

	function toTsv(set: ResultSet): string {
		return [
			set.columns.map((column) => column.name).join('\t'),
			...set.rows.map((row) => row.map(text).join('\t'))
		].join('\n');
	}

	function toMarkdown(set: ResultSet): string {
		const escape = (value: string) => value.replaceAll('|', '\\|');
		return [
			`| ${set.columns.map((column) => escape(column.name)).join(' | ')} |`,
			`| ${set.columns.map(() => '---').join(' | ')} |`,
			...set.rows.map((row) => `| ${row.map((cell) => escape(text(cell))).join(' | ')} |`)
		].join('\n');
	}

	async function copy(what: 'tsv' | 'md', set: ResultSet): Promise<void> {
		await navigator.clipboard
			.writeText(what === 'tsv' ? toTsv(set) : toMarkdown(set))
			.catch(() => null);
		exportOpen = false;
		copied = what;
		setTimeout(() => (copied = ''), 1400);
	}

	/** Opens a CREATE TABLE AS SELECT skeleton over the current query. */
	function createTableAs(tab: Tab): void {
		exportOpen = false;
		const target = workbench.newTab(m.tab_title());
		target.database = tab.database;
		target.sql = `create table ${tab.database ? `\`${tab.database}\`.` : ''}\`new_table\` as\n${tab.sql.trim()}`;
	}
</script>

<svelte:window
	onpointerdown={(event) => {
		if (exportOpen && !insideExportMenu(event.target)) exportOpen = false;
	}}
/>

<div class="relative flex h-screen flex-col overflow-hidden" style="background: var(--nb-bg)">
	<Aurora />

	<div class="relative flex min-h-0 flex-1">
		<!-- rail -->
		<nav
			class="flex w-[50px] shrink-0 flex-col items-center gap-1.5 py-3"
			aria-label={m.workbench()}
		>
			<span
				class="mb-3 h-5 w-5 rounded-full"
				style="background: var(--nb-brand)"
				title="Nebula"
			></span>
			{#each [['editor', '▤', m.workbench()], ['monitor', '∿', m.monitor()]] as const as [id, icon, label] (id)}
				<button
					class="grid h-[34px] w-[34px] place-items-center rounded-[11px] text-sm transition-colors
					       {view === id ? 'bg-active text-ink' : 'text-ink-muted hover:bg-hover'}"
					onclick={() => (view = id)}
					title={label}
					aria-label={label}
					aria-current={view === id ? 'page' : undefined}>{icon}</button
				>
			{/each}
			<button
				class="mt-auto grid h-[30px] w-[30px] place-items-center rounded-full border border-line
				       bg-active text-[11px] font-semibold transition-colors hover:border-accent"
				onclick={() => (settingsOpen = true)}
				title="{m.account()} — {displayName}"
				aria-label={m.account()}>{initials}</button
			>
		</nav>

		{#if view === 'monitor'}
			<div class="min-w-0 flex-1 pr-2.5 pb-2.5">
				<div class="nb-panel h-full overflow-hidden"><Monitor /></div>
			</div>
		{:else}
			<!-- explorer -->
			<aside class="nb-glass my-2.5 shrink-0 overflow-hidden" style="width: {sidebarWidth}px">
				<SchemaTree
					databases={workbench.databases}
					tablesByDb={workbench.tablesByDb}
					activeDb={workbench.activeTab?.database ?? null}
					loadTables={(db) => void workbench.loadTables(db)}
					onInsert={insert}
				/>
			</aside>
			<div
				role="separator"
				aria-orientation="vertical"
				class="grid w-2.5 shrink-0 cursor-col-resize place-items-center font-mono text-[11px]
				       text-ink-faint hover:text-accent"
				onpointerdown={(event) => startDrag(event, 'x')}
			>
				⋮
			</div>

			<!-- editor column -->
			<div class="flex min-w-0 flex-1 flex-col py-2.5 pr-2.5">
				<!-- query tabs -->
				<div class="flex h-9 shrink-0 items-center gap-1.5">
					{#each workbench.tabs as tab (tab.id)}
						<div
							class="group flex h-[30px] items-center gap-2 rounded-[10px] px-3 transition-colors
							       {tab.id === workbench.activeTabId
								? 'bg-active'
								: 'text-ink-muted hover:bg-hover'}"
						>
							<button
								class="text-[12.5px] {tab.id === workbench.activeTabId ? 'font-medium' : ''}"
								onclick={() => (workbench.activeTabId = tab.id)}
							>
								{tab.title}
							</button>
							{#if tab.running}
								<span
									class="h-[5px] w-[5px] animate-pulse rounded-full"
									style="background: var(--nb-accent)"
								></span>
							{/if}
							<button
								class="text-[10px] text-ink-muted opacity-0 group-hover:opacity-100 hover:text-ink"
								onclick={() => workbench.closeTab(tab)}
								aria-label={m.close_tab()}>✕</button
							>
						</div>
					{/each}
					<button
						class="grid h-7 w-7 place-items-center rounded-[10px] text-ink-muted transition-colors
						       hover:bg-hover"
						onclick={() => workbench.newTab(m.tab_title())}
						aria-label={m.new_tab()}>+</button
					>
					<button
						class="ml-auto flex h-7 items-center gap-2 rounded-[10px] border border-line bg-glass
						       px-3 text-ink-muted transition-colors hover:bg-hover"
						onclick={() => (paletteOpen = true)}
					>
						<span class="text-[11px]">⌕</span>
						<span class="text-[11.5px]">{m.search()}</span>
						<span class="ml-5 font-mono text-[10px]">⌘K</span>
					</button>
				</div>

				{#if workbench.activeTab}
					{@const tab = workbench.activeTab}
					{@const set = tab.run.resultsets[tab.activeResult] ?? null}
					<div class="nb-panel flex min-h-0 flex-1 flex-col overflow-hidden">
						<!-- toolbar -->
						<div
							class="flex h-11 shrink-0 items-center gap-2.5 border-b border-line-soft px-2.5"
						>
							<label
								class="relative flex h-7 items-center gap-2 rounded-[10px] bg-hover px-3
								       transition-colors hover:bg-active"
							>
								<span class="text-[10.5px] text-ink-muted">{m.database()}</span>
								<span class="font-mono text-xs">{tab.database ?? m.no_database()}</span>
								<span class="ml-1.5 text-[8px] text-ink-muted">▾</span>
								<select
									class="absolute inset-0 cursor-pointer appearance-none opacity-0"
									aria-label={m.database()}
									bind:value={tab.database}
								>
									<option value={null}>{m.no_database()}</option>
									{#each workbench.databases as db (db)}
										<option value={db}>{db}</option>
									{/each}
								</select>
							</label>

							<button
								class="flex h-7 items-center rounded-[10px] px-2.5 text-xs transition-colors
								       hover:bg-hover disabled:opacity-40"
								disabled={tab.plan === 'loading' || !tab.sql.trim()}
								onclick={() => tab.explain()}>{m.explain()}</button
							>
							<button
								class="flex h-7 items-center rounded-[10px] px-2.5 text-xs transition-colors
								       {tab.profileEnabled ? 'bg-active font-medium' : 'hover:bg-hover'}"
								aria-pressed={tab.profileEnabled}
								onclick={() => (tab.profileEnabled = !tab.profileEnabled)}
								>{m.profile_toggle()}</button
							>
							{#if tab.running}
								<button
									class="flex h-7 items-center rounded-[10px] border border-line px-2.5 text-xs
									       text-ink-muted transition-colors hover:bg-hover"
									onclick={() => tab.cancel()}>◼ {m.cancel()}</button
								>
							{/if}

							<div class="ml-auto flex items-center gap-2.5">
								<span
									class="hidden h-[22px] items-center rounded-lg border border-line px-2 font-mono
									       text-[10.5px] text-ink-muted sm:inline-flex"
									title={m.run_hint()}>⌃⏎</span
								>
								<button
									class="flex h-[30px] items-center gap-2 rounded-[10px] px-3.5 text-xs font-semibold
									       transition-colors disabled:opacity-40"
									style="background: var(--nb-accent); color: var(--nb-accent-ink)"
									disabled={tab.running || !tab.sql.trim()}
									onclick={() => tab.execute()}>▶ {m.run()}</button
								>
							</div>
						</div>

						<!-- editor -->
						<div class="min-h-0 flex-1">
							<SqlEditor
								bind:value={tab.sql}
								onRun={(sql) => tab.execute(sql)}
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

									<div
							role="separator"
							aria-orientation="horizontal"
							class="grid h-3 shrink-0 cursor-row-resize place-items-center text-[11px]
							       tracking-[2px] text-ink-faint hover:text-accent"
							onpointerdown={(event) => startDrag(event, 'y')}
						>
							···
						</div>

						<!-- results -->
						<div
							class="flex shrink-0 flex-col border-t border-line-soft"
							style="height: {resultsHeight}px"
						>
							<div class="relative flex h-[42px] shrink-0 items-center gap-1.5 px-2.5">
								{#each tab.run.resultsets as resultset, i (i)}
									<button
										class="flex h-7 items-center gap-2 rounded-[10px] px-3 text-[12.5px]
										       transition-colors
										       {tab.activeResult === i
											? 'bg-active font-semibold'
											: 'text-ink-muted hover:bg-hover'}"
										onclick={() => (tab.activeResult = i)}
									>
										{m.results()}{tab.run.resultsets.length > 1 ? ` ${i + 1}` : ''}
										<span class="font-mono text-[11px] text-ink-muted">
											{resultset.finished && resultset.columns.length === 0
												? m.affected_rows({ n: resultset.affectedRows ?? 0 })
												: resultset.rowCount.toLocaleString()}{resultset.truncated ? '+' : ''}
										</span>
									</button>
								{/each}
								{#if tab.plan}
									<button
										class="flex h-7 items-center rounded-[10px] px-3 text-[12.5px] transition-colors
										       {tab.activeResult === -2
											? 'bg-active font-semibold'
											: 'text-ink-muted hover:bg-hover'}"
										onclick={() => (tab.activeResult = -2)}>{m.plan_tab()}</button
									>
								{/if}
								<button
									class="flex h-7 items-center gap-2 rounded-[10px] px-3 text-[12.5px]
									       transition-colors
									       {tab.activeResult === -1
										? 'bg-active font-semibold'
										: 'text-ink-muted hover:bg-hover'}"
									onclick={() => (tab.activeResult = -1)}
								>
									{m.messages_tab()}
									{#if tab.run.errors.length}
										<span class="font-mono text-[11px]" style="color: var(--nb-err)">
											{tab.run.errors.length}
										</span>
									{/if}
								</button>

								<div class="ml-auto flex items-center gap-2.5">
									{#if tab.run.elapsedMs !== null}
										<span class="font-mono text-[11.5px] text-ink-muted">
											{tab.run.elapsedMs} ms
										</span>
									{/if}
									{#if set?.finished && set.columns.length > 0}
										<button
											data-export-menu
											class="flex h-7 items-center gap-2 rounded-[10px] border border-line px-3
											       text-[11.5px] font-medium transition-colors hover:bg-hover"
											aria-expanded={exportOpen}
											onclick={() => (exportOpen = !exportOpen)}
										>
											↓ {m.export()}
											<span class="text-[8px] text-ink-muted">▾</span>
										</button>
									{/if}
								</div>

								{#if exportOpen && set?.finished}
									<div
										data-export-menu
										class="nb-anim-pop absolute top-[38px] right-2.5 z-20 w-[290px] rounded-xl
										       border border-line p-1.5 backdrop-blur-[22px]"
										style="background: var(--nb-pop); box-shadow: var(--nb-shadow-sm)"
									>
										<p
											class="px-2.5 pt-[7px] pb-[5px] text-[10px] font-medium tracking-[0.1em]
											       text-ink-muted uppercase"
										>
											{m.export_scope()}
										</p>

										{#snippet item(
											icon: string,
											label: string,
											hint: string,
											key: string,
											run: () => void
										)}
											<button
												class="flex w-full items-baseline gap-2.5 rounded-[9px] px-2.5 py-[7px]
												       text-left transition-colors hover:bg-hover"
												onclick={run}
											>
												<span class="w-3.5 shrink-0 text-[11px] text-ink-muted">{icon}</span>
												<span class="min-w-0 flex-1">
													<span class="block text-[12.5px] font-medium">{label}</span>
													<span class="mt-px block text-[11px] text-ink-muted">{hint}</span>
												</span>
												<span class="shrink-0 font-mono text-[10px] text-ink-faint">{key}</span>
											</button>
										{/snippet}

										{@render item(
											'⧉',
											m.export_copy_tsv(),
											m.export_copy_tsv_hint({ n: set.rowCount }),
											'⌘C',
											() => void copy('tsv', set)
										)}
										{@render item('▤', m.export_copy_md(), m.export_copy_md_hint(), '', () =>
											void copy('md', set)
										)}

										{#snippet download(icon: string, label: string, hint: string, format: string)}
											<a
												class="flex items-baseline gap-2.5 rounded-[9px] px-2.5 py-[7px]
												       transition-colors hover:bg-hover"
												href="/api/query/{tab.run.id}/export?statement={tab.activeResult}&format={format}"
												download
												onclick={() => (exportOpen = false)}
											>
												<span class="w-3.5 shrink-0 text-[11px] text-ink-muted">{icon}</span>
												<span class="min-w-0 flex-1">
													<span class="block text-[12.5px] font-medium">{label}</span>
													<span class="mt-px block text-[11px] text-ink-muted">{hint}</span>
												</span>
											</a>
										{/snippet}

										{@render download(
											'↓',
											m.export_csv(),
											m.export_csv_hint({ n: set.rowCount }),
											'csv'
										)}
										{@render download('↓', m.export_xlsx(), m.export_xlsx_hint(), 'xlsx')}

										{#if set.queryId}
											{@render item('⚡', m.view_profile(), m.plan_time(), '', () => {
												exportOpen = false;
												void tab.loadProfile(set.queryId!);
											})}
										{/if}
										{@render item('⌗', m.export_ctas(), m.export_ctas_hint(), '', () =>
											createTableAs(tab)
										)}
									</div>
								{/if}
							</div>

							<div class="min-h-0 flex-1 border-t border-line-soft">
								{#if tab.activeResult >= 0 && set}
									{#if set.columns.length > 0}
										<ResultsGrid resultset={set} />
									{:else}
										<p class="p-3.5 text-[12.5px] text-ink-muted">
											{m.affected_rows({ n: set.affectedRows ?? 0 })}
										</p>
									{/if}
								{:else if tab.activeResult === -2}
									{#if tab.plan === 'loading'}
										<p class="p-3.5 text-[12.5px] text-ink-muted">{m.loading()}</p>
									{:else if tab.plan && typeof tab.plan === 'object' && 'error' in tab.plan}
										<p class="p-3.5 font-mono text-[11.5px]" style="color: var(--nb-err)">
											{tab.plan.error}
										</p>
									{:else if tab.plan && typeof tab.plan === 'object'}
										<PlanViewer
											nodes={tab.plan.nodes}
											edges={tab.plan.edges}
											summary={tab.plan.summary ?? null}
											raw={tab.plan.raw ?? null}
										/>
									{/if}
								{:else if tab.activeResult === -1}
									<div class="h-full overflow-auto p-3.5 font-mono text-[11.5px]">
										{#each tab.run.errors as errorText, i (i)}
											<p class="mb-1.5" style="color: var(--nb-err)">{errorText}</p>
										{/each}
										{#if tab.run.needsLogin}
											<a href="/auth/login" class="underline" style="color: var(--nb-accent-soft)">
												{m.sign_in_again()}
											</a>
										{/if}
										{#if tab.run.errors.length === 0}
											<p class="text-ink-muted">{m.no_messages()}</p>
										{/if}
									</div>
								{:else}
									<p class="p-3.5 text-[12.5px] text-ink-muted italic">{m.no_results_yet()}</p>
								{/if}
							</div>
						</div>
					</div>

					<!-- status bar -->
					<div
						class="flex h-[26px] shrink-0 items-center gap-3.5 px-1 text-[11px] text-ink-muted"
					>
						<span style={tab.run.status === 'error' ? 'color: var(--nb-err)' : ''}>
							{statusText(tab)}
						</span>
						{#if tab.database}<span class="font-mono">{tab.database}</span>{/if}
						{#if set && set.columns.length > 0}
							<span>
								{m.status_summary({ rows: set.rowCount.toLocaleString(), cols: set.columns.length })}
							</span>
							{#if set.truncated}
								<span style="color: var(--nb-warn)">
									{m.truncated_note({ n: set.rowCount.toLocaleString() })}
								</span>
							{/if}
						{/if}
						{#if copied}<span style="color: var(--nb-ok)">{m.copied()}</span>{/if}
						<span class="ml-auto truncate">{displayName}</span>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>

{#if settingsOpen}
	<SettingsModal {user} onClose={() => (settingsOpen = false)} />
{/if}
{#if paletteOpen}
	<CommandPalette
		{workbench}
		onPickTable={(db, table) => insert(`\`${db}\`.\`${table}\``)}
		onClose={() => (paletteOpen = false)}
	/>
{/if}
