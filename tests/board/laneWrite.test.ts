import { describe, expect, it } from 'vitest';
import { laneGroupField, laneWriteValueFor } from '../../src/board/laneWrite';

describe('laneGroupField', () => {
	it('extracts the field from a plain group by instruction', () => {
		expect(laneGroupField('group by priority')).toBe('priority');
	});
	it('returns null for group by function', () => {
		expect(laneGroupField('group by function task.file.folder')).toBeNull();
	});
	it('returns null for a malformed instruction', () => {
		expect(laneGroupField('not an instruction')).toBeNull();
	});
});

describe('laneWriteValueFor', () => {
	it('inverts a priority lane key', () => {
		expect(laneWriteValueFor('priority', 'high')).toEqual({ kind: 'priority', value: 'high' });
	});
	it('inverts a tags lane key', () => {
		expect(laneWriteValueFor('tags', '#work')).toEqual({ kind: 'tags', add: '#work', removeOthers: [] });
	});
	it('inverts a due-date lane key', () => {
		const value = laneWriteValueFor('due', '2026-08-14');
		expect(value?.kind).toBe('date');
		if (value?.kind === 'date') expect(value.value?.format('YYYY-MM-DD')).toBe('2026-08-14');
	});
	it('inverts the "(no date)" lane key to clearing the field', () => {
		expect(laneWriteValueFor('due', '(no date)')).toEqual({ kind: 'date', field: 'due', value: null });
	});
	it('returns null for a status lane (ambiguous name -> symbol)', () => {
		expect(laneWriteValueFor('status', 'Done')).toBeNull();
	});
	it('returns null for structural fields', () => {
		expect(laneWriteValueFor('folder', 'Projects')).toBeNull();
		expect(laneWriteValueFor('path', 'a.md')).toBeNull();
		expect(laneWriteValueFor('filename', 'a.md')).toBeNull();
		expect(laneWriteValueFor('heading', 'Backlog')).toBeNull();
	});
});
