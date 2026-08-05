import moment from 'moment';
import { parseQuery } from '../query/parse';
import type { GroupField } from '../query/parse';
import type { BucketWriteValue } from '../types/board';

/** The single field a `group by …` instruction groups on, or null if it isn't a plain
 * `group by <field>` instruction (e.g. `group by function`, or a boolean/malformed line). */
export function laneGroupField(groupByText: string): GroupField | null {
	const { instructions } = parseQuery(groupByText);
	const first = instructions[0];
	return first?.kind === 'group-by' ? first.field : null;
}

/**
 * Inverts a lane key back into a BucketWriteValue for cross-lane drag (§10). Only priority,
 * tags, due and scheduled are invertible from their group key without ambiguity — status lanes
 * group by *name*, not the writable symbol, and path/folder/filename/heading are structural, so
 * those lanes reject cross-lane drops (return null) while within-lane column moves stay allowed.
 */
export function laneWriteValueFor(field: GroupField, laneKey: string): BucketWriteValue | null {
	switch (field) {
		case 'priority':
			return { kind: 'priority', value: laneKey };
		case 'tags':
			return { kind: 'tags', add: laneKey, removeOthers: [] };
		case 'due':
		case 'scheduled': {
			if (laneKey === '(no date)') return { kind: 'date', field, value: null };
			const m = moment(laneKey, 'YYYY-MM-DD', true);
			return m.isValid() ? { kind: 'date', field, value: m } : null;
		}
		default:
			return null;
	}
}
