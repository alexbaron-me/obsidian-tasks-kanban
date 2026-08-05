import type { App } from 'obsidian';
import type { TasksCache } from '../integration/TasksCache';
import type { TasksConfig } from '../integration/TasksConfig';
import type { TasksApi } from '../integration/TasksApi';
import type { BoardStore } from '../model/BoardStore';
import type { GlobalSettings } from '../settings/GlobalSettings';

/**
 * Everything the render tree needs, with no leaf or view-type assumptions. Shared between the
 * TextFileView shell (BoardView) and the embed/codeblock path (BoardEmbed).
 */
export interface RenderContext {
	app: App;
	tasksCache: TasksCache;
	tasksConfig: TasksConfig;
	tasksApi: TasksApi;
	boardStore: BoardStore;
	globalSettings: GlobalSettings;
	saveGlobalSettings: () => Promise<void>;
	/** Path of the .board file. */
	boardPath: string;
	/** Path of the note the board is rendered in: itself for BoardView, the containing note for embeds. */
	containingFilePath: string;
	/** Selected view name for embeds (`![[x.board#Week]]`); null renders the first view. */
	initialViewName?: string | null;
}

export type Unmount = () => void;
