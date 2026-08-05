import { Notice, type App } from 'obsidian';
import type { Moment } from 'moment';
import type { Task, TaskStatus } from '../types/tasks';
import type { PriorityName } from '../types/tasks';
import { FieldWriter } from './FieldWriter';
import { TasksApi } from '../integration/TasksApi';
import { TasksCache } from '../integration/TasksCache';

export type WriteFailureReason = 'file-missing' | 'stale' | 'rejected' | 'cancelled';

export interface WriteResult {
	ok: boolean;
	reason?: WriteFailureReason;
	message?: string;
}

const OK: WriteResult = { ok: true };

/**
 * Single entry point for every task mutation in the plugin. No component calls
 * `vault.modify`/`vault.process` directly — everything routes through here, which enforces the
 * write guard (§5.2) and the DONE-status routing table (§5.1).
 */
export class TaskWriter {
	constructor(
		private app: App,
		private fieldWriter: FieldWriter,
		private tasksApi: TasksApi,
		private tasksCache: TasksCache,
	) {}

	private async spliceLines(task: Task, newLines: string[]): Promise<WriteResult> {
		const file = this.app.vault.getFileByPath(task.taskLocation.path);
		if (!file) return { ok: false, reason: 'file-missing' };

		let result: WriteResult = OK;
		await this.app.vault.process(file, (content) => {
			const lines = content.split('\n');
			const n = task.taskLocation.lineNumber;
			if (lines[n] !== task.originalMarkdown) {
				result = { ok: false, reason: 'stale' };
				return content;
			}
			lines.splice(n, 1, ...newLines);
			return lines.join('\n');
		});

		if (!result.ok) this.handleStale();
		return result;
	}

	private async applyToLine(task: Task, transform: (line: string) => string): Promise<WriteResult> {
		return this.spliceLines(task, [transform(task.originalMarkdown)]);
	}

	private handleStale(): void {
		new Notice('Task changed on disk — board refreshing');
		this.tasksCache.requestBootstrap();
	}

	/** Any transition into a DONE-type status routes through apiV1, which owns recurrence,
	 * On Completion, and done-date formatting. The API may return two lines when a recurring
	 * task spawns its next instance — both are spliced in as one guarded write. */
	async completeTask(task: Task): Promise<WriteResult> {
		const resultLines = this.tasksApi.executeToggleTaskDoneCommand(task.originalMarkdown, task.taskLocation.path);
		if (resultLines === null) {
			return { ok: false, reason: 'rejected', message: 'Tasks plugin API is unavailable' };
		}
		return this.spliceLines(task, resultLines);
	}

	async setStatus(task: Task, status: TaskStatus): Promise<WriteResult> {
		if (status.type === 'DONE' || status.type === 'CANCELLED') {
			return this.completeTask(task);
		}
		return this.applyToLine(task, (line) => this.fieldWriter.setStatusSymbol(line, status.symbol));
	}

	async setDate(task: Task, field: 'due' | 'scheduled' | 'start', value: Moment | null): Promise<WriteResult> {
		return this.applyToLine(task, (line) => this.fieldWriter.setDate(line, field, value));
	}

	async setPriority(task: Task, priority: PriorityName | null): Promise<WriteResult> {
		return this.applyToLine(task, (line) => this.fieldWriter.setPriority(line, priority));
	}

	async setId(task: Task, id: string): Promise<WriteResult> {
		return this.applyToLine(task, (line) => this.fieldWriter.setId(line, id));
	}

	async addTag(task: Task, tag: string): Promise<WriteResult> {
		return this.applyToLine(task, (line) => this.fieldWriter.addTag(line, tag));
	}

	async removeTag(task: Task, tag: string): Promise<WriteResult> {
		return this.applyToLine(task, (line) => this.fieldWriter.removeTag(line, tag));
	}

	/** Cross-lane + column drop: both mutations must land in one file write (§10). */
	async applyMany(task: Task, transforms: ((line: string) => string)[]): Promise<WriteResult> {
		return this.applyToLine(task, (line) => transforms.reduce((acc, fn) => fn(acc), line));
	}

	/** Full-task edit via the Tasks modal (card menu, double-click, "E" shortcut). */
	async editViaModal(task: Task): Promise<WriteResult> {
		const edited = await this.tasksApi.editTaskLineModal(task.originalMarkdown);
		if (edited === null) return { ok: true, reason: 'cancelled' };
		return this.applyToLine(task, () => edited);
	}

	/** Rewrites only the description segment of a line (inline edit), preserving the status
	 * marker, all fields, and any trailing block reference. */
	async setDescription(task: Task, newDescription: string): Promise<WriteResult> {
		return this.applyToLine(task, (line) => {
			const checkboxMatch = /^(\s*[-*+] \[[^\]]*\]\s*)/.exec(line);
			if (!checkboxMatch) return line;
			const prefix = checkboxMatch[1]!;
			const rest = line.slice(prefix.length);
			// Replace the leading free-text run (up to the first recognised field marker or end)
			// with the new description, leaving everything after it untouched.
			const fieldStart = /(?:[🔺⏫🔼🔽⏬🔁➕🛫⏳📅✅❌🆔⛔]|\[\w[\w-]*::)/u.exec(rest);
			const oldDescEnd = fieldStart ? fieldStart.index : rest.length;
			const trailing = rest.slice(oldDescEnd);
			return `${prefix}${newDescription.trimEnd()}${trailing ? ' ' + trailing.trimStart() : ''}`;
		});
	}

	/** Appends a new (already-composed) task line to `path`, creating the file if necessary. */
	async appendLine(path: string, line: string): Promise<WriteResult> {
		const file = this.app.vault.getFileByPath(path);
		if (!file) {
			await this.app.vault.create(path, `${line}\n`);
			return OK;
		}
		await this.app.vault.process(file, (content) => {
			const sep = content.length === 0 || content.endsWith('\n') ? '' : '\n';
			return `${content}${sep}${line}\n`;
		});
		return OK;
	}

	/** Opens the Tasks "create task" modal and appends the result to `path`. */
	async createTaskViaModal(path: string, applyBucketValue?: (line: string) => string): Promise<WriteResult> {
		const line = await this.tasksApi.createTaskLineModal();
		if (line === null) return { ok: true, reason: 'cancelled' };
		const finalLine = applyBucketValue ? applyBucketValue(line) : line;
		return this.appendLine(path, finalLine);
	}
}
