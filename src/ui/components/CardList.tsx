import type { App } from 'obsidian';
import { useDroppable } from '@dnd-kit/core';
import type { Task } from '../../types/tasks';
import type { Bucket, ChipKind } from '../../types/board';
import type { QueryContext } from '../../query/context';
import type { AccentRule } from '../../settings/GlobalSettings';
import type { TaskWriter } from '../../write/TaskWriter';
import { compileAccentRules, matchAccent, type CompiledAccentRule } from '../../board/accent';
import { Card } from './Card';

export interface CardListProps {
	app: App;
	bucketId: string;
	laneId: string;
	bucket: Bucket;
	tasks: readonly Task[];
	chips: readonly ChipKind[];
	ctx: QueryContext;
	accentRules: CompiledAccentRule[];
	clickAction: 'file' | 'modal' | 'preview' | 'none';
	taskWriter: TaskWriter;
	onToggleDone: (task: Task) => void;
	onEdit: (task: Task) => void;
	onOpenFile: (task: Task) => void;
	onTagClick?: (tag: string) => void;
}

export function CardList(props: CardListProps) {
	const droppable = useDroppable({
		id: `end:${props.laneId}:${props.bucketId}`,
		data: { kind: 'end-of-list', laneId: props.laneId, bucketId: props.bucketId },
	});

	return (
		<div
			ref={droppable.setNodeRef}
			class={`tasks-board-card-list${droppable.isOver ? ' tasks-board-card-list--drop-end' : ''}`}
		>
			{props.tasks.map((task) => (
				<Card
					key={`${task.taskLocation.path}:${task.taskLocation.lineNumber}`}
					app={props.app}
					task={task}
					chips={props.chips}
					ctx={props.ctx}
					accent={matchAccent(props.accentRules, task, props.ctx)}
					clickAction={props.clickAction}
					taskWriter={props.taskWriter}
					onToggleDone={props.onToggleDone}
					onEdit={props.onEdit}
					onOpenFile={props.onOpenFile}
					onTagClick={props.onTagClick}
				/>
			))}
		</div>
	);
}

export { compileAccentRules };
