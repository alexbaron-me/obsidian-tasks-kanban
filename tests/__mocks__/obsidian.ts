// Minimal stub of the `obsidian` module surface used by this plugin, for unit tests under jsdom.
import moment from 'moment';

export { moment };

export class Component {
	private children: Component[] = [];
	load(): void {}
	onload(): void {}
	unload(): void {
		for (const child of this.children) child.unload();
		this.children = [];
	}
	onunload(): void {}
	addChild<T extends Component>(child: T): T {
		this.children.push(child);
		return child;
	}
	removeChild<T extends Component>(child: T): T {
		this.children = this.children.filter((c) => c !== child);
		return child;
	}
	register(_cb: () => void): void {}
	registerEvent(_ref: unknown): void {}
	registerDomEvent(): void {}
	registerInterval(id: number): number {
		return id;
	}
}

export class MarkdownRenderChild extends Component {
	constructor(public containerEl: HTMLElement) {
		super();
	}
}

export class Events {
	private handlers = new Map<string, Set<(...args: unknown[]) => void>>();
	on(name: string, cb: (...args: unknown[]) => void): { name: string; cb: typeof cb } {
		if (!this.handlers.has(name)) this.handlers.set(name, new Set());
		this.handlers.get(name)!.add(cb);
		return { name, cb };
	}
	off(name: string, cb: (...args: unknown[]) => void): void {
		this.handlers.get(name)?.delete(cb);
	}
	offref(ref: { name: string; cb: (...args: unknown[]) => void }): void {
		this.off(ref.name, ref.cb);
	}
	trigger(name: string, ...args: unknown[]): void {
		this.handlers.get(name)?.forEach((cb) => cb(...args));
	}
}

export class TFile {
	path: string;
	name: string;
	basename: string;
	extension = 'md';
	constructor(path: string) {
		this.path = path;
		this.name = path.split('/').pop() ?? path;
		this.basename = this.name.replace(/\.[^.]+$/, '');
	}
}

export class TFolder {
	path: string;
	constructor(path: string) {
		this.path = path;
	}
}

class Vault extends Events {
	private files = new Map<string, string>();

	getFileByPath(path: string): TFile | null {
		return this.files.has(path) ? new TFile(path) : null;
	}

	setFileContent(path: string, content: string): void {
		this.files.set(path, content);
	}

	async read(file: TFile): Promise<string> {
		return this.files.get(file.path) ?? '';
	}

	async process(file: TFile, fn: (content: string) => string): Promise<string> {
		const current = this.files.get(file.path) ?? '';
		const next = fn(current);
		this.files.set(file.path, next);
		return next;
	}

	async modify(file: TFile, content: string): Promise<void> {
		this.files.set(file.path, content);
	}

	async create(path: string, content: string): Promise<TFile> {
		this.files.set(path, content);
		return new TFile(path);
	}

	adapter = {
		read: async (_path: string): Promise<string> => '{}',
		exists: async (_path: string): Promise<boolean> => false,
	};

	configDir = '.obsidian';
}

class Workspace extends Events {
	activeLeaf: unknown = null;
	getActiveViewOfType(): null {
		return null;
	}
}

class PluginManager {
	plugins: Record<string, unknown> = {};
	enabledPlugins = new Set<string>();
	getPlugin(id: string): unknown {
		return this.plugins[id] ?? null;
	}
}

export class App {
	vault = new Vault();
	workspace = new Workspace();
	plugins = new PluginManager();
	metadataCache = new Events();
}

export class Notice {
	message: string;
	constructor(message: string, _timeout?: number) {
		this.message = message;
	}
	hide(): void {}
}

export class Plugin extends Component {
	app: App;
	manifest: unknown;
	constructor(app: App, manifest: unknown) {
		super();
		this.app = app;
		this.manifest = manifest;
	}
	async loadData(): Promise<unknown> {
		return {};
	}
	async saveData(_data: unknown): Promise<void> {}
	addCommand(): void {}
	addRibbonIcon(): HTMLElement {
		return document.createElement('div');
	}
	addSettingTab(): void {}
	addStatusBarItem(): HTMLElement {
		return document.createElement('div');
	}
	registerView(): void {}
	registerExtensions(): void {}
	registerMarkdownCodeBlockProcessor(): void {}
	registerObsidianProtocolHandler(): void {}
}

export class WorkspaceLeaf {
	view: unknown = null;
}

export abstract class View extends Component {
	leaf: WorkspaceLeaf;
	containerEl: HTMLElement;
	constructor(leaf: WorkspaceLeaf) {
		super();
		this.leaf = leaf;
		this.containerEl = document.createElement('div');
		this.containerEl.appendChild(document.createElement('div'));
		this.containerEl.appendChild(document.createElement('div'));
	}
	abstract getViewType(): string;
	abstract getDisplayText(): string;
}

export abstract class TextFileView extends View {
	data = '';
	contentEl: HTMLElement;
	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
		this.contentEl = this.containerEl.children[1] as HTMLElement;
	}
	abstract getViewData(): string;
	abstract setViewData(data: string, clear: boolean): void;
	abstract clear(): void;
	requestSave(): void {}
}

export class PluginSettingTab {
	app: App;
	plugin: Plugin;
	containerEl: HTMLElement;
	constructor(app: App, plugin: Plugin) {
		this.app = app;
		this.plugin = plugin;
		this.containerEl = document.createElement('div');
	}
	display(): void {}
	hide(): void {}
}

export class Setting {
	settingEl: HTMLElement;
	constructor(containerEl: HTMLElement) {
		this.settingEl = document.createElement('div');
		containerEl.appendChild(this.settingEl);
	}
	setName(): this {
		return this;
	}
	setDesc(): this {
		return this;
	}
	addText(cb: (component: unknown) => void): this {
		cb({
			setPlaceholder: () => ({ setValue: () => ({ onChange: () => {} }) }),
			setValue: () => ({ onChange: () => {} }),
			onChange: () => {},
		});
		return this;
	}
	addToggle(cb: (component: unknown) => void): this {
		cb({ setValue: () => ({ onChange: () => {} }), onChange: () => {} });
		return this;
	}
	addDropdown(cb: (component: unknown) => void): this {
		cb({
			addOption: () => ({ addOption: () => {}, setValue: () => {}, onChange: () => {} }),
			setValue: () => ({ onChange: () => {} }),
			onChange: () => {},
		});
		return this;
	}
	addButton(cb: (component: unknown) => void): this {
		cb({ setButtonText: () => ({ onClick: () => {} }), onClick: () => {} });
		return this;
	}
}

export class Menu {
	items: { title: string; onClick: () => void }[] = [];
	addItem(cb: (item: MenuItem) => void): this {
		const item = new MenuItem();
		cb(item);
		this.items.push({ title: item.title, onClick: item.clickHandler ?? (() => {}) });
		return this;
	}
	addSeparator(): this {
		return this;
	}
	showAtMouseEvent(): void {}
	showAtPosition(): void {}
}

export class MenuItem {
	title = '';
	clickHandler: (() => void) | null = null;
	setTitle(title: string): this {
		this.title = title;
		return this;
	}
	setIcon(): this {
		return this;
	}
	onClick(cb: () => void): this {
		this.clickHandler = cb;
		return this;
	}
}

export class Modal {
	app: App;
	contentEl: HTMLElement;
	constructor(app: App) {
		this.app = app;
		this.contentEl = document.createElement('div');
	}
	open(): void {
		this.onOpen();
	}
	close(): void {
		this.onClose();
	}
	onOpen(): void {}
	onClose(): void {}
}

export const MarkdownRenderer = {
	async render(
		_app: App,
		markdown: string,
		el: HTMLElement,
		_sourcePath: string,
		_component: Component,
	): Promise<void> {
		el.textContent = markdown;
	},
};

export function normalizePath(path: string): string {
	return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
}

export const Platform = {
	isMobile: false,
	isDesktop: true,
	isDesktopApp: true,
	isMobileApp: false,
};
