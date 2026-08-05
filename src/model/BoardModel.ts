import * as YAML from 'yaml';
import type {
	BoardFile,
	BucketOverride,
	CardConfig,
	ColumnSpec,
	LaneSpec,
	OrderOverride,
	SettingsBlock,
	ViewConfig,
} from '../types/board';
import { parseBoardYaml, validateBoardFile, type SchemaError } from './schema';

export interface PersistenceAdapter {
	write(text: string): Promise<void>;
}

export type BoardModelState =
	| { status: 'ok'; boardFile: BoardFile; errors: SchemaError[] }
	| { status: 'parse-error'; message: string; raw: string };

type Listener = (state: BoardModelState) => void;

const SAVE_DEBOUNCE_MS = 2000;

function emptyView(name: string): ViewConfig {
	return {
		name,
		filters: '',
		sort: '',
		settings: {},
		columns: { field: 'status', overrides: {} },
		lanes: null,
		card: { chips: ['due', 'priority', 'tags'] },
		order: {},
	};
}

/**
 * In-memory representation of one .board file. Mutations patch the underlying YAML.Document
 * in place (preserving comments and key order elsewhere in the file) and notify subscribers
 * synchronously; saves are debounced and flushed on demand.
 */
export class BoardModel {
	private document: YAML.Document | null = null;
	private state: BoardModelState;
	private listeners = new Set<Listener>();
	private saveTimer: ReturnType<typeof setTimeout> | null = null;
	private dirty = false;

	constructor(
		initialText: string,
		private adapter: PersistenceAdapter,
	) {
		this.state = this.parse(initialText);
	}

	private parse(text: string): BoardModelState {
		const result = parseBoardYaml(text);
		if (!result.ok) {
			this.document = null;
			return { status: 'parse-error', message: result.parseError, raw: result.raw };
		}
		this.document = result.document;
		return { status: 'ok', boardFile: result.boardFile, errors: result.errors };
	}

	getState(): BoardModelState {
		return this.state;
	}

	/** Reloads from disk-authoritative text (e.g. an external edit). Never overwrites a
	 * parse-error state automatically — only an explicit user save does that (§13.3). */
	reload(text: string): void {
		this.state = this.parse(text);
		this.notify();
	}

	/** User-initiated fix of a malformed file from the raw-text error editor. */
	setRawText(text: string): void {
		this.state = this.parse(text);
		this.notify();
		this.scheduleSave();
	}

	subscribe(fn: Listener): () => void {
		this.listeners.add(fn);
		fn(this.state);
		return () => this.listeners.delete(fn);
	}

	private notify(): void {
		for (const fn of this.listeners) fn(this.state);
	}

	private refreshFromDocument(): void {
		if (!this.document) return;
		const { doc: boardFile, errors } = validateBoardFile(this.document.toJS() ?? {});
		this.state = { status: 'ok', boardFile, errors };
	}

	private mutate(path: (string | number)[], value: unknown): void {
		if (!this.document) return;
		this.document.setIn(path, value);
		this.refreshFromDocument();
		this.notify();
		this.scheduleSave();
	}

	private scheduleSave(): void {
		this.dirty = true;
		if (this.saveTimer) clearTimeout(this.saveTimer);
		this.saveTimer = setTimeout(() => {
			void this.flush();
		}, SAVE_DEBOUNCE_MS);
	}

	async flush(): Promise<void> {
		if (this.saveTimer) {
			clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		if (!this.dirty || !this.document) return;
		this.dirty = false;
		await this.adapter.write(this.document.toString());
	}

	// ---- Mutations ----

	setBoardFilters(text: string): void {
		this.mutate(['filters'], text);
	}

	setBoardSettings(patch: SettingsBlock): void {
		if (this.state.status !== 'ok') return;
		this.mutate(['settings'], { ...this.state.boardFile.settings, ...patch });
	}

	setViewFilters(viewIndex: number, text: string): void {
		this.mutate(['views', viewIndex, 'filters'], text);
	}

	setViewSort(viewIndex: number, text: string): void {
		this.mutate(['views', viewIndex, 'sort'], text);
	}

	setViewSettings(viewIndex: number, patch: SettingsBlock): void {
		if (this.state.status !== 'ok') return;
		const view = this.state.boardFile.views[viewIndex];
		if (!view) return;
		this.mutate(['views', viewIndex, 'settings'], { ...view.settings, ...patch });
	}

	setColumns(viewIndex: number, columns: ColumnSpec): void {
		this.mutate(['views', viewIndex, 'columns'], columns);
	}

	setLanes(viewIndex: number, lanes: LaneSpec | null): void {
		this.mutate(['views', viewIndex, 'lanes'], lanes);
	}

	setCard(viewIndex: number, card: CardConfig): void {
		this.mutate(['views', viewIndex, 'card'], card);
	}

	setBucketOverride(viewIndex: number, bucketId: string, override: BucketOverride): void {
		this.mutate(['views', viewIndex, 'columns', 'overrides', bucketId], override);
	}

	/** Replaces the full sparse order list for one bucket. Callers are responsible for
	 * computing the pruned/updated list (see board/order.ts). */
	setOrder(viewIndex: number, bucketId: string, overrides: OrderOverride[]): void {
		if (overrides.length === 0) {
			this.document?.deleteIn(['views', viewIndex, 'order', bucketId]);
			this.refreshFromDocument();
			this.notify();
			this.scheduleSave();
			return;
		}
		this.mutate(['views', viewIndex, 'order', bucketId], overrides);
	}

	addView(name: string): void {
		if (this.state.status !== 'ok') return;
		this.mutate(['views', this.state.boardFile.views.length], emptyView(name));
	}

	renameView(viewIndex: number, name: string): void {
		this.mutate(['views', viewIndex, 'name'], name);
	}

	removeView(viewIndex: number): void {
		if (this.state.status !== 'ok') return;
		const views = this.state.boardFile.views.filter((_, i) => i !== viewIndex);
		this.mutate(['views'], views);
	}

	reorderViews(fromIndex: number, toIndex: number): void {
		if (this.state.status !== 'ok') return;
		const views = [...this.state.boardFile.views];
		const [moved] = views.splice(fromIndex, 1);
		if (!moved) return;
		views.splice(toIndex, 0, moved);
		this.mutate(['views'], views);
	}
}
