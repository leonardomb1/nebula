<script lang="ts">
	import { onMount } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import { Workbench } from '$lib/workbench.svelte';
	import SqlEditor from './SqlEditor.svelte';
	import ResultsGrid from './ResultsGrid.svelte';
	import SchemaTree from './SchemaTree.svelte';

	let { user }: { user: { username: string; displayName: string } } = $props();

	const workbench = new Workbench();

	let sidebarWidth = $state(260);
	let resultsHeight = $state(280);

	onMount(() => {
		workbench.newTab(m.tab_title());
		void workbench.loadDatabases();
	});

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

<div class="flex h-screen flex-col overflow-hidden">
	<div class="flex min-h-0 flex-1">
		<!-- activity bar -->
		<aside class="flex w-12 shrink-0 flex-col items-center gap-2 border-r border-edge bg-surface py-3">
			<span class="text-xl" title="Nebula">🌌</span>
			<span class="mt-2 rounded bg-surface-2 p-1.5 text-secondary" title={m.explorer()}>▤</span>
			<a
				href="/auth/logout"
				data-sveltekit-preload-data="off"
				class="mt-auto text-ink-muted hover:text-ink"
				title="{m.sign_out()} — {user.displayName}"
			>
				⏻
			</a>
		</aside>

		<!-- sidebar -->
		<aside class="shrink-0 border-r border-edge bg-surface" style="width: {sidebarWidth}px">
			<SchemaTree
				databases={workbench.databases}
				onInsert={(text) => {
					const tab = workbench.activeTab;
					if (tab) tab.sql += (tab.sql && !tab.sql.endsWith(' ') ? ' ' : '') + text;
				}}
			/>
		</aside>
		<div
			role="separator"
			aria-orientation="vertical"
			class="w-1 shrink-0 cursor-col-resize hover:bg-primary-strong/60"
			onpointerdown={(e) => startDrag(e, 'x')}
		></div>

		<!-- editor column -->
		<div class="flex min-w-0 flex-1 flex-col">
			<!-- tab bar -->
			<div class="flex items-center border-b border-edge bg-surface">
				{#each workbench.tabs as tab (tab.id)}
					<div
						class="group flex items-center border-r border-edge {tab.id === workbench.activeTabId
							? 'bg-bg text-ink'
							: 'text-ink-muted hover:text-ink'}"
					>
						<button class="px-3 py-1.5 text-sm" onclick={() => (workbench.activeTabId = tab.id)}>
							{tab.title}
						</button>
						<button
							class="pr-2 text-xs opacity-0 group-hover:opacity-100"
							onclick={() => workbench.closeTab(tab)}
							aria-label={m.close_tab()}
						>
							✕
						</button>
					</div>
				{/each}
				<button
					class="px-3 py-1.5 text-sm text-ink-muted hover:text-ink"
					onclick={() => workbench.newTab(m.tab_title())}
					aria-label={m.new_tab()}
				>
					+
				</button>
			</div>

			{#if workbench.activeTab}
				{@const tab = workbench.activeTab}
				<!-- toolbar -->
				<div class="flex items-center gap-2 border-b border-edge bg-surface px-2 py-1.5">
					<select
						class="rounded border border-edge bg-surface-2 px-2 py-1 text-sm"
						bind:value={tab.database}
					>
						<option value={null}>{m.no_database()}</option>
						{#each workbench.databases as db (db)}
							<option value={db}>{db}</option>
						{/each}
					</select>
					<button
						class="rounded bg-primary-strong px-3 py-1 text-sm font-medium text-white transition hover:bg-primary disabled:opacity-40"
						disabled={tab.running || !tab.sql.trim()}
						onclick={() => tab.execute()}
					>
						▶ {m.run()}
					</button>
					<button
						class="rounded border border-edge px-3 py-1 text-sm text-ink-muted transition hover:text-ink disabled:opacity-40"
						disabled={!tab.running}
						onclick={() => tab.cancel()}
					>
						◼ {m.cancel()}
					</button>
					<span class="ml-auto text-xs text-ink-muted">{m.run_hint()}</span>
				</div>

				<!-- editor -->
				<div class="min-h-0 flex-1">
					<SqlEditor bind:value={tab.sql} onRun={(sql) => tab.execute(sql)} />
				</div>

				<!-- results panel -->
				<div
					role="separator"
					aria-orientation="horizontal"
					class="h-1 shrink-0 cursor-row-resize hover:bg-primary-strong/60"
					onpointerdown={(e) => startDrag(e, 'y')}
				></div>
				<div class="flex shrink-0 flex-col border-t border-edge" style="height: {resultsHeight}px">
					<div class="flex items-center gap-1 border-b border-edge bg-surface px-2 text-sm">
						{#each tab.run.resultsets as set, i (i)}
							<button
								class="border-b-2 px-2 py-1 {tab.activeResult === i
									? 'border-primary text-ink'
									: 'border-transparent text-ink-muted hover:text-ink'}"
								onclick={() => (tab.activeResult = i)}
							>
								{m.results()}
								{tab.run.resultsets.length > 1 ? i + 1 : ''}
								<span class="ml-1 text-xs text-ink-muted">
									{set.finished && set.columns.length === 0
										? m.affected_rows({ n: set.affectedRows ?? 0 })
										: m.row_count({ n: set.rowCount })}{set.truncated ? '+' : ''}
								</span>
							</button>
						{/each}
						<button
							class="border-b-2 px-2 py-1 {tab.activeResult === -1
								? 'border-primary text-ink'
								: 'border-transparent text-ink-muted hover:text-ink'}"
							onclick={() => (tab.activeResult = -1)}
						>
							{m.messages_tab()}
							{#if tab.run.errors.length}
								<span class="ml-1 text-xs" style="color: var(--nebula-err)">
									{tab.run.errors.length}
								</span>
							{/if}
						</button>
					</div>
					<div class="min-h-0 flex-1 bg-bg">
						{#if tab.activeResult >= 0 && tab.run.resultsets[tab.activeResult]}
							{@const set = tab.run.resultsets[tab.activeResult]}
							{#if set.columns.length > 0}
								<ResultsGrid resultset={set} />
							{:else}
								<p class="p-3 text-sm text-ink-muted">
									{m.affected_rows({ n: set.affectedRows ?? 0 })}
								</p>
							{/if}
						{:else if tab.activeResult === -1}
							<div class="h-full overflow-auto p-3 font-mono text-xs">
								{#each tab.run.errors as errorText, i (i)}
									<p class="mb-1" style="color: var(--nebula-err)">{errorText}</p>
								{/each}
								{#if tab.run.needsLogin}
									<a href="/auth/login" class="text-secondary underline">{m.sign_in_again()}</a>
								{/if}
								{#if tab.run.errors.length === 0}
									<p class="text-ink-muted">{m.no_messages()}</p>
								{/if}
							</div>
						{:else}
							<p class="p-3 text-sm text-ink-muted italic">{m.no_results_yet()}</p>
						{/if}
					</div>
				</div>

				<!-- status bar -->
				<div
					class="flex items-center gap-3 border-t border-edge bg-surface px-3 py-1 text-xs text-ink-muted"
				>
					<span
						class={tab.running ? 'text-glow' : ''}
						style={tab.run.status === 'error' ? 'color: var(--nebula-err)' : ''}
					>
						{statusText(tab)}
					</span>
					{#if tab.database}<span>{tab.database}</span>{/if}
					<span class="ml-auto">{user.displayName}</span>
				</div>
			{/if}
		</div>
	</div>
</div>
