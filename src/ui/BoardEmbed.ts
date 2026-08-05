import { Component, MarkdownRenderChild, type App, type MarkdownPostProcessorContext } from 'obsidian';
import type { BoardStore } from '../model/BoardStore';
import type { TasksCache } from '../integration/TasksCache';
import type { TasksConfig } from '../integration/TasksConfig';
import type { TasksApi } from '../integration/TasksApi';
import type { GlobalSettings } from '../settings/GlobalSettings';
import type { RenderContext, Unmount } from './RenderContext';
import { renderBoard } from './renderBoard';

export interface EmbedDeps {
	app: App;
	boardStore: BoardStore;
	tasksCache: TasksCache;
	tasksConfig: TasksConfig;
	tasksApi: TasksApi;
	globalSettings: GlobalSettings;
	saveGlobalSettings: () => Promise<void>;
}

async function mountEmbed(
	container: HTMLElement,
	deps: EmbedDeps,
	boardPath: string,
	containingFilePath: string,
	viewName: string | null,
): Promise<Unmount> {
	const boardModel = await deps.boardStore.acquire(boardPath, deps.tasksConfig.get().statuses);
	const ctx: RenderContext = {
		app: deps.app,
		tasksCache: deps.tasksCache,
		tasksConfig: deps.tasksConfig,
		tasksApi: deps.tasksApi,
		boardStore: deps.boardStore,
		globalSettings: deps.globalSettings,
		saveGlobalSettings: deps.saveGlobalSettings,
		boardPath,
		// Embedded boards resolve `query.file` to the containing note, not the .board file (§15).
		containingFilePath,
		initialViewName: viewName,
	};
	const unmountTree = renderBoard(container, boardModel, ctx);
	return () => {
		unmountTree();
		deps.boardStore.release(boardPath);
	};
}

interface LooseEmbedContext {
	containerEl?: HTMLElement;
	sourcePath?: string;
}

class BoardEmbedComponent extends Component {
	private unmount: Unmount | null = null;

	constructor(
		private deps: EmbedDeps,
		private embedCtx: unknown,
		private file: unknown,
		private subpath: unknown,
	) {
		super();
	}

	onload(): void {
		const ctx = this.embedCtx as LooseEmbedContext;
		const container = ctx.containerEl;
		if (!container) return;
		const path = looseFilePath(this.file);
		if (!path) return;
		const viewName = looseSubpathName(this.subpath);
		const sourcePath = ctx.sourcePath ?? path;
		void mountEmbed(container, this.deps, path, sourcePath, viewName).then((unmount) => {
			this.unmount = unmount;
		});
	}

	onunload(): void {
		this.unmount?.();
	}
}

function looseFilePath(file: unknown): string | null {
	if (typeof file !== 'object' || file === null || !('path' in file)) return null;
	const path: unknown = file.path;
	return typeof path === 'string' ? path : null;
}

function looseSubpathName(subpath: unknown): string | null {
	if (typeof subpath !== 'string' || subpath === '') return null;
	return subpath.replace(/^#/, '');
}

/**
 * Registers `![[board.board]]` / `![[board.board#View]]` embedding via the undocumented
 * `app.embedRegistry`. Feature-detected and wrapped in try/catch per §15 — if this API shape is
 * wrong or the registry is unavailable in a given Obsidian version, the codeblock fallback below
 * still works, so this is a best-effort enhancement, not a hard dependency.
 */
export function registerBoardEmbed(deps: EmbedDeps): void {
	const registry = deps.app.embedRegistry;
	if (!registry) return;
	try {
		registry.registerExtension('board', (embedCtx: unknown, file: unknown, subpath: unknown) => {
			return new BoardEmbedComponent(deps, embedCtx, file, subpath);
		});
	} catch {
		// Swallow: the embed registry shape is undocumented and may differ across versions.
	}
}

export function unregisterBoardEmbed(deps: EmbedDeps): void {
	try {
		deps.app.embedRegistry?.unregisterExtension('board');
	} catch {
		// best-effort
	}
}

export interface CodeblockBoardSpec {
	file: string;
	view?: string;
}

/** Parses the fenced ```board``` codeblock body: `file: path.board` / `view: Name`. */
export function parseCodeblockSource(source: string): CodeblockBoardSpec | null {
	let file: string | null = null;
	let view: string | undefined;
	for (const line of source.split('\n')) {
		const trimmed = line.trim();
		if (trimmed === '') continue;
		const m = /^(file|view)\s*:\s*(.+)$/i.exec(trimmed);
		if (!m) continue;
		const value = m[2]!.trim();
		if (m[1]!.toLowerCase() === 'file') file = value;
		else view = value;
	}
	if (!file) return null;
	return { file, view };
}

/**
 * Builds the ```board``` codeblock processor function. Fully documented (unlike the embed
 * registry), so this is the reliable embedding path — the embed registry above is an
 * enhancement on top of it, not a replacement. Call
 * `plugin.registerMarkdownCodeBlockProcessor('board', createCodeblockProcessor(deps))` from
 * `main.ts` so Obsidian owns the processor's lifecycle registration.
 */
export function createCodeblockProcessor(deps: EmbedDeps) {
	return async (source: string, el: HTMLElement, mdCtx: MarkdownPostProcessorContext): Promise<void> => {
		const parsed = parseCodeblockSource(source);
		if (!parsed) {
			el.createDiv({ text: 'tasks-board: expected "file: <path>.board"' });
			return;
		}
		const spec: CodeblockBoardSpec = parsed;
		class BoardCodeblockChild extends MarkdownRenderChild {
			unmount: Unmount | null = null;
			onload() {
				void mountEmbed(el, deps, spec.file, mdCtx.sourcePath, spec.view ?? null).then((u) => {
					this.unmount = u;
				});
			}
			onunload() {
				this.unmount?.();
			}
		}
		mdCtx.addChild(new BoardCodeblockChild(el));
	};
}
