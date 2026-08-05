import type { App, TFile } from 'obsidian';
import { BoardModel, type PersistenceAdapter } from './BoardModel';
import { bootstrapBoardFile, serializeBoardFile } from './schema';
import type { TaskStatus } from '../types/tasks';

interface Entry {
	model: BoardModel;
	refCount: number;
}

/**
 * One BoardModel per file path, ref-counted. Two leaves showing the same .board file share the
 * same model and both subscribe, eliminating last-write-wins clobber between panes. A model is
 * disposed (its pending save flushed) when its refcount reaches zero.
 */
export class BoardStore {
	private entries = new Map<string, Entry>();

	constructor(private app: App) {}

	private adapterFor(path: string): PersistenceAdapter {
		return {
			write: async (text: string) => {
				const file = this.app.vault.getFileByPath(path);
				if (file) {
					await this.app.vault.modify(file, text);
				} else {
					await this.app.vault.create(path, text);
				}
			},
		};
	}

	/** Loads (or bootstraps, if the file is empty/new) a BoardModel for `path` and bumps its
	 * refcount. Callers must call `release(path)` when done (e.g. on view close). */
	async acquire(path: string, defaultStatuses?: TaskStatus[]): Promise<BoardModel> {
		const existing = this.entries.get(path);
		if (existing) {
			existing.refCount++;
			return existing.model;
		}

		const file = this.app.vault.getFileByPath(path);
		const text = file ? await this.app.vault.read(file) : '';
		const initialText = text.trim() === '' ? serializeBoardFile(bootstrapBoardFile(defaultStatuses ?? [])) : text;

		const model = new BoardModel(initialText, this.adapterFor(path));
		this.entries.set(path, { model, refCount: 1 });
		return model;
	}

	release(path: string): void {
		const entry = this.entries.get(path);
		if (!entry) return;
		entry.refCount--;
		if (entry.refCount <= 0) {
			void entry.model.flush();
			this.entries.delete(path);
		}
	}

	/** Flushes every open model's pending save. Call on plugin unload / app quit. */
	async flushAll(): Promise<void> {
		await Promise.all([...this.entries.values()].map((e) => e.model.flush()));
	}

	getIfOpen(path: string): BoardModel | null {
		return this.entries.get(path)?.model ?? null;
	}
}

export function fileFromPath(app: App, path: string): TFile | null {
	return app.vault.getFileByPath(path);
}
