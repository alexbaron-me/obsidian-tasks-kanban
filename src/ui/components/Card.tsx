import type { App } from 'obsidian';
import { Menu, Notice, moment } from 'obsidian';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useState } from 'preact/hooks';
import type { JSX, Ref } from 'preact';
import type { Task, PriorityName } from '../../types/tasks';
import type { ChipKind } from '../../types/board';
import type { QueryContext } from '../../query/context';
import { buildChips, isBlockedDimmed } from '../../board/chips';
import type { AccentRule } from '../../settings/GlobalSettings';
import { MarkdownText } from './MarkdownText';
import type { TaskWriter } from '../../write/TaskWriter';

export interface CardProps {
	app: App;
	task: Task;
	chips: readonly ChipKind[];
	ctx: QueryContext;
	accent: AccentRule | null;
	clickAction: 'file' | 'modal' | 'preview' | 'none';
	taskWriter: TaskWriter;
	/** Which date field postpone acts on (cascaded setting, default "due"). */
	postponeField?: 'due' | 'scheduled';
	onToggleDone: (task: Task) => void;
	onEdit: (task: Task) => void;
	onOpenFile: (task: Task) => void;
	onTagClick?: (tag: string) => void;
	onRemoveOrderOverride?: (task: Task) => void;
	dragDisabled?: boolean;
}

export interface CardViewProps extends CardProps {
	nodeRef: Ref<HTMLDivElement>;
	extraClass: string;
	style: Record<string, string>;
	dragListeners: Partial<JSX.HTMLAttributes<HTMLDivElement>>;
	dragAttributes: Partial<JSX.HTMLAttributes<HTMLDivElement>>;
}

/**
 * Pure presentational rendering — checkbox, description (rendered/inline-edit), chips, accent,
 * context menu, keyboard nav. Deliberately has no `@dnd-kit` hook calls of its own, so it can be
 * unit-tested directly; `Card` below is the thin wrapper that supplies drag/drop wiring.
 */
export function CardView(props: CardViewProps) {
	const { task } = props;
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(task.description);

	const chips = buildChips(props.chips, task, props.ctx);
	const dimmed = isBlockedDimmed(task, props.ctx.allTasks);
	const isDone = task.status.type === 'DONE' || task.status.type === 'CANCELLED';

	function commitEdit() {
		setEditing(false);
		if (draft.trim() !== task.description) {
			void props.taskWriter.setDescription(task, draft.trim());
		}
	}

	function handleClick(e: MouseEvent) {
		if ((e.target as HTMLElement).closest('.tasks-board-card__checkbox, .tasks-board-card__menu-btn, .tasks-board-card__chip')) {
			return;
		}
		if (props.clickAction === 'file') props.onOpenFile(task);
		else if (props.clickAction === 'modal') props.onEdit(task);
	}

	function postpone(days: number) {
		const field = props.postponeField ?? 'due';
		const base = task[field].moment ?? moment();
		void props.taskWriter.setDate(task, field, base.clone().add(days, 'day'));
	}

	function postponeCustom() {
		const field = props.postponeField ?? 'due';
		const input = window.prompt('Postpone to (YYYY-MM-DD or a natural date like "next friday"):');
		if (!input) return;
		const parsed = moment(input, 'YYYY-MM-DD', true);
		void props.taskWriter.setDate(task, field, parsed.isValid() ? parsed : moment(input));
	}

	function setPriority(priority: PriorityName) {
		void props.taskWriter.setPriority(task, priority);
	}

	function copyObsidianLink() {
		const link = `obsidian://open?file=${encodeURIComponent(task.file.path)}`;
		void navigator.clipboard.writeText(link);
		new Notice('Copied link to task’s note');
	}

	function openInSplit() {
		void props.app.workspace.getLeaf('split').openFile(
			props.app.vault.getFileByPath(task.file.path) as never,
			{ eState: { line: task.taskLocation.lineNumber } },
		);
	}

	function handleContextMenu(e: MouseEvent) {
		e.preventDefault();
		const menu = new Menu();
		menu.addItem((item) => item.setTitle(isDone ? 'Mark not done' : 'Mark done').onClick(() => props.onToggleDone(task)));
		menu.addItem((item) => item.setTitle('Postpone +1 day').onClick(() => postpone(1)));
		menu.addItem((item) => item.setTitle('Postpone +1 week').onClick(() => postpone(7)));
		menu.addItem((item) => item.setTitle('Postpone to…').onClick(() => postponeCustom()));
		menu.addSeparator();
		menu.addItem((item) => item.setTitle('Priority: highest').onClick(() => setPriority('highest')));
		menu.addItem((item) => item.setTitle('Priority: high').onClick(() => setPriority('high')));
		menu.addItem((item) => item.setTitle('Priority: medium').onClick(() => setPriority('medium')));
		menu.addItem((item) => item.setTitle('Priority: low').onClick(() => setPriority('low')));
		menu.addItem((item) => item.setTitle('Priority: none').onClick(() => setPriority('none')));
		menu.addSeparator();
		menu.addItem((item) => item.setTitle('Edit task…').onClick(() => props.onEdit(task)));
		menu.addItem((item) => item.setTitle('Open source note').onClick(() => props.onOpenFile(task)));
		menu.addItem((item) => item.setTitle('Open in split').onClick(() => openInSplit()));
		menu.addItem((item) => item.setTitle('Copy Obsidian link').onClick(() => copyObsidianLink()));
		if (task.id && props.onRemoveOrderOverride) {
			menu.addSeparator();
			menu.addItem((item) => item.setTitle('Remove manual order override').onClick(() => props.onRemoveOrderOverride?.(task)));
		}
		menu.showAtMouseEvent(e);
	}

	function focusSibling(current: HTMLElement, offset: 1 | -1) {
		const list = current.closest('.tasks-board-card-list');
		if (!list) return;
		const cards = Array.from(list.querySelectorAll<HTMLElement>('.tasks-board-card'));
		const idx = cards.indexOf(current);
		const next = cards[idx + offset];
		next?.focus();
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (editing) return;
		const el = e.currentTarget as HTMLElement;
		switch (e.key) {
			case ' ':
				e.preventDefault();
				props.onToggleDone(task);
				break;
			case 'Enter':
				e.preventDefault();
				if (props.clickAction === 'file') props.onOpenFile(task);
				else if (props.clickAction === 'modal') props.onEdit(task);
				break;
			case 'e':
			case 'E':
				e.preventDefault();
				props.onEdit(task);
				break;
			case 'Escape':
				el.blur();
				break;
			case 'ArrowUp':
			case 'ArrowLeft':
				e.preventDefault();
				focusSibling(el, -1);
				break;
			case 'ArrowDown':
			case 'ArrowRight':
				e.preventDefault();
				focusSibling(el, 1);
				break;
		}
	}

	return (
		<div
			ref={props.nodeRef}
			class={`tasks-board-card${dimmed ? ' tasks-board-card--blocked' : ''}${props.extraClass}`}
			style={props.style}
			data-task-id={task.id || undefined}
			tabIndex={0}
			onClick={handleClick}
			onContextMenu={handleContextMenu}
			onKeyDown={handleKeyDown}
			{...(props.dragDisabled ? {} : props.dragListeners)}
			{...props.dragAttributes}
		>
			<div class="tasks-board-card__row">
				<input
					type="checkbox"
					class="tasks-board-card__checkbox"
					checked={isDone}
					onChange={() => props.onToggleDone(task)}
				/>
				{editing ? (
					<textarea
						class="tasks-board-card__edit"
						value={draft}
						onInput={(e) => setDraft((e.target as HTMLTextAreaElement).value)}
						onBlur={commitEdit}
						onKeyDown={(e) => {
							if (e.key === 'Enter' && !e.shiftKey) {
								e.preventDefault();
								commitEdit();
							} else if (e.key === 'Escape') {
								setDraft(task.description);
								setEditing(false);
							}
						}}
						ref={(el) => el?.focus()}
					/>
				) : (
					<div
						class="tasks-board-card__description"
						onClick={(e) => {
							e.stopPropagation();
							setDraft(task.description);
							setEditing(true);
						}}
					>
						<MarkdownText app={props.app} markdown={task.description} sourcePath={task.file.path} />
					</div>
				)}
				<button
					type="button"
					class="tasks-board-card__menu-btn"
					aria-label="Task menu"
					onClick={(e) => handleContextMenu(e)}
				>
					⋯
				</button>
			</div>
			{chips.length > 0 ? (
				<div class="tasks-board-card__chips">
					{chips.map((chip, i) => (
						<span
							key={`${chip.kind}-${i}`}
							class={`tasks-board-card__chip tasks-board-chip--${chip.kind} tasks-board-chip--${chip.variant}`}
							onClick={(e) => {
								if (chip.tag && props.onTagClick) {
									e.stopPropagation();
									props.onTagClick(chip.tag);
								}
							}}
						>
							{chip.icon ? `${chip.icon} ` : ''}
							{chip.label}
						</span>
					))}
				</div>
			) : null}
		</div>
	);
}

/** Thin drag/drop wrapper around CardView: supplies the dnd-kit draggable ref/listeners (whole
 * card is a drag handle) and a droppable "insert before this card" zone. */
export function Card(props: CardProps) {
	const { task } = props;
	const draggable = useDraggable({ id: `card:${task.taskLocation.path}:${task.taskLocation.lineNumber}`, data: { task } });
	const droppable = useDroppable({ id: `before:${task.taskLocation.path}:${task.taskLocation.lineNumber}`, data: { task, kind: 'before-card' } });

	const style: Record<string, string> = {};
	if (props.accent) {
		style['borderLeftColor'] = `var(${props.accent.cssVar})`;
		style['backgroundColor'] = `rgba(var(${props.accent.cssVar}-rgb, 0,0,0), 0.08)`;
	}
	if (draggable.transform) {
		style['transform'] = `translate3d(${draggable.transform.x}px, ${draggable.transform.y}px, 0)`;
	}

	const extraClass = `${draggable.isDragging ? ' tasks-board-card--dragging' : ''}${droppable.isOver ? ' tasks-board-card--drop-before' : ''}`;

	return (
		<CardView
			{...props}
			nodeRef={(el) => {
				draggable.setNodeRef(el);
				droppable.setNodeRef(el);
			}}
			extraClass={extraClass}
			style={style}
			dragListeners={draggable.listeners as unknown as Partial<JSX.HTMLAttributes<HTMLDivElement>>}
			dragAttributes={draggable.attributes as unknown as Partial<JSX.HTMLAttributes<HTMLDivElement>>}
		/>
	);
}

export function rejectDropNotice(reason: string): void {
	new Notice(reason);
}
