import { describe, expect, it } from 'vitest';
import { moment } from 'obsidian';
import { applyAutoHide } from '../../src/board/autoHide';
import { makeTask, todayStr } from '../fixtures/tasks';

const TODAY = moment(todayStr());

describe('applyAutoHide', () => {
	it('hides a DONE task completed long ago', () => {
		const task = makeTask({ status: 'x', done: todayStr(-30) });
		expect(applyAutoHide([task], 14, TODAY)).toEqual([]);
	});

	it('keeps a DONE task completed recently', () => {
		const task = makeTask({ status: 'x', done: todayStr(-1) });
		expect(applyAutoHide([task], 14, TODAY)).toEqual([task]);
	});

	it('keeps a DONE task completed exactly at the boundary', () => {
		const task = makeTask({ status: 'x', done: todayStr(-14) });
		expect(applyAutoHide([task], 14, TODAY)).toEqual([task]);
	});

	it('hides a CANCELLED task completed long ago, using the cancelled date', () => {
		const task = makeTask({ status: '-', cancelled: todayStr(-30) });
		expect(applyAutoHide([task], 14, TODAY)).toEqual([]);
	});

	it('never hides a completed task with no completion date', () => {
		const task = makeTask({ status: 'x', done: null });
		expect(applyAutoHide([task], 14, TODAY)).toEqual([task]);
	});

	it('never touches an incomplete task regardless of age', () => {
		const task = makeTask({ status: ' ' });
		expect(applyAutoHide([task], 1, TODAY)).toEqual([task]);
	});

	it('hideDoneAfterDays 0 disables auto-hide entirely', () => {
		const task = makeTask({ status: 'x', done: todayStr(-999) });
		expect(applyAutoHide([task], 0, TODAY)).toEqual([task]);
	});
});
