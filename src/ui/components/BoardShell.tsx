import type { App, TFile } from 'obsidian';
import { Notice } from 'obsidian';
import { useMemo, useState } from 'preact/hooks';
import { DndContext, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import type { BoardModelState } from '../../model/BoardModel';
import type { BoardModel } from '../../model/BoardModel';
import type { Task, TaskStatus } from '../../types/tasks';
import type { ViewConfig } from '../../types/board';
import { computeBoardData } from '../../board/renderPipeline';
import { compileAccentRules } from '../../board/accent';
import { laneGroupField, laneWriteValueFor } from '../../board/laneWrite';
import { decideDrop, executeDrop, fieldWriterTransform } from '../../board/dropController';
import { recordOrder } from '../../board/order';
import { generateTaskId } from '../../write/ids';
import { IdConfirmModal } from '../../write/idConfirm';
import type { TaskWriter } from '../../write/TaskWriter';
import type { FieldWriter } from '../../write/FieldWriter';
import type { QueryContext } from '../../query/context';
import type { GlobalSettings } from '../../settings/GlobalSettings';
import { resolveSettings } from '../../settings/cascade';
import { Lane } from './Lane';
import { FilterPanel } from './FilterPanel';
import { ViewSettingsPanel } from './ViewSettingsPanel';

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
	const [showFilters, setShowFilters] = useState(false);
	const [showSettings, setShowSettings] = useState(false);

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

	const data = useMemo(() => {
		if (!view) return null;
		return computeBoardData(boardFile, view, props.allTasks, ctx, resolved);
	}, [boardFile, view, props.allTasks, ctx, resolved]);

	const availableTags = useMemo(() => {
		const set = new Set<string>();
		for (const t of props.allTasks) for (const tag of t.tags) set.add(tag);
		return [...set].sort();
	}, [props.allTasks]);

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

	async function quickAdd(laneId: string, bucketId: string) {
		if (!view) return;
		const column = data?.lanes.find((l) => l.id === laneId)?.columns.find((c) => c.bucket.id === bucketId);
		const target = resolved.quickAddTarget ?? props.containingFilePath;
		await props.taskWriter.createTaskViaModal(target, (line) => {
			if (!column?.bucket.writeValue) return line;
			return fieldWriterTransform(props.fieldWriter, column.bucket.writeValue)(line);
		});
	}

	async function handleDragEnd(event: DragEndEvent) {
		if (!event.over || !view || !data) return;
		const active = event.active as unknown as { data: { current: unknown } };
		const rawData: unknown = active.data.current;
		const task =
			typeof rawData === 'object' && rawData !== null && 'task' in rawData
				? (rawData as { task: Task }).task
				: undefined;
		if (!task) return;

		const target = parseDropTargetId(String(event.over.id));
		if (!target) return;

		let laneId = target.laneId;
		let bucketId = target.bucketId;
		let insertBeforeTaskKey: string | null = null;
		if (target.kind === 'before' && target.taskKey) {
			insertBeforeTaskKey = target.taskKey;
			const found = data.lanes
				.flatMap((l) => (l.nested ? [l, ...l.nested] : [l]))
				.flatMap((l) => l.columns.map((c) => ({ laneId: l.id, bucket: c })))
				.find((c) => c.bucket.tasks.some((t) => `${t.taskLocation.path}:${t.taskLocation.lineNumber}` === target.taskKey));
			if (!found) return;
			laneId = found.laneId;
			bucketId = found.bucket.bucket.id;
		}
		if (!bucketId) return;

		const allLanesFlat = data.lanes.flatMap((l) => (l.nested ? [l, ...l.nested] : [l]));
		const targetLane = allLanesFlat.find((l) => l.id === laneId);
		const targetColumn = targetLane?.columns.find((c) => c.bucket.id === bucketId);
		if (!targetLane || !targetColumn) return;

		const sourceLane = allLanesFlat.find((l) => l.columns.some((c) => c.tasks.includes(task)));
		const crossedLane = view.lanes !== null && sourceLane && sourceLane.id !== targetLane.id;

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
			const reordered = [...targetColumn.tasks.filter((t) => t !== task)];
			const insertAt = insertBeforeTaskKey
				? reordered.findIndex((t) => `${t.taskLocation.path}:${t.taskLocation.lineNumber}` === insertBeforeTaskKey)
				: reordered.length;
			reordered.splice(insertAt === -1 ? reordered.length : insertAt, 0, { ...task, id });
			const override = recordOrder(reordered, insertAt === -1 ? reordered.length - 1 : insertAt);
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
				<button type="button" onClick={() => setShowFilters((s) => !s)}>
					Filter
				</button>
				<button type="button" onClick={() => setShowSettings((s) => !s)}>
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

			{showFilters ? (
				<FilterPanel
					boardFilters={boardFile.filters}
					viewFilters={view.filters}
					errors={[]}
					availableTags={availableTags}
					onChangeViewFilters={(text) => props.boardModel.setViewFilters(viewIndex, text)}
					onClose={() => setShowFilters(false)}
				/>
			) : null}
			{showSettings ? (
				<ViewSettingsPanel
					globalSettings={props.globalSettings}
					boardSettings={boardFile.settings}
					viewSettings={view.settings}
					columns={view.columns}
					lanes={view.lanes}
					card={view.card}
					sort={view.sort}
					onChangeViewSettings={(patch) => props.boardModel.setViewSettings(viewIndex, patch)}
					onChangeColumns={(cols) => props.boardModel.setColumns(viewIndex, cols)}
					onChangeLanes={(lanes) => props.boardModel.setLanes(viewIndex, lanes)}
					onChangeCard={(card) => props.boardModel.setCard(viewIndex, card)}
					onChangeSort={(sort) => props.boardModel.setViewSort(viewIndex, sort)}
					onClose={() => setShowSettings(false)}
				/>
			) : null}

			<DndContext sensors={sensors} onDragEnd={(e: DragEndEvent) => void handleDragEnd(e)}>
				<div class="tasks-board-lanes">
					{data.lanes.map((lane) => (
						<Lane
							key={lane.id}
							app={props.app}
							lane={lane}
							chips={view.card.chips}
							ctx={ctx}
							accentRules={accentRules}
							clickAction={resolved.clickAction}
							taskWriter={props.taskWriter}
							collapseDefault={resolved.laneCollapseDefault}
							onToggleDone={(t) => void toggleDone(t)}
							onEdit={(t) => void editTask(t)}
							onOpenFile={openFile}
							onQuickAdd={(lId, col) => void quickAdd(lId, col.bucket.id)}
						/>
					))}
				</div>
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
