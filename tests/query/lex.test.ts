import { describe, expect, it } from 'vitest';
import { splitLines, tokenizeBooleanLine } from '../../src/query/lex';

describe('splitLines', () => {
	it('drops blank lines', () => {
		expect(splitLines('done\n\n\nnot done')).toEqual([
			{ lineNumber: 1, text: 'done' },
			{ lineNumber: 4, text: 'not done' },
		]);
	});

	it('drops comment lines starting with #', () => {
		expect(splitLines('# a comment\ndone')).toEqual([{ lineNumber: 2, text: 'done' }]);
	});

	it('trims surrounding whitespace and preserves line numbers', () => {
		expect(splitLines('  done  \n  not done')).toEqual([
			{ lineNumber: 1, text: 'done' },
			{ lineNumber: 2, text: 'not done' },
		]);
	});
});

describe('tokenizeBooleanLine', () => {
	it('returns null for a plain instruction line', () => {
		expect(tokenizeBooleanLine('done')).toBeNull();
	});

	it('returns null for a line with no leading paren', () => {
		expect(tokenizeBooleanLine('priority is high AND (done)')).toBeNull();
	});

	it('tokenizes a single group', () => {
		expect(tokenizeBooleanLine('(done)')).toEqual([{ type: 'GROUP', text: 'done' }]);
	});

	it('tokenizes AND between two groups', () => {
		expect(tokenizeBooleanLine('(done) AND (priority is high)')).toEqual([
			{ type: 'GROUP', text: 'done' },
			{ type: 'AND' },
			{ type: 'GROUP', text: 'priority is high' },
		]);
	});

	it('tokenizes NOT prefixing a group', () => {
		expect(tokenizeBooleanLine('NOT (done)')).toEqual([{ type: 'NOT' }, { type: 'GROUP', text: 'done' }]);
	});

	it('tokenizes nested groups, preserving inner parens as raw text', () => {
		expect(tokenizeBooleanLine('((done) AND (is recurring)) OR (is blocked)')).toEqual([
			{ type: 'GROUP', text: '(done) AND (is recurring)' },
			{ type: 'OR' },
			{ type: 'GROUP', text: 'is blocked' },
		]);
	});

	it('throws on an unmatched opening paren', () => {
		expect(() => tokenizeBooleanLine('(done')).toThrow(/Unmatched/);
	});

	it('throws on trailing unparenthesized text', () => {
		expect(() => tokenizeBooleanLine('(done) AND priority is high')).toThrow(/parenthesized/);
	});
});
