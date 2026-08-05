import { describe, expect, it } from 'vitest';
import { resolveSettings, inheritedValue } from '../../src/settings/cascade';
import { defaultGlobalSettings } from '../../src/settings/GlobalSettings';

describe('resolveSettings', () => {
	it('falls back to the global cascade defaults when nothing is set', () => {
		const global = defaultGlobalSettings();
		const resolved = resolveSettings(global, {}, {});
		expect(resolved).toEqual({
			hideDoneAfterDays: 14,
			clickAction: 'file',
			density: 'comfortable',
			wipMode: 'soft',
			blockedDropMode: 'soft',
			postponeField: 'due',
			laneCollapseDefault: false,
			quickAddTarget: null,
		});
	});

	it('a board-level setting overrides the global default', () => {
		const global = defaultGlobalSettings();
		const resolved = resolveSettings(global, { density: 'compact' }, {});
		expect(resolved.density).toBe('compact');
	});

	it('a view-level setting overrides both board and global', () => {
		const global = defaultGlobalSettings();
		const resolved = resolveSettings(global, { density: 'compact' }, { density: 'comfortable' });
		expect(resolved.density).toBe('comfortable');
	});

	it('quickAddTarget cascades view -> board -> global default target', () => {
		const global = defaultGlobalSettings();
		global.defaultQuickAddTarget = 'Inbox.md';
		expect(resolveSettings(global, {}, {}).quickAddTarget).toBe('Inbox.md');
		expect(resolveSettings(global, { quickAddTarget: 'Board.md' }, {}).quickAddTarget).toBe('Board.md');
		expect(resolveSettings(global, { quickAddTarget: 'Board.md' }, { quickAddTarget: 'View.md' }).quickAddTarget).toBe(
			'View.md',
		);
	});
});

describe('inheritedValue', () => {
	it('shows what a view would inherit if left unset', () => {
		const global = defaultGlobalSettings();
		expect(inheritedValue('density', global, { density: 'compact' })).toBe('compact');
		expect(inheritedValue('density', global, {})).toBe('comfortable');
	});
});
