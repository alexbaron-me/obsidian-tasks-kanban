import { parseQuery, type SortField } from '../query/parse';

export interface SortRow {
	field: SortField;
	reverse: boolean;
}

export const SORT_FIELDS: readonly SortField[] = [
	'due',
	'scheduled',
	'start',
	'created',
	'done',
	'priority',
	'urgency',
	'description',
	'path',
	'status',
];

export function defaultSortRow(): SortRow {
	return { field: 'due', reverse: false };
}

export function rowsToSortText(rows: readonly SortRow[]): string {
	return rows.map((r) => `sort by ${r.field}${r.reverse ? ' reverse' : ''}`).join('\n');
}

export interface SortTextToRowsResult {
	rows: SortRow[];
	/** False when the text isn't purely a sequence of `sort by <field> [reverse]` lines (e.g. it
	 * uses `sort by function`, or has a parse error) — switching to visual mode would drop it. */
	fullyRepresented: boolean;
}

export function sortTextToRows(text: string): SortTextToRowsResult {
	const trimmed = text.trim();
	if (trimmed === '') return { rows: [], fullyRepresented: true };
	const { instructions, errors } = parseQuery(text);
	if (errors.length > 0) return { rows: [], fullyRepresented: false };
	const rows: SortRow[] = [];
	for (const instr of instructions) {
		if (instr.kind !== 'sort-by') return { rows: [], fullyRepresented: false };
		rows.push({ field: instr.field, reverse: instr.reverse });
	}
	return { rows, fullyRepresented: true };
}
