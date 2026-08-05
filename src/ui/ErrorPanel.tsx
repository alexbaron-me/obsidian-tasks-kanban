import type { VNode } from 'preact';

export interface ErrorPanelProps {
	title: string;
	message: string;
	installUrl?: string;
	onRetry?: () => void;
}

const TASKS_PLUGIN_URL = 'obsidian://show-plugin?id=obsidian-tasks-plugin';

export function ErrorPanel(props: ErrorPanelProps): VNode {
	return (
		<div class="tasks-board-error-panel">
			<h2>{props.title}</h2>
			<p>{props.message}</p>
			{props.installUrl !== undefined ? (
				<a class="tasks-board-error-panel__link" href={props.installUrl ?? TASKS_PLUGIN_URL}>
					Install the Tasks plugin
				</a>
			) : null}
			{props.onRetry ? (
				<button class="tasks-board-error-panel__retry" onClick={props.onRetry} type="button">
					Retry
				</button>
			) : null}
		</div>
	);
}

export function TasksPluginMissingPanel(): VNode {
	return (
		<ErrorPanel
			title="Tasks Board needs the Tasks plugin"
			message="Tasks Board renders your tasks from the Obsidian Tasks plugin's cache. Install and enable Tasks to use this board."
			installUrl={TASKS_PLUGIN_URL}
		/>
	);
}

export function WaitingForTasksPanel(props: { onRetry: () => void }): VNode {
	return (
		<ErrorPanel
			title="Waiting for the Tasks plugin…"
			message="The Tasks plugin hasn't reported its cache yet. This can take a while on a large vault."
			onRetry={props.onRetry}
		/>
	);
}

export function BoardParseErrorPanel(props: { error: string; raw: string; onSave: (raw: string) => void }): VNode {
	return (
		<div class="tasks-board-error-panel tasks-board-error-panel--parse">
			<h2>This .board file could not be parsed</h2>
			<p>{props.error}</p>
			<p class="tasks-board-error-panel__hint">
				Fix the YAML below and save to re-render. Nothing will be overwritten automatically.
			</p>
			<textarea
				class="tasks-board-error-panel__editor"
				value={props.raw}
				onChange={(e) => props.onSave((e.target as HTMLTextAreaElement).value)}
			/>
		</div>
	);
}
