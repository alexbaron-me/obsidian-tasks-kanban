import { describe, expect, it } from 'vitest';
import { moment } from 'obsidian';
import { FieldWriter } from '../../src/write/FieldWriter';

describe('FieldWriter — emoji format', () => {
	const w = new FieldWriter('emoji');

	it('adds a due date to a bare line', () => {
		expect(w.setDate('- [ ] Buy milk', 'due', moment('2026-08-14'))).toBe('- [ ] Buy milk 📅 2026-08-14');
	});

	it('replaces an existing due date in place', () => {
		expect(w.setDate('- [ ] Buy milk 📅 2026-08-01', 'due', moment('2026-08-14'))).toBe(
			'- [ ] Buy milk 📅 2026-08-14',
		);
	});

	it('removes a due date and collapses whitespace', () => {
		expect(w.setDate('- [ ] Buy milk 📅 2026-08-01 🆔 abc123', 'due', null)).toBe('- [ ] Buy milk 🆔 abc123');
	});

	it('sets priority to the correct emoji per name', () => {
		expect(w.setPriority('- [ ] Task', 'high')).toBe('- [ ] Task ⏫');
		expect(w.setPriority('- [ ] Task', 'highest')).toBe('- [ ] Task 🔺');
		expect(w.setPriority('- [ ] Task', 'lowest')).toBe('- [ ] Task ⏬');
	});

	it('setting priority to none removes the priority emoji', () => {
		expect(w.setPriority('- [ ] Task ⏫', 'none')).toBe('- [ ] Task');
	});

	it('replaces an existing priority in place', () => {
		expect(w.setPriority('- [ ] Task ⏫ 📅 2026-08-01', 'low')).toBe('- [ ] Task 🔽 📅 2026-08-01');
	});

	it('sets an id', () => {
		expect(w.setId('- [ ] Task', 'ab12cd')).toBe('- [ ] Task 🆔 ab12cd');
	});

	it('replaces an existing id', () => {
		expect(w.setId('- [ ] Task 🆔 old123', 'new456')).toBe('- [ ] Task 🆔 new456');
	});

	it('inserts new fields before a trailing block reference', () => {
		expect(w.setId('- [ ] Task ^abc123', 'ab12cd')).toBe('- [ ] Task 🆔 ab12cd ^abc123');
	});

	it('inserts fields in canonical order (priority before due before id)', () => {
		let line = '- [ ] Task';
		line = w.setId(line, 'zz9999');
		line = w.setDate(line, 'due', moment('2026-08-14'));
		line = w.setPriority(line, 'high');
		expect(line).toBe('- [ ] Task ⏫ 📅 2026-08-14 🆔 zz9999');
	});

	it('adds a tag that is not yet present', () => {
		expect(w.addTag('- [ ] Task', '#work')).toBe('- [ ] Task #work');
	});

	it('does not duplicate a tag already present', () => {
		expect(w.addTag('- [ ] Task #work', '#work')).toBe('- [ ] Task #work');
	});

	it('normalizes a tag missing its leading #', () => {
		expect(w.addTag('- [ ] Task', 'work')).toBe('- [ ] Task #work');
	});

	it('removes a tag and collapses whitespace', () => {
		expect(w.removeTag('- [ ] Task #work #home', '#work')).toBe('- [ ] Task #home');
	});

	it('setStatusSymbol swaps only the status marker', () => {
		expect(w.setStatusSymbol('- [ ] Task 📅 2026-08-14', 'x')).toBe('- [x] Task 📅 2026-08-14');
	});

	it('setStatusSymbol preserves list marker and indentation', () => {
		expect(w.setStatusSymbol('    * [ ] Nested task', '/')).toBe('    * [/] Nested task');
	});

	it('setStatusSymbol rejects a non-checklist line', () => {
		expect(() => w.setStatusSymbol('Just a paragraph', 'x')).toThrow();
	});
});

describe('FieldWriter — dataview format', () => {
	const w = new FieldWriter('dataview');

	it('adds a due date as an inline field', () => {
		expect(w.setDate('- [ ] Buy milk', 'due', moment('2026-08-14'))).toBe('- [ ] Buy milk [due:: 2026-08-14]');
	});

	it('replaces an existing dataview due date in place', () => {
		expect(w.setDate('- [ ] Buy milk [due:: 2026-08-01]', 'due', moment('2026-08-14'))).toBe(
			'- [ ] Buy milk [due:: 2026-08-14]',
		);
	});

	it('sets priority as a named inline field', () => {
		expect(w.setPriority('- [ ] Task', 'medium')).toBe('- [ ] Task [priority:: medium]');
	});

	it('sets an id as an inline field', () => {
		expect(w.setId('- [ ] Task', 'ab12cd')).toBe('- [ ] Task [id:: ab12cd]');
	});

	it('inserts new fields in canonical order', () => {
		let line = '- [ ] Task';
		line = w.setId(line, 'zz9999');
		line = w.setDate(line, 'due', moment('2026-08-14'));
		line = w.setPriority(line, 'high');
		expect(line).toBe('- [ ] Task [priority:: high] [due:: 2026-08-14] [id:: zz9999]');
	});

	it('removes a dataview field cleanly', () => {
		expect(w.setDate('- [ ] Task [due:: 2026-08-14] [id:: x]', 'due', null)).toBe('- [ ] Task [id:: x]');
	});
});
