import { TextFileView, type App, type WorkspaceLeaf } from 'obsidian';
import type { BoardStore } from '../model/BoardStore';
import type { BoardModel } from '../model/BoardModel';
import type { TasksCache } from '../integration/TasksCache';
import type { TasksConfig } from '../integration/TasksConfig';
import type { TasksApi } from '../integration/TasksApi';
import type { GlobalSettings } from '../settings/GlobalSettings';
import type { RenderContext, Unmount } from './RenderContext';
import { renderBoard } from './renderBoard';

export const VIEW_TYPE_BOARD = 'tasks-board-view';

export interface BoardViewDeps {
	app: App;
	boardStore: BoardStore;
	tasksCache: TasksCache;
	tasksConfig: TasksConfig;
	tasksApi: TasksApi;
	globalSettings: GlobalSettings;
	saveGlobalSettings: () => Promise<void>;
}

/**
 * Thin shell: owns the leaf and delegates to the leaf-free `renderBoard` entry point. All board
 * state lives in a shared BoardModel (via BoardStore), not on this view instance, so two leaves
 * open on the same .board file stay in sync.
 */
export class BoardView extends TextFileView {
	private deps: BoardViewDeps;
	private unmount: Unmount | null = null;
	private boardModel: BoardModel | null = null;
	private mountedPath: string | null = null;

	constructor(leaf: WorkspaceLeaf, deps: BoardViewDeps) {
		super(leaf);
		this.deps = deps;
	}

	getViewType(): string {
		return VIEW_TYPE_BOARD;
	}

	getDisplayText(): string {
		return this.file?.basename ?? 'Board';
	}

	getIcon(): string {
		return 'layout-grid';
	}

	getViewData(): string {
		return this.data;
	}

	setViewData(data: string, _clear: boolean): void {
		this.data = data;
		void this.loadBoard();
	}

	private async loadBoard(): Promise<void> {
		if (!this.file) return;
		if (this.mountedPath === this.file.path && this.boardModel) return;

		if (this.mountedPath) {
			this.unmount?.();
			this.deps.boardStore.release(this.mountedPath);
		}
		this.boardModel = await this.deps.boardStore.acquire(this.file.path, this.deps.tasksConfig.get().statuses);
		this.mountedPath = this.file.path;
		this.mount();
	}

	clear(): void {
		this.contentEl.empty();
	}

	async onClose(): Promise<void> {
		this.unmount?.();
		this.unmount = null;
		if (this.mountedPath) {
			this.deps.boardStore.release(this.mountedPath);
			this.mountedPath = null;
		}
	}

	private mount(): void {
		if (!this.file || !this.boardModel) return;
		const ctx: RenderContext = {
			app: this.deps.app,
			tasksCache: this.deps.tasksCache,
			tasksConfig: this.deps.tasksConfig,
			tasksApi: this.deps.tasksApi,
			boardStore: this.deps.boardStore,
			globalSettings: this.deps.globalSettings,
			saveGlobalSettings: this.deps.saveGlobalSettings,
			boardPath: this.file.path,
			containingFilePath: this.file.path,
		};
		this.unmount = renderBoard(this.contentEl, this.boardModel, ctx);
	}
}
