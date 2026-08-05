import { describe, expect, it } from 'vitest';
import { App } from 'obsidian';
import { TasksConfig } from '../../src/integration/TasksConfig';
import { DEFAULT_STATUSES } from '../../src/types/tasks';

describe('TasksConfig', () => {
	it('falls back to defaults when the Tasks plugin is absent', async () => {
		const app = new App();
		const config = new TasksConfig(app);
		const result = await config.refresh();
		expect(result.statuses).toEqual(DEFAULT_STATUSES);
		expect(result.taskFormat).toBe('tasksPluginEmoji');
	});

	it('prefers in-memory plugin settings over the persisted file', async () => {
		const app = new App();
		app.plugins.plugins['obsidian-tasks-plugin'] = {
			settings: {
				statusSettings: {
					coreStatuses: [{ symbol: ' ', name: 'Todo', type: 'TODO', nextStatusSymbol: 'x' }],
					customStatuses: [{ symbol: '!', name: 'Important', type: 'TODO', nextStatusSymbol: 'x' }],
				},
				taskFormat: 'dataview',
				setDoneDate: false,
				setCancelledDate: true,
			},
		};
		const config = new TasksConfig(app);
		const result = await config.refresh();
		expect(result.statuses).toHaveLength(2);
		expect(result.statuses[1]).toEqual({ symbol: '!', name: 'Important', type: 'TODO', nextStatusSymbol: 'x' });
		expect(result.taskFormat).toBe('dataview');
		expect(result.setDoneDate).toBe(false);
		expect(result.setCancelledDate).toBe(true);
	});

	it('reads the persisted data.json when no in-memory plugin is present', async () => {
		const app = new App();
		app.vault.adapter.read = async () =>
			JSON.stringify({
				statusSettings: {
					coreStatuses: [{ symbol: ' ', name: 'Todo', type: 'TODO', nextStatusSymbol: 'x' }],
					customStatuses: [],
				},
				taskFormat: 'tasksPluginEmoji',
			});
		const config = new TasksConfig(app);
		const result = await config.refresh();
		expect(result.statuses).toHaveLength(1);
	});

	it('falls back to defaults when the persisted file is malformed', async () => {
		const app = new App();
		app.vault.adapter.read = async () => 'not json';
		const config = new TasksConfig(app);
		const result = await config.refresh();
		expect(result.statuses).toEqual(DEFAULT_STATUSES);
	});
});
