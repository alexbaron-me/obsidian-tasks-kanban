import type { StatusType, PriorityName } from '../types/tasks';
import { parseQuery, type Instruction, type DateCompareOp } from '../query/parse';
import type { DateFieldName } from '../query/dates';
import { DATE_FIELDS } from '../query/dates';

export type FilterRowKind =
	| 'done'
	| 'statusType'
	| 'statusName'
	| 'date'
	| 'dateRange'
	| 'hasDate'
	| 'priority'
	| 'text'
	| 'regex'
	| 'tag'
	| 'recurring'
	| 'blocked'
	| 'blocking';

export type TextFilterField = 'description' | 'path' | 'folder' | 'filename' | 'heading';

/** One row in the visual filter builder — one line of query text, ANDed with every other row. */
export interface FilterRow {
	kind: FilterRowKind;
	negate: boolean;
	statusType: StatusType;
	statusNameText: string;
	dateField: DateFieldName;
	dateOp: DateCompareOp;
	dateValue: string;
	dateRangeFrom: string;
	dateRangeTo: string;
	hasDateField: DateFieldName;
	has: boolean;
	priorityMod: 'above' | 'below' | 'not' | null;
	priorityValue: PriorityName;
	textField: TextFilterField;
	textIncludes: boolean;
	textValue: string;
	regexPattern: string;
	regexFlags: string;
	tagIncludes: boolean;
	tagValue: string;
}

let rowIdCounter = 0;
export function newRowId(): number {
	return rowIdCounter++;
}

export function defaultRow(kind: FilterRowKind = 'done'): FilterRow {
	return {
		kind,
		negate: false,
		statusType: 'TODO',
		statusNameText: '',
		dateField: 'due',
		dateOp: 'before',
		dateValue: 'today',
		dateRangeFrom: 'today',
		dateRangeTo: 'today',
		hasDateField: 'due',
		has: true,
		priorityMod: null,
		priorityValue: 'high',
		textField: 'description',
		textIncludes: true,
		textValue: '',
		regexPattern: '',
		regexFlags: '',
		tagIncludes: true,
		tagValue: '',
	};
}

const DATE_OP_TEXT: Record<DateCompareOp, string> = {
	before: 'before',
	after: 'after',
	on: 'on',
	'on-or-before': 'on or before',
	'on-or-after': 'on or after',
};

export function rowToText(row: FilterRow): string {
	switch (row.kind) {
		case 'done':
			return row.negate ? 'not done' : 'done';
		case 'statusType':
			return `status.type is ${row.statusType}`;
		case 'statusName':
			return `status.name includes ${row.statusNameText}`;
		case 'date':
			return `${row.dateField} ${DATE_OP_TEXT[row.dateOp]} ${row.dateValue}`;
		case 'dateRange':
			return `${row.dateField} in ${row.dateRangeFrom} ${row.dateRangeTo}`;
		case 'hasDate':
			return `${row.has ? 'has' : 'no'} ${row.hasDateField} date`;
		case 'priority':
			return row.priorityMod ? `priority is ${row.priorityMod} ${row.priorityValue}` : `priority is ${row.priorityValue}`;
		case 'text':
			return `${row.textField} ${row.textIncludes ? 'includes' : 'does not include'} ${row.textValue}`;
		case 'regex':
			return `description regex matches /${row.regexPattern}/${row.regexFlags}`;
		case 'tag':
			return `tag ${row.tagIncludes ? 'includes' : 'does not include'} ${row.tagValue}`;
		case 'recurring':
			return row.negate ? 'is not recurring' : 'is recurring';
		case 'blocked':
			return row.negate ? 'is not blocked' : 'is blocked';
		case 'blocking':
			return row.negate ? 'is not blocking' : 'is blocking';
	}
}

export function rowsToText(rows: readonly FilterRow[]): string {
	return rows.map(rowToText).join('\n');
}

/** Converts a single parsed leaf instruction into a row, or null if it isn't representable in
 * the visual builder (boolean composition, functions, unsupported instructions). */
function instructionToRow(instr: Instruction): FilterRow | null {
	const base = defaultRow();
	switch (instr.kind) {
		case 'status-done':
			return { ...base, kind: 'done', negate: instr.negate };
		case 'status-type':
			return { ...base, kind: 'statusType', statusType: instr.value };
		case 'status-name-includes':
			return { ...base, kind: 'statusName', statusNameText: instr.text };
		case 'date-compare':
			return { ...base, kind: 'date', dateField: instr.field, dateOp: instr.op, dateValue: instr.dateText };
		case 'date-range':
			return { ...base, kind: 'dateRange', dateField: instr.field, dateRangeFrom: instr.fromText, dateRangeTo: instr.toText };
		case 'has-date':
			return { ...base, kind: 'hasDate', hasDateField: instr.field, has: instr.has };
		case 'priority':
			return { ...base, kind: 'priority', priorityMod: instr.mod, priorityValue: instr.value };
		case 'text-match':
			return { ...base, kind: 'text', textField: instr.field, textIncludes: instr.includes, textValue: instr.text };
		case 'regex-match':
			return { ...base, kind: 'regex', regexPattern: instr.pattern, regexFlags: instr.flags };
		case 'tag-match':
			return { ...base, kind: 'tag', tagIncludes: instr.includes, tagValue: instr.tag };
		case 'recurring':
			return { ...base, kind: 'recurring', negate: instr.negate };
		case 'blocked':
			return { ...base, kind: 'blocked', negate: instr.negate };
		case 'blocking':
			return { ...base, kind: 'blocking', negate: instr.negate };
		default:
			return null;
	}
}

export interface TextToRowsResult {
	rows: FilterRow[];
	/** True when every line of the source text round-trips through the visual builder losslessly
	 * (no boolean composition, functions, sort/group directives, or parse errors). False means
	 * switching to visual mode would silently drop something — callers should warn or refuse. */
	fullyRepresented: boolean;
}

/** Parses filter text into visual-builder rows on a strictly best-effort basis. */
export function textToRows(text: string): TextToRowsResult {
	const trimmed = text.trim();
	if (trimmed === '') return { rows: [], fullyRepresented: true };
	const { instructions, errors } = parseQuery(text);
	if (errors.length > 0) return { rows: [], fullyRepresented: false };
	const rows: FilterRow[] = [];
	for (const instr of instructions) {
		const row = instructionToRow(instr);
		if (!row) return { rows: [], fullyRepresented: false };
		rows.push(row);
	}
	return { rows, fullyRepresented: true };
}

export const TEXT_FILTER_FIELDS: readonly TextFilterField[] = ['description', 'path', 'folder', 'filename', 'heading'];
export const FILTER_DATE_FIELDS: readonly DateFieldName[] = DATE_FIELDS;
export const FILTER_ROW_KINDS: readonly { kind: FilterRowKind; label: string }[] = [
	{ kind: 'done', label: 'Done status' },
	{ kind: 'statusType', label: 'Status type' },
	{ kind: 'statusName', label: 'Status name includes' },
	{ kind: 'date', label: 'Date compare' },
	{ kind: 'dateRange', label: 'Date in range' },
	{ kind: 'hasDate', label: 'Has / no date' },
	{ kind: 'priority', label: 'Priority' },
	{ kind: 'text', label: 'Text' },
	{ kind: 'regex', label: 'Description regex' },
	{ kind: 'tag', label: 'Tag' },
	{ kind: 'recurring', label: 'Recurring' },
	{ kind: 'blocked', label: 'Blocked' },
	{ kind: 'blocking', label: 'Blocking' },
];
