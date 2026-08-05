import type { StatusType } from '../types/tasks';
import type { PriorityName } from '../types/tasks';
import moment from 'moment';
import { splitLines, tokenizeBooleanLine, type BoolToken } from './lex';
import { DATE_FIELDS, parseQueryDate, type DateFieldName } from './dates';

export interface QueryError {
	line: number;
	message: string;
}

export type DateCompareOp = 'before' | 'after' | 'on' | 'on-or-before' | 'on-or-after';

export type SortField =
	| 'due'
	| 'scheduled'
	| 'start'
	| 'created'
	| 'done'
	| 'priority'
	| 'urgency'
	| 'description'
	| 'path'
	| 'status';

export type GroupField =
	| 'status'
	| 'status.name'
	| 'status.type'
	| 'priority'
	| 'tags'
	| 'path'
	| 'folder'
	| 'filename'
	| 'heading'
	| 'due'
	| 'scheduled'
	| 'happens';

export type TextField = 'description' | 'path' | 'folder' | 'filename' | 'heading';

export type Instruction =
	| { kind: 'status-done'; negate: boolean }
	| { kind: 'status-type'; value: StatusType }
	| { kind: 'status-name-includes'; text: string }
	| { kind: 'has-date'; field: DateFieldName; has: boolean }
	| { kind: 'date-compare'; field: DateFieldName; op: DateCompareOp; dateText: string }
	| { kind: 'date-range'; field: DateFieldName; fromText: string; toText: string }
	| { kind: 'priority'; mod: 'above' | 'below' | 'not' | null; value: PriorityName }
	| { kind: 'text-match'; field: TextField; includes: boolean; text: string }
	| { kind: 'regex-match'; pattern: string; flags: string }
	| { kind: 'tag-match'; includes: boolean; tag: string }
	| { kind: 'recurring'; negate: boolean }
	| { kind: 'blocked'; negate: boolean }
	| { kind: 'blocking'; negate: boolean }
	| { kind: 'filter-function'; expr: string }
	| { kind: 'sort-function'; expr: string }
	| { kind: 'group-function'; expr: string }
	| { kind: 'sort-by'; field: SortField; reverse: boolean }
	| { kind: 'group-by'; field: GroupField; reverse: boolean }
	| { kind: 'and'; left: Instruction; right: Instruction }
	| { kind: 'or'; left: Instruction; right: Instruction }
	| { kind: 'xor'; left: Instruction; right: Instruction }
	| { kind: 'not'; operand: Instruction };

const DATE_FIELD_ALT = DATE_FIELDS.join('|');
const PRIORITY_ALT = 'lowest|low|none|medium|high|highest';

const UNSUPPORTED_RE = /^(limit groups|limit|hide|show|short mode|explain|ignore global query)\b/i;
const DONE_RE = /^done$/i;
const NOT_DONE_RE = /^not done$/i;
const STATUS_TYPE_RE = /^status\.type is\s+(TODO|IN_PROGRESS|DONE|CANCELLED|NON_TASK)$/i;
const STATUS_NAME_RE = /^status\.name includes\s+(.+)$/i;
const HAS_NO_DATE_RE = new RegExp(`^(has|no)\\s+(${DATE_FIELD_ALT})\\s+date$`, 'i');
const DATE_RANGE_RE = new RegExp(`^(${DATE_FIELD_ALT})\\s+in\\s+(.+)$`, 'i');
const DATE_COMPARE_RE = new RegExp(
	`^(${DATE_FIELD_ALT})\\s+(on or before|on or after|before|after|on)\\s+(.+)$`,
	'i',
);
const PRIORITY_RE = new RegExp(`^priority is\\s+(?:(above|below|not)\\s+)?(${PRIORITY_ALT})$`, 'i');
const REGEX_MATCH_RE = /^description regex matches\s+\/(.*)\/([a-zA-Z]*)$/;
const TAG_SINGULAR_RE = /^tag (includes|does not include)\s+(\S+)$/i;
const TAG_PLURAL_RE = /^tags (include|do not include)\s+(\S+)$/i;
const TEXT_FIELD_RE = /^(description|path|folder|filename|heading) (includes|does not include)\s+(.+)$/i;
const RECURRENCE_DEPS_RE = /^is (not )?(recurring|blocked|blocking)$/i;
const FILTER_FN_RE = /^filter by function\s+(.+)$/i;
const SORT_FN_RE = /^sort by function\s+(.+)$/i;
const GROUP_FN_RE = /^group by function\s+(.+)$/i;
const SORT_BY_RE = /^sort by (due|scheduled|start|created|done|priority|urgency|description|path|status)(\s+reverse)?$/i;
const GROUP_BY_RE =
	/^group by (status\.name|status\.type|status|priority|tags|path|folder|filename|heading|due|scheduled|happens)(\s+reverse)?$/i;

const DATE_COMPARE_OP_MAP: Record<string, DateCompareOp> = {
	before: 'before',
	after: 'after',
	on: 'on',
	'on or before': 'on-or-before',
	'on or after': 'on-or-after',
};

class InstructionParseError extends Error {}

/**
 * Splits a `<date> <date>` pair by finding the leftmost whitespace split where both sides parse
 * as chrono dates (validated against an arbitrary reference — the actual resolution against
 * `ctx.today` happens later, at compile/evaluate time, against the same raw text).
 */
function splitDateRange(text: string): [string, string] {
	const words = text.trim().split(/\s+/);
	const probeRef = moment();
	for (let i = 1; i < words.length; i++) {
		const left = words.slice(0, i).join(' ');
		const right = words.slice(i).join(' ');
		if (parseQueryDate(left, probeRef) !== null && parseQueryDate(right, probeRef) !== null) {
			return [left, right];
		}
	}
	throw new InstructionParseError(`"in" needs two dates: "${text}"`);
}

function parseSimpleInstruction(text: string): Instruction {
	if (UNSUPPORTED_RE.test(text)) {
		const name = UNSUPPORTED_RE.exec(text)![1];
		throw new InstructionParseError(`"${name}" is not supported by Tasks Board`);
	}
	if (DONE_RE.test(text)) return { kind: 'status-done', negate: false };
	if (NOT_DONE_RE.test(text)) return { kind: 'status-done', negate: true };

	let m = STATUS_TYPE_RE.exec(text);
	if (m) return { kind: 'status-type', value: m[1]!.toUpperCase() as StatusType };

	m = STATUS_NAME_RE.exec(text);
	if (m) return { kind: 'status-name-includes', text: m[1]!.trim() };

	m = HAS_NO_DATE_RE.exec(text);
	if (m) return { kind: 'has-date', field: m[2]! as DateFieldName, has: m[1]!.toLowerCase() === 'has' };

	m = DATE_COMPARE_RE.exec(text);
	if (m) {
		const op = DATE_COMPARE_OP_MAP[m[2]!.toLowerCase()]!;
		return { kind: 'date-compare', field: m[1]! as DateFieldName, op, dateText: m[3]!.trim() };
	}

	m = DATE_RANGE_RE.exec(text);
	if (m) {
		const [fromText, toText] = splitDateRange(m[2]!);
		return { kind: 'date-range', field: m[1]! as DateFieldName, fromText, toText };
	}

	m = PRIORITY_RE.exec(text);
	if (m) {
		return {
			kind: 'priority',
			mod: (m[1]?.toLowerCase() as 'above' | 'below' | 'not' | undefined) ?? null,
			value: m[2]!.toLowerCase() as PriorityName,
		};
	}

	m = REGEX_MATCH_RE.exec(text);
	if (m) return { kind: 'regex-match', pattern: m[1]!, flags: m[2] ?? '' };

	m = TAG_SINGULAR_RE.exec(text);
	if (m) return { kind: 'tag-match', includes: m[1]!.toLowerCase() === 'includes', tag: m[2]! };

	m = TAG_PLURAL_RE.exec(text);
	if (m) return { kind: 'tag-match', includes: m[1]!.toLowerCase() === 'include', tag: m[2]! };

	m = TEXT_FIELD_RE.exec(text);
	if (m) {
		return {
			kind: 'text-match',
			field: m[1]!.toLowerCase() as TextField,
			includes: m[2]!.toLowerCase() === 'includes',
			text: m[3]!.trim(),
		};
	}

	m = RECURRENCE_DEPS_RE.exec(text);
	if (m) {
		const negate = m[1] !== undefined;
		const which = m[2]!.toLowerCase();
		if (which === 'recurring') return { kind: 'recurring', negate };
		if (which === 'blocked') return { kind: 'blocked', negate };
		return { kind: 'blocking', negate };
	}

	m = FILTER_FN_RE.exec(text);
	if (m) return { kind: 'filter-function', expr: m[1]! };

	m = SORT_FN_RE.exec(text);
	if (m) return { kind: 'sort-function', expr: m[1]! };

	m = GROUP_FN_RE.exec(text);
	if (m) return { kind: 'group-function', expr: m[1]! };

	m = SORT_BY_RE.exec(text);
	if (m) return { kind: 'sort-by', field: m[1]!.toLowerCase() as SortField, reverse: !!m[2] };

	m = GROUP_BY_RE.exec(text);
	if (m) return { kind: 'group-by', field: m[1]!.toLowerCase() as GroupField, reverse: !!m[2] };

	throw new InstructionParseError(`Unrecognised instruction: "${text}"`);
}

function parseExpressionText(text: string): Instruction {
	const tokens = tokenizeBooleanLine(text);
	if (tokens === null) return parseSimpleInstruction(text.trim());
	return parseBooleanTokens(tokens);
}

interface Cursor {
	tokens: BoolToken[];
	pos: number;
}

function peek(c: Cursor): BoolToken | undefined {
	return c.tokens[c.pos];
}

function parseAtom(c: Cursor): Instruction {
	const tok = peek(c);
	if (!tok) throw new InstructionParseError('Expected an operand');
	if (tok.type === 'NOT') {
		c.pos++;
		const operand = parseAtom(c);
		return { kind: 'not', operand };
	}
	if (tok.type === 'GROUP') {
		c.pos++;
		return parseExpressionText(tok.text);
	}
	throw new InstructionParseError('Every operand must be parenthesized');
}

function parseAndLevel(c: Cursor): Instruction {
	let left = parseAtom(c);
	while (peek(c)?.type === 'AND') {
		c.pos++;
		const right = parseAtom(c);
		left = { kind: 'and', left, right };
	}
	return left;
}

function parseXorLevel(c: Cursor): Instruction {
	let left = parseAndLevel(c);
	while (peek(c)?.type === 'XOR') {
		c.pos++;
		const right = parseAndLevel(c);
		left = { kind: 'xor', left, right };
	}
	return left;
}

function parseOrLevel(c: Cursor): Instruction {
	let left = parseXorLevel(c);
	while (peek(c)?.type === 'OR') {
		c.pos++;
		const right = parseXorLevel(c);
		left = { kind: 'or', left, right };
	}
	return left;
}

function parseBooleanTokens(tokens: BoolToken[]): Instruction {
	const c: Cursor = { tokens, pos: 0 };
	const result = parseOrLevel(c);
	if (c.pos !== tokens.length) {
		throw new InstructionParseError('Unexpected trailing content after boolean expression');
	}
	return result;
}

export interface ParsedQuery {
	instructions: Instruction[];
	errors: QueryError[];
}

/** Tolerant top-level parse: an unrecognised or malformed line is recorded and skipped. */
export function parseQuery(source: string): ParsedQuery {
	const instructions: Instruction[] = [];
	const errors: QueryError[] = [];
	for (const { lineNumber, text } of splitLines(source)) {
		try {
			instructions.push(parseExpressionText(text));
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			errors.push({ line: lineNumber, message });
		}
	}
	return { instructions, errors };
}
