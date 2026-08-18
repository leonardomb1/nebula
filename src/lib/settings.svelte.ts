/**
 * User preferences, persisted in localStorage and applied to the document.
 *
 * The theme is resolved twice: once by THEME_BOOTSTRAP (injected into <head>
 * by the root layout) so the first paint already carries the right ground,
 * then here, which keeps it in sync and tracks the OS preference for as long
 * as the choice is `system`.
 */

export type ThemeChoice = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export interface NebulaSettings {
	theme: ThemeChoice;
	/** Overrides the name from SSO in the chrome. Empty = use the SSO name. */
	displayName: string;
	/** Result grid density, in px. */
	rowHeight: number;
	/** Rows requested per statement — clamped by MAX_RESULT_ROWS server-side. */
	rowLimit: number;
	/** Collect the execution profile on every run. */
	profileOnRun: boolean;
	/** Show the plan tab instead of the grid once a run finishes. */
	planFirst: boolean;
	editorFontSize: number;
	minimap: boolean;
}

const KEY = 'nebula:settings';

/**
 * The no-flash theme bootstrap, injected into <head> by the root layout.
 *
 * It has to run before the first paint, which rules out `onMount` — a
 * light-theme user would otherwise get a frame of the dark ground on every
 * full page load. Kept here so it shares the storage key with the rest of
 * the module.
 */
export const THEME_BOOTSTRAP = `(()=>{try{var c=(JSON.parse(localStorage.getItem(${JSON.stringify(
	KEY
)})||"{}").theme)||"dark"}catch(e){c="dark"}document.documentElement.dataset.theme=c==="system"?(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):(c==="light"?"light":"dark")})()`;

const DEFAULTS: NebulaSettings = {
	theme: 'dark',
	displayName: '',
	rowHeight: 30,
	rowLimit: 10_000,
	profileOnRun: false,
	planFirst: false,
	editorFontSize: 13,
	minimap: true
};

export const ROW_LIMITS = [1_000, 5_000, 10_000, 50_000, 100_000];

export const settings = $state<NebulaSettings>({ ...DEFAULTS });

/** The theme actually in effect — `system` resolved against the OS. */
export const theme = $state<{ resolved: ResolvedTheme }>({ resolved: 'dark' });

function systemTheme(): ResolvedTheme {
	return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches
		? 'light'
		: 'dark';
}

/** Applies a choice to the document without persisting it — used to preview
 *  a theme while the settings dialog is open and still cancellable. */
export function previewTheme(choice: ThemeChoice): void {
	const resolved = choice === 'system' ? systemTheme() : choice;
	theme.resolved = resolved;
	document.documentElement.dataset.theme = resolved;
}

function applyTheme(): void {
	previewTheme(settings.theme);
}

function persist(): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(settings));
	} catch {
		// Private mode / quota — preferences just don't survive the session.
	}
}

/** Reads storage and starts tracking the OS preference. Call once, on mount. */
export function initSettings(): () => void {
	try {
		const raw = localStorage.getItem(KEY);
		if (raw) {
			const stored = JSON.parse(raw) as Partial<NebulaSettings>;
			for (const key of Object.keys(DEFAULTS) as (keyof NebulaSettings)[]) {
				// Same-shape only: a stale or hand-edited payload must not be able
				// to put a string where the UI expects a number.
				if (typeof stored[key] === typeof DEFAULTS[key]) {
					Object.assign(settings, { [key]: stored[key] });
				}
			}
		}
	} catch {
		// Corrupt payload — the defaults are already in place.
	}
	applyTheme();

	const media = matchMedia('(prefers-color-scheme: light)');
	const onChange = () => {
		if (settings.theme === 'system') applyTheme();
	};
	media.addEventListener('change', onChange);
	return () => media.removeEventListener('change', onChange);
}

export function updateSettings(patch: Partial<NebulaSettings>): void {
	Object.assign(settings, patch);
	applyTheme();
	persist();
}
