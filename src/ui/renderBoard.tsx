import { render } from 'preact';
import { moment } from 'obsidian';
import type { RenderContext, Unmount } from './RenderContext';
import { isTasksPluginEnabled } from '../integration/TasksApi';
import { TasksPluginMissingPanel, WaitingForTasksPanel, BoardParseErrorPanel } from './ErrorPanel';
import { BoardShell, openTaskFileFactory } from './components/BoardShell';
import { FieldWriter } from '../write/FieldWriter';
import { TaskWriter } from '../write/TaskWriter';
import { useEffect, useState } from 'preact/hooks';
import type { BoardModel, BoardModelState } from '../model/BoardModel';

const BOOTSTRAP_TIMEOUT_MS = 5000;
const RENDER_DEBOUNCE_MS = 50;

function Root({ ctx, boardModel }: { ctx: RenderContext; boardModel: BoardModel }) {
	const [ready, setReady] = useState(ctx.tasksCache.isReady());
	const [timedOut, setTimedOut] = useState(false);
	const [, setTasksVersion] = useState(0);
	const [modelState, setModelState] = useState<BoardModelState>(boardModel.getState());

	useEffect(() => {
		// Cache-update events fire frequently while editing; debounce the re-render at 50ms
		// trailing edge (§6.6) rather than recomputing the whole board per keystroke.
		let debounceTimer: ReturnType<typeof setTimeout> | null = null;
		const unsub = ctx.tasksCache.subscribe(() => {
			setReady(ctx.tasksCache.isReady());
			if (debounceTimer) clearTimeout(debounceTimer);
			debounceTimer = setTimeout(() => setTasksVersion((v) => v + 1), RENDER_DEBOUNCE_MS);
		});
		return () => {
			if (debounceTimer) clearTimeout(debounceTimer);
			unsub();
		};
	}, [ctx.tasksCache]);

	useEffect(() => {
		if (ready) return;
		const timer = setTimeout(() => setTimedOut(true), BOOTSTRAP_TIMEOUT_MS);
		return () => clearTimeout(timer);
	}, [ready]);

	useEffect(() => boardModel.subscribe(setModelState), [boardModel]);

	if (!isTasksPluginEnabled(ctx.app)) return <TasksPluginMissingPanel />;

	if (!ready) {
		if (!timedOut) return <div class="tasks-board-loading">Loading…</div>;
		return <WaitingForTasksPanel onRetry={() => { setTimedOut(false); ctx.tasksCache.requestBootstrap(); }} />;
	}

	if (modelState.status === 'parse-error') {
		return (
			<BoardParseErrorPanel
				error={modelState.message}
				raw={modelState.raw}
				onSave={(raw) => boardModel.setRawText(raw)}
			/>
		);
	}

	const tasksConfig = ctx.tasksConfig.get();
	const fieldWriter = new FieldWriter(ctx.globalSettings.format);
	const taskWriter = new TaskWriter(ctx.app, fieldWriter, ctx.tasksApi, ctx.tasksCache);

	return (
		<BoardShell
			app={ctx.app}
			boardModel={boardModel}
			state={modelState}
			allTasks={ctx.tasksCache.getTasks()}
			statuses={tasksConfig.statuses}
			today={() => moment()}
			boardPath={ctx.boardPath}
			containingFilePath={ctx.containingFilePath}
			initialViewName={ctx.initialViewName}
			globalSettings={ctx.globalSettings}
			saveGlobalSettings={ctx.saveGlobalSettings}
			taskWriter={taskWriter}
			fieldWriter={fieldWriter}
			openTaskFile={openTaskFileFactory(ctx.app, (path) => ctx.app.vault.getFileByPath(path))}
		/>
	);
}

/**
 * The leaf-free render entry point (§12.1). No `this.leaf`, `app.workspace.activeLeaf`, or
 * view-type assumptions anywhere in this tree — both BoardView and the embed/codeblock path
 * call this same function.
 */
export function renderBoard(container: HTMLElement, boardModel: BoardModel, ctx: RenderContext): Unmount {
	render(<Root ctx={ctx} boardModel={boardModel} />, container);
	return () => render(null, container);
}
