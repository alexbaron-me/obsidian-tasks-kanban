import { describe, expect, it } from 'vitest';
import { parseQuery } from '../../src/query/parse';

function single(source: string) {
	const { instructions, errors } = parseQuery(source);
	expect(errors).toEqual([]);
	expect(instructions).toHaveLength(1);
	return instructions[0]!;
}

function expectError(source: string, messagePattern?: RegExp) {
	const { instructions, errors } = parseQuery(source);
	expect(instructions).toHaveLength(0);
	expect(errors).toHaveLength(1);
	if (messagePattern) expect(errors[0]!.message).toMatch(messagePattern);
	return errors[0]!;
}

describe('status instructions', () => {
	it('parses done', () => {
		expect(single('done')).toEqual({ kind: 'status-done', negate: false });
	});
	it('parses not done', () => {
		expect(single('not done')).toEqual({ kind: 'status-done', negate: true });
	});
	it('parses status.type is TODO', () => {
		expect(single('status.type is TODO')).toEqual({ kind: 'status-type', value: 'TODO' });
	});
	it('parses status.type is IN_PROGRESS', () => {
		expect(single('status.type is IN_PROGRESS')).toEqual({ kind: 'status-type', value: 'IN_PROGRESS' });
	});
	it('parses status.type is DONE', () => {
		expect(single('status.type is DONE')).toEqual({ kind: 'status-type', value: 'DONE' });
	});
	it('parses status.type is CANCELLED', () => {
		expect(single('status.type is CANCELLED')).toEqual({ kind: 'status-type', value: 'CANCELLED' });
	});
	it('parses status.type is NON_TASK', () => {
		expect(single('status.type is NON_TASK')).toEqual({ kind: 'status-type', value: 'NON_TASK' });
	});
	it('rejects an invalid status.type value', () => {
		expectError('status.type is BOGUS');
	});
	it('parses status.name includes', () => {
		expect(single('status.name includes Waiting')).toEqual({ kind: 'status-name-includes', text: 'Waiting' });
	});
});

describe('date instructions', () => {
	it('parses has due date', () => {
		expect(single('has due date')).toEqual({ kind: 'has-date', field: 'due', has: true });
	});
	it('parses no scheduled date', () => {
		expect(single('no scheduled date')).toEqual({ kind: 'has-date', field: 'scheduled', has: false });
	});
	it('parses due before <date>', () => {
		expect(single('due before 2026-08-14')).toEqual({
			kind: 'date-compare',
			field: 'due',
			op: 'before',
			dateText: '2026-08-14',
		});
	});
	it('parses due after <date>', () => {
		expect(single('due after tomorrow')).toEqual({
			kind: 'date-compare',
			field: 'due',
			op: 'after',
			dateText: 'tomorrow',
		});
	});
	it('parses scheduled on <date>', () => {
		expect(single('scheduled on today')).toEqual({
			kind: 'date-compare',
			field: 'scheduled',
			op: 'on',
			dateText: 'today',
		});
	});
	it('parses start on or before <date>', () => {
		expect(single('start on or before next friday')).toEqual({
			kind: 'date-compare',
			field: 'start',
			op: 'on-or-before',
			dateText: 'next friday',
		});
	});
	it('parses done on or after <date>', () => {
		expect(single('done on or after 2026-01-01')).toEqual({
			kind: 'date-compare',
			field: 'done',
			op: 'on-or-after',
			dateText: '2026-01-01',
		});
	});
	it('parses cancelled before <date>', () => {
		expect(single('cancelled before 2026-01-01').kind).toBe('date-compare');
	});
	it('parses happens after <date>', () => {
		expect(single('happens after 2026-01-01').kind).toBe('date-compare');
	});
	it('parses created on <date>', () => {
		expect(single('created on 2026-01-01').kind).toBe('date-compare');
	});
	it('parses a date range with two single-word dates', () => {
		expect(single('due in today tomorrow')).toEqual({
			kind: 'date-range',
			field: 'due',
			fromText: 'today',
			toText: 'tomorrow',
		});
	});
	it('parses a date range with multi-word natural dates', () => {
		expect(single('due in next monday next friday')).toEqual({
			kind: 'date-range',
			field: 'due',
			fromText: 'next monday',
			toText: 'next friday',
		});
	});
});

describe('priority instructions', () => {
	it('parses priority is <value>', () => {
		expect(single('priority is high')).toEqual({ kind: 'priority', mod: null, value: 'high' });
	});
	it('parses priority is above <value>', () => {
		expect(single('priority is above medium')).toEqual({ kind: 'priority', mod: 'above', value: 'medium' });
	});
	it('parses priority is below <value>', () => {
		expect(single('priority is below medium')).toEqual({ kind: 'priority', mod: 'below', value: 'medium' });
	});
	it('parses priority is not <value>', () => {
		expect(single('priority is not none')).toEqual({ kind: 'priority', mod: 'not', value: 'none' });
	});
	it('rejects an invalid priority value', () => {
		expectError('priority is enormous');
	});
});

describe('text instructions', () => {
	it('parses description includes', () => {
		expect(single('description includes urgent')).toEqual({
			kind: 'text-match',
			field: 'description',
			includes: true,
			text: 'urgent',
		});
	});
	it('parses description does not include', () => {
		expect(single('description does not include urgent')).toEqual({
			kind: 'text-match',
			field: 'description',
			includes: false,
			text: 'urgent',
		});
	});
	it('parses path includes', () => {
		expect(single('path includes Projects/')).toEqual({
			kind: 'text-match',
			field: 'path',
			includes: true,
			text: 'Projects/',
		});
	});
	it('parses folder includes', () => {
		expect(single('folder includes Projects')).toMatchObject({ field: 'folder', includes: true });
	});
	it('parses filename includes', () => {
		expect(single('filename includes index')).toMatchObject({ field: 'filename', includes: true });
	});
	it('parses heading includes', () => {
		expect(single('heading includes Backlog')).toMatchObject({ field: 'heading', includes: true });
	});
	it('parses description regex matches', () => {
		expect(single('description regex matches /^Fix.*bug$/i')).toEqual({
			kind: 'regex-match',
			pattern: '^Fix.*bug$',
			flags: 'i',
		});
	});
	it('parses description regex matches with no flags', () => {
		expect(single('description regex matches /foo/')).toEqual({
			kind: 'regex-match',
			pattern: 'foo',
			flags: '',
		});
	});
	it('parses tag includes', () => {
		expect(single('tag includes #work')).toEqual({ kind: 'tag-match', includes: true, tag: '#work' });
	});
	it('parses tag does not include', () => {
		expect(single('tag does not include #work')).toEqual({ kind: 'tag-match', includes: false, tag: '#work' });
	});
	it('parses tags include', () => {
		expect(single('tags include #work')).toEqual({ kind: 'tag-match', includes: true, tag: '#work' });
	});
	it('parses tags do not include', () => {
		expect(single('tags do not include #work')).toEqual({ kind: 'tag-match', includes: false, tag: '#work' });
	});
});

describe('recurrence and dependency instructions', () => {
	it('parses is recurring', () => {
		expect(single('is recurring')).toEqual({ kind: 'recurring', negate: false });
	});
	it('parses is not recurring', () => {
		expect(single('is not recurring')).toEqual({ kind: 'recurring', negate: true });
	});
	it('parses is blocked', () => {
		expect(single('is blocked')).toEqual({ kind: 'blocked', negate: false });
	});
	it('parses is not blocked', () => {
		expect(single('is not blocked')).toEqual({ kind: 'blocked', negate: true });
	});
	it('parses is blocking', () => {
		expect(single('is blocking')).toEqual({ kind: 'blocking', negate: false });
	});
	it('parses is not blocking', () => {
		expect(single('is not blocking')).toEqual({ kind: 'blocking', negate: true });
	});
});

describe('function instructions', () => {
	it('parses filter by function', () => {
		expect(single('filter by function task.priorityNumber < 2')).toEqual({
			kind: 'filter-function',
			expr: 'task.priorityNumber < 2',
		});
	});
	it('parses sort by function', () => {
		expect(single('sort by function task.description.length')).toEqual({
			kind: 'sort-function',
			expr: 'task.description.length',
		});
	});
	it('parses group by function', () => {
		expect(single('group by function task.file.folder')).toEqual({
			kind: 'group-function',
			expr: 'task.file.folder',
		});
	});
});

describe('sort by instructions', () => {
	const fields = ['due', 'scheduled', 'start', 'created', 'done', 'priority', 'urgency', 'description', 'path', 'status'];
	for (const field of fields) {
		it(`parses sort by ${field}`, () => {
			expect(single(`sort by ${field}`)).toEqual({ kind: 'sort-by', field, reverse: false });
		});
	}
	it('parses sort by due reverse', () => {
		expect(single('sort by due reverse')).toEqual({ kind: 'sort-by', field: 'due', reverse: true });
	});
});

describe('group by instructions', () => {
	const fields = ['status', 'status.name', 'status.type', 'priority', 'tags', 'path', 'folder', 'filename', 'heading', 'due', 'scheduled', 'happens'];
	for (const field of fields) {
		it(`parses group by ${field}`, () => {
			expect(single(`group by ${field}`)).toEqual({ kind: 'group-by', field, reverse: false });
		});
	}
	it('parses group by tags reverse', () => {
		expect(single('group by tags reverse')).toEqual({ kind: 'group-by', field: 'tags', reverse: true });
	});
});

describe('unsupported instructions are reported as clear errors', () => {
	for (const kw of ['limit 10', 'limit groups 5', 'hide due date', 'show due date', 'short mode', 'explain', 'ignore global query']) {
		it(`reports "${kw}" as unsupported`, () => {
			expectError(kw, /not supported/);
		});
	}
});

describe('boolean combination', () => {
	it('parses AND of two groups', () => {
		expect(single('(done) AND (priority is high)')).toEqual({
			kind: 'and',
			left: { kind: 'status-done', negate: false },
			right: { kind: 'priority', mod: null, value: 'high' },
		});
	});
	it('parses OR of two groups', () => {
		expect(single('(done) OR (is recurring)')).toEqual({
			kind: 'or',
			left: { kind: 'status-done', negate: false },
			right: { kind: 'recurring', negate: false },
		});
	});
	it('parses XOR of two groups', () => {
		expect(single('(done) XOR (is recurring)').kind).toBe('xor');
	});
	it('parses NOT of a group', () => {
		expect(single('NOT (done)')).toEqual({ kind: 'not', operand: { kind: 'status-done', negate: false } });
	});
	it('parses arbitrary nesting depth', () => {
		const instr = single('((done) AND (is recurring)) OR (is blocked)');
		expect(instr.kind).toBe('or');
		if (instr.kind === 'or') {
			expect(instr.left).toEqual({
				kind: 'and',
				left: { kind: 'status-done', negate: false },
				right: { kind: 'recurring', negate: false },
			});
			expect(instr.right).toEqual({ kind: 'blocked', negate: false });
		}
	});
	it('rejects unparenthesized mixed expressions', () => {
		expectError('status.type is TODO AND priority is high');
	});
	it('rejects an operand missing its parens inside a boolean line', () => {
		expectError('(done) AND priority is high');
	});
	it('rejects a boolean line with an unmatched paren', () => {
		expectError('(done');
	});
});

describe('tolerant parsing across multiple lines', () => {
	it('skips a bad line but keeps the good ones, with the error line number recorded', () => {
		const { instructions, errors } = parseQuery('done\nnot a real instruction\npriority is high');
		expect(instructions).toHaveLength(2);
		expect(errors).toHaveLength(1);
		expect(errors[0]!.line).toBe(2);
	});

	it('ignores blank lines and comments', () => {
		const { instructions, errors } = parseQuery('# a header\ndone\n\n# another comment\nis recurring');
		expect(errors).toEqual([]);
		expect(instructions).toHaveLength(2);
	});

	it('reports an unrecognised instruction with a clear message', () => {
		expectError('this is nonsense', /Unrecognised instruction/);
	});
});
