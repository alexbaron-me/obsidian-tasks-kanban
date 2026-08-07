import type { App, TFile } from 'obsidian';
import { Notice } from 'obsidian';
import { useMemo, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import {
	DndContext,
	DragOverlay,
	PointerSensor,
	TouchSensor,
	useSensor,
	useSensors,
	type DragEndEvent,
	type DragStartEvent,
} from '@dnd-kit/core';
import type { BoardModelState } from '../../model/BoardModel';
import type { BoardModel } from '../../model/BoardModel';
import type { Task, TaskStatus } from '../../types/tasks';
import type { ViewConfig } from '../../types/board';
import { computeBoardData } from '../../board/renderPipeline';
import { compileAccentRules, matchAccent } from '../../board/accent';
import { laneGroupField, laneWriteValueFor } from '../../board/laneWrite';
import { decideDrop, executeDrop, fieldWriterTransform } from '../../board/dropController';
import { computeDropPosition, recordOrder } from '../../board/order';
import { generateTaskId } from '../../write/ids';
import { IdConfirmModal } from '../../write/idConfirm';
import type { TaskWriter } from '../../write/TaskWriter';
import type { FieldWriter } from '../../write/FieldWriter';
import type { QueryContext } from '../../query/context';
import type { GlobalSettings } from '../../settings/GlobalSettings';
import { resolveSettings } from '../../settings/cascade';
import { canonicalColumns, columnTasksAcrossRows, flattenLanes } from '../../board/laneGrid';
import { Lane } from './Lane';
import { ColumnHeader } from './ColumnHeader';
import { CardView } from './Card';
import { openBoardSettingsModal } from '../BoardSettingsModal';

export interface BoardShellProps {
	app: App;
	boardModel: BoardModel;
	state: Extract<BoardModelState, { status: 'ok' }>;
	allTasks: readonly Task[];
	statuses: readonly TaskStatus[];
	today: () => import('moment').Moment;
	boardPath: string;
	containingFilePath: string;
	initialViewName?: string | null;
	globalSettings: GlobalSettings;
	saveGlobalSettings: () => Promise<void>;
	taskWriter: TaskWriter;
	fieldWriter: FieldWriter;
	openTaskFile: (task: Task) => void;
}

function resolveStatusBySymbol(statuses: readonly TaskStatus[], symbol: string): TaskStatus | null {
	return statuses.find((s) => s.symbol === symbol) ?? null;
}

function taskFromActive(active: unknown): Task | undefined {
	const withData = active as { data?: { current?: unknown } };
	const rawData: unknown = withData.data?.current;
	return typeof rawData === 'object' && rawData !== null && 'task' in rawData
		? (rawData as { task: Task }).task
		: undefined;
}

function parseDropTargetId(id: string): { kind: 'end' | 'before'; laneId: string; bucketId?: string; taskKey?: string } | null {
	if (id.startsWith('end:')) {
		const [, laneId, bucketId] = id.split(':');
		return { kind: 'end', laneId: laneId!, bucketId };
	}
	if (id.startsWith('before:')) {
		const rest = id.slice('before:'.length);
		return { kind: 'before', laneId: '', taskKey: rest };
	}
	return null;
}

export function BoardShell(props: BoardShellProps) {
	const { boardFile } = props.state;
	const initialIndex = Math.max(
		0,
		props.initialViewName ? boardFile.views.findIndex((v) => v.name === props.initialViewName) : 0,
	);
	const [viewIndex, setViewIndex] = useState(initialIndex === -1 ? 0 : initialIndex);
	const [activeTask, setActiveTask] = useState<Task | null>(null);

	const view: ViewConfig | undefined = boardFile.views[viewIndex];

	const ctx: QueryContext = useMemo(
		() => ({
			file: {
				path: props.containingFilePath,
				root: '/',
				folder: props.containingFilePath.includes('/') ? props.containingFilePath.slice(0, props.containingFilePath.lastIndexOf('/')) : '',
				filename: props.containingFilePath.split('/').pop() ?? props.containingFilePath,
				filenameWithoutExtension: (props.containingFilePath.split('/').pop() ?? '').replace(/\.md$/, ''),
				frontmatter: {},
			},
			allTasks: props.allTasks,
			boardId: props.boardPath,
			viewName: view?.name ?? '',
			today: props.today(),
		}),
		[props.allTasks, props.boardPath, props.containingFilePath, view?.name, props.today],
	);

	const resolved = resolveSettings(props.globalSettings, boardFile.settings, view?.settings ?? {});
	const accentRules = useMemo(() => compileAccentRules(props.globalSettings.accentRules), [props.globalSettings.accentRules]);
	const globalFilterTag = props.globalSettings.hideGlobalFilterTag ? props.globalSettings.globalFilterTag : '';

	const data = useMemo(() => {
		if (!view) return null;
		return computeBoardData(boardFile, view, props.allTasks, ctx, resolved);
	}, [boardFile, view, props.allTasks, ctx, resolved]);

	// Jira-style grid (§ swimlane redesign): one shared column-header row on top, then every
	// swimlane as a horizontal band beneath it, all sharing the same grid column tracks so
	// everything lines up — see `.tasks-board-grid` in styles.css.
	const flatRows = useMemo(() => flattenLanes(data?.lanes ?? []), [data]);
	const gridColumns = useMemo(() => canonicalColumns(flatRows), [flatRows]);
	const showLaneHeaders = !(flatRows.length === 1 && flatRows[0]!.lane.id === '__all__');

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
		useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
	);

	async function toggleDone(task: Task) {
		const isDone = task.status.type === 'DONE' || task.status.type === 'CANCELLED';
		const target = resolveStatusBySymbol(props.statuses, isDone ? task.status.nextStatusSymbol : 'x');
		const fallback: TaskStatus = {
			symbol: isDone ? ' ' : 'x',
			name: isDone ? 'Todo' : 'Done',
			type: isDone ? 'TODO' : 'DONE',
			nextStatusSymbol: isDone ? 'x' : ' ',
		};
		const status = target ?? fallback;
		const result = await props.taskWriter.setStatus(task, status);
		if (!result.ok && result.message) new Notice(result.message);
	}

	async function editTask(task: Task) {
		await props.taskWriter.editViaModal(task);
	}

	function openFile(task: Task) {
		props.openTaskFile(task);
	}

	// Group-heading rows (see laneGrid.flattenLanes) carry the full, pre-split task set purely for
	// display bookkeeping — they're never rendered as real cells/droppables, so every lookup below
	// that resolves a task or a drop target to a specific lane+bucket must search leaf lanes only.
	// Otherwise a nested-lane board could resolve a drop against the parent's redundant column
	// instead of the actual nested one the user dropped into.
	const leafLanes = useMemo(() => flatRows.filter((r) => !r.isGroupHeading).map((r) => r.lane), [flatRows]);

	function removeOrderOverride(task: Task) {
		if (!view || !task.id) return;
		for (const lane of leafLanes) {
			for (const column of lane.columns) {
				if (!column.tasks.includes(task)) continue;
				const bucketId = column.bucket.id;
				const remaining = (view.order[bucketId] ?? []).filter((o) => o.id !== task.id);
				props.boardModel.setOrder(viewIndex, bucketId, remaining);
				return;
			}
		}
	}

	async function quickAdd(laneId: string, bucketId: string) {
		if (!view) return;
		const column = leafLanes.find((l) => l.id === laneId)?.columns.find((c) => c.bucket.id === bucketId);
		const target = resolved.quickAddTarget ?? props.containingFilePath;
		await props.taskWriter.createTaskViaModal(target, (line) => {
			if (!column?.bucket.writeValue) return line;
			return fieldWriterTransform(props.fieldWriter, column.bucket.writeValue)(line);
		});
	}

	function handleDragStart(event: DragStartEvent) {
		setActiveTask(taskFromActive(event.active) ?? null);
	}

	function handleDragCancel() {
		setActiveTask(null);
	}

	async function handleDragEnd(event: DragEndEvent) {
		setActiveTask(null);
		if (!event.over || !view || !data) return;
		const task = taskFromActive(event.active);
		if (!task) return;

		const target = parseDropTargetId(String(event.over.id));
		if (!target) return;

		let laneId = target.laneId;
		let bucketId = target.bucketId;
		let insertBeforeTaskKey: string | null = null;
		if (target.kind === 'before' && target.taskKey) {
			insertBeforeTaskKey = target.taskKey;
			const found = leafLanes
				.flatMap((l) => l.columns.map((c) => ({ laneId: l.id, bucket: c })))
				.find((c) => c.bucket.tasks.some((t) => `${t.taskLocation.path}:${t.taskLocation.lineNumber}` === target.taskKey));
			if (!found) return;
			laneId = found.laneId;
			bucketId = found.bucket.bucket.id;
		}
		if (!bucketId) return;

		const targetLane = leafLanes.find((l) => l.id === laneId);
		const targetColumn = targetLane?.columns.find((c) => c.bucket.id === bucketId);
		if (!targetLane || !targetColumn) return;

		const sourceLane = leafLanes.find((l) => l.columns.some((c) => c.tasks.includes(task)));
		const sourceColumn = sourceLane?.columns.find((c) => c.tasks.includes(task));
		const crossedLane = view.lanes !== null && sourceLane && sourceLane.id !== targetLane.id;
		const sameColumn = !crossedLane && sourceColumn === targetColumn;

		const insertBeforeTask = insertBeforeTaskKey
			? (targetColumn.tasks.find((t) => `${t.taskLocation.path}:${t.taskLocation.lineNumber}` === insertBeforeTaskKey) ?? null)
			: null;
		// A drop that lands back in exactly the same spot (same bucket, same position) is a true
		// no-op: no write, no id assignment, no "enable manual sort" confirmation — that should
		// only ever appear when the user actually overrides the order.
		const { newOrder, insertAt, isNoOp } = computeDropPosition(targetColumn.tasks, task, insertBeforeTask, sameColumn);
		if (isNoOp) return;

		let laneWriteValue: import('../../types/board').BucketWriteValue | null | undefined;
		if (crossedLane && view.lanes) {
			const field = laneGroupField(view.lanes.groupBy);
			laneWriteValue = field ? laneWriteValueFor(field, targetLane.label) : null;
		}

		const currentCount = targetColumn.tasks.filter((t) => t !== task).length;
		const wipMax = targetColumn.bucket.override.wip;

		const decision = decideDrop({
			task,
			columnWriteValue: targetColumn.bucket.writeValue,
			laneWriteValue,
			isBlocked: task.dependsOn.some((id) => {
				const blocker = props.allTasks.find((t) => t.id === id);
				return blocker !== undefined && blocker.status.type !== 'DONE' && blocker.status.type !== 'CANCELLED';
			}),
			blockedDropMode: resolved.blockedDropMode,
			wip: wipMax ? { countAfterMove: currentCount + 1, max: wipMax.max, mode: wipMax.mode ?? resolved.wipMode } : null,
			resolveStatus: (symbol) => resolveStatusBySymbol(props.statuses, symbol),
		});

		if (!decision.ok) {
			new Notice(decision.reason ?? 'This drop was rejected.');
			return;
		}
		if (decision.proceedWithWarning) new Notice(decision.proceedWithWarning);

		const { result } = await executeDrop(props.taskWriter, props.fieldWriter, {
			task,
			columnWriteValue: targetColumn.bucket.writeValue,
			laneWriteValue,
			isBlocked: false,
			blockedDropMode: resolved.blockedDropMode,
			resolveStatus: (symbol) => resolveStatusBySymbol(props.statuses, symbol),
		});
		if (!result?.ok) return;

		// Record manual order only for non-DONE writes (a DONE write replaces the line via the
		// API and the task naturally drops out of this bucket on the next cache refresh).
		if (targetColumn.bucket.writeValue?.kind !== 'status' || !resolveStatusBySymbol(props.statuses, targetColumn.bucket.writeValue.symbol) || !['DONE', 'CANCELLED'].includes(resolveStatusBySymbol(props.statuses, targetColumn.bucket.writeValue.symbol)!.type)) {
			let id = task.id;
			if (!id) {
				if (!props.globalSettings.idConfirmDismissed) {
					const { proceed, dontAskAgain } = await new IdConfirmModal(props.app).ask();
					if (dontAskAgain) {
						props.globalSettings.idConfirmDismissed = true;
						void props.saveGlobalSettings();
					}
					if (!proceed) return;
				}
				id = generateTaskId(props.allTasks);
				await props.taskWriter.setId(task, id);
			}
			const reordered = newOrder.map((t) => (t === task ? { ...t, id } : t));
			const override = recordOrder(reordered, insertAt);
			const existing = (view.order[bucketId] ?? []).filter((o) => o.id !== id);
			props.boardModel.setOrder(viewIndex, bucketId, [...existing, override]);
		}
	}

	if (!view || !data) {
		return <div class="tasks-board-empty">This board has no views yet.</div>;
	}

	return (
		<div class="tasks-board-shell">
			<div class="tasks-board-tabstrip">
				{boardFile.views.map((v, i) => (
					<button
						type="button"
						key={v.name + i}
						class={`tasks-board-tab${i === viewIndex ? ' is-active' : ''}`}
						onClick={() => setViewIndex(i)}
					>
						{v.name}
					</button>
				))}
				<button type="button" class="tasks-board-tab tasks-board-tab--add" onClick={() => props.boardModel.addView('New view')}>
					+
				</button>
				<div class="tasks-board-tabstrip__spacer" />
				<button
					type="button"
					class="tasks-board-toolbar-btn"
					onClick={() =>
						openBoardSettingsModal({
							app: props.app,
							boardModel: props.boardModel,
							viewIndex,
							view,
							boardFilters: boardFile.filters,
							boardSettings: boardFile.settings,
							globalSettings: props.globalSettings,
							initialTab: 'query',
						})
					}
				>
					Filter
				</button>
				<button
					type="button"
					class="tasks-board-toolbar-btn"
					aria-label="Board settings"
					onClick={() =>
						openBoardSettingsModal({
							app: props.app,
							boardModel: props.boardModel,
							viewIndex,
							view,
							boardFilters: boardFile.filters,
							boardSettings: boardFile.settings,
							globalSettings: props.globalSettings,
						})
					}
				>
					⚙
				</button>
			</div>

			{data.warnings.length > 0 ? (
				<div class="tasks-board-warnings">
					{data.warnings.map((w, i) => (
						<div key={i}>{w}</div>
					))}
				</div>
			) : null}
			{data.hiddenCount > 0 ? <div class="tasks-board-hidden-count">{data.hiddenCount} task(s) hidden (no matching column)</div> : null}

			<DndContext
				sensors={sensors}
				onDragStart={handleDragStart}
				onDragCancel={handleDragCancel}
				onDragEnd={(e: DragEndEvent) => void handleDragEnd(e)}
			>
				<div
					class="tasks-board-grid"
					style={{ '--tasks-board-columns-count': String(gridColumns.length) }}
				>
					<div class="tasks-board-grid__header">
						{gridColumns.map((col) => (
							<ColumnHeader key={col.id} column={col} tasks={columnTasksAcrossRows(flatRows, col.id)} />
						))}
					</div>
					{flatRows.map((row) => (
						<Lane
							key={row.lane.id}
							app={props.app}
							lane={row.lane}
							depth={row.depth}
							isGroupHeading={row.isGroupHeading}
							showHeader={showLaneHeaders}
							columns={gridColumns}
							chips={view.card.chips}
							ctx={ctx}
							accentRules={accentRules}
							clickAction={resolved.clickAction}
							taskWriter={props.taskWriter}
							postponeField={resolved.postponeField}
							globalFilterTag={globalFilterTag}
							collapseDefault={resolved.laneCollapseDefault}
							onToggleDone={(t) => void toggleDone(t)}
							onEdit={(t) => void editTask(t)}
							onOpenFile={openFile}
							onQuickAdd={(lId, bucketId) => void quickAdd(lId, bucketId)}
							onRemoveOrderOverride={removeOrderOverride}
						/>
					))}
				</div>
				{createPortal(
					// dnd-kit's DragOverlay positions itself with `position: fixed` but renders
					// inline in the component tree rather than portaling on its own — if any
					// ancestor between here and <body> has a CSS transform (Obsidian's workspace
					// panes routinely do, for split/resize animations), that becomes the fixed
					// element's containing block instead of the viewport, throwing the overlay's
					// position off by however far that ancestor sits from the true origin.
					// Portaling straight to document.body sidesteps that; DndContext's own React
					// context still reaches it since portals don't break context propagation.
					<DragOverlay dropAnimation={null}>
						{activeTask ? (
							<CardView
								app={props.app}
								task={activeTask}
								chips={view.card.chips}
								ctx={ctx}
								accent={matchAccent(accentRules, activeTask, ctx)}
								clickAction={resolved.clickAction}
								taskWriter={props.taskWriter}
								globalFilterTag={globalFilterTag}
								onToggleDone={() => {}}
								onEdit={() => {}}
								onOpenFile={() => {}}
								nodeRef={() => {}}
								extraClass=" tasks-board-card--overlay"
								style={{}}
								dragListeners={{}}
								dragAttributes={{}}
								dragDisabled
							/>
						) : null}
					</DragOverlay>,
					document.body,
				)}
			</DndContext>
		</div>
	);
}

export function openTaskFileFactory(app: App, resolveFile: (path: string) => TFile | null) {
	return (task: Task) => {
		const file = resolveFile(task.file.path);
		if (!file) return;
		void app.workspace.getLeaf(false).openFile(file, { eState: { line: task.taskLocation.lineNumber } });
	};
}
