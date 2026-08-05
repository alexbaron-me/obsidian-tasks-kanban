import { Notice, Plugin, TFile, type WorkspaceLeaf } from 'obsidian';
import { TasksCache } from './integration/TasksCache';
import { TasksConfig } from './integration/TasksConfig';
import { TasksApi, isTasksPluginEnabled } from './integration/TasksApi';
import { BoardStore } from './model/BoardStore';
import { bootstrapBoardFile, serializeBoardFile } from './model/schema';
import { defaultGlobalSettings, loadGlobalSettings, type GlobalSettings } from './settings/GlobalSettings';
import { TasksBoardSettingsTab } from './settings/SettingsTab';
import { BoardView, VIEW_TYPE_BOARD, type BoardViewDeps } from './ui/BoardView';
import { registerBoardEmbed, unregisterBoardEmbed, createCodeblockProcessor, type EmbedDeps } from './ui/BoardEmbed';

export default class TasksBoardPlugin extends Plugin {
	globalSettings!: GlobalSettings;
	tasksCache!: TasksCache;
	tasksConfig!: TasksConfig;
	tasksApi!: TasksApi;
	boardStore!: BoardStore;

	async onload(): Promise<void> {
		this.tasksCache = new TasksCache(this.app);
		this.tasksConfig = new TasksConfig(this.app);
		this.tasksApi = new TasksApi(this.app);
		this.boardStore = new BoardStore(this.app);

		await this.tasksConfig.refresh();
		const persisted = await this.loadData();
		this.globalSettings = loadGlobalSettings(persisted, this.tasksConfig.get().taskFormat);
		if (persisted === null || persisted === undefined) {
			// First-ever load: persist the seeded format immediately so it's visible in
			// data.json and never re-derived from Tasks again (§5.3).
			await this.saveData(this.globalSettings);
		}

		this.tasksCache.start();
		this.registerEvent(this.app.workspace.on('layout-change', () => void this.tasksConfig.refresh()));

		const viewDeps: BoardViewDeps = {
			app: this.app,
			boardStore: this.boardStore,
			tasksCache: this.tasksCache,
			tasksConfig: this.tasksConfig,
			tasksApi: this.tasksApi,
			globalSettings: this.globalSettings,
			saveGlobalSettings: () => this.saveSettings(),
		};

		this.registerView(VIEW_TYPE_BOARD, (leaf: WorkspaceLeaf) => new BoardView(leaf, viewDeps));
		this.registerExtensions(['board'], VIEW_TYPE_BOARD);

		const embedDeps: EmbedDeps = viewDeps;
		registerBoardEmbed(embedDeps);
		this.registerMarkdownCodeBlockProcessor('board', createCodeblockProcessor(embedDeps));

		this.addSettingTab(
			new TasksBoardSettingsTab(this.app, this, {
				getSettings: () => this.globalSettings,
				saveSettings: () => this.saveSettings(),
			}),
		);

		this.addCommand({
			id: 'create-board',
			name: 'Create new board',
			callback: () => void this.createNewBoard(),
		});

		this.addCommand({
			id: 'toggle-tasks-board-view',
			name: 'Open current file as a Tasks Board',
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== 'board') return false;
				if (!checking) void this.app.workspace.getLeaf(false).setViewState({ type: VIEW_TYPE_BOARD, state: { file: file.path } });
				return true;
			},
		});

		this.registerObsidianProtocolHandler('tasks-board', async (params) => {
			const path = params['file'];
			if (typeof path !== 'string') {
				new Notice('tasks-board URI requires a "file" parameter');
				return;
			}
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.setViewState({ type: VIEW_TYPE_BOARD, state: { file: path } });
			this.app.workspace.setActiveLeaf(leaf);
		});
	}

	onunload(): void {
		unregisterBoardEmbed({
			app: this.app,
			boardStore: this.boardStore,
			tasksCache: this.tasksCache,
			tasksConfig: this.tasksConfig,
			tasksApi: this.tasksApi,
			globalSettings: this.globalSettings,
			saveGlobalSettings: () => this.saveSettings(),
		});
		this.tasksCache.stop();
		void this.boardStore.flushAll();
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.globalSettings);
	}

	private async createNewBoard(): Promise<void> {
		if (!isTasksPluginEnabled(this.app)) {
			new Notice('Tasks Board needs the Tasks plugin installed and enabled.');
			return;
		}
		const statuses = this.tasksConfig.get().statuses;
		const text = serializeBoardFile(bootstrapBoardFile(statuses));
		let path = 'Untitled.board';
		let n = 1;
		while (this.app.vault.getFileByPath(path)) {
			path = `Untitled ${n}.board`;
			n++;
		}
		const file = await this.app.vault.create(path, text);
		if (file instanceof TFile) {
			await this.app.workspace.getLeaf(false).openFile(file);
		}
	}
}
