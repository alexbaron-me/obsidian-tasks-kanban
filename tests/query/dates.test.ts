import { describe, expect, it } from 'vitest';
import moment from 'moment';
import { compareDates, parseQueryDate } from '../../src/query/dates';

const ref = moment('2026-08-05');

describe('parseQueryDate', () => {
	it('parses an absolute ISO date', () => {
		const d = parseQueryDate('2026-08-14', ref);
		expect(d?.format('YYYY-MM-DD')).toBe('2026-08-14');
	});
	it('parses "today" relative to the reference date', () => {
		expect(parseQueryDate('today', ref)?.format('YYYY-MM-DD')).toBe('2026-08-05');
	});
	it('parses "tomorrow" relative to the reference date', () => {
		expect(parseQueryDate('tomorrow', ref)?.format('YYYY-MM-DD')).toBe('2026-08-06');
	});
	it('parses "next friday" relative to the reference date', () => {
		const d = parseQueryDate('next friday', ref);
		expect(d?.day()).toBe(5);
		expect(d?.isAfter(ref)).toBe(true);
	});
	it('parses "in 3 days" relative to the reference date', () => {
		expect(parseQueryDate('in 3 days', ref)?.format('YYYY-MM-DD')).toBe('2026-08-08');
	});
	it('returns null for unparseable text', () => {
		expect(parseQueryDate('not a date at all zzz', ref)).toBeNull();
	});
	it('returns null for an empty string', () => {
		expect(parseQueryDate('', ref)).toBeNull();
	});
});

describe('compareDates', () => {
	it('orders earlier before later', () => {
		expect(compareDates(moment('2026-01-01'), moment('2026-02-01'))).toBeLessThan(0);
	});
	it('treats equal dates as equal', () => {
		expect(compareDates(moment('2026-01-01'), moment('2026-01-01'))).toBe(0);
	});
	it('sorts null (undated) after any dated value', () => {
		expect(compareDates(null, moment('2026-01-01'))).toBeGreaterThan(0);
		expect(compareDates(moment('2026-01-01'), null)).toBeLessThan(0);
	});
	it('treats two nulls as equal', () => {
		expect(compareDates(null, null)).toBe(0);
	});
});
