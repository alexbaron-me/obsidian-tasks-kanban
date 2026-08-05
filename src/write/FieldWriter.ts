import type { Moment } from 'moment';
import { PRIORITY_NUMBER_BY_NAME, type PriorityName } from '../types/tasks';

export type TaskFieldFormat = 'emoji' | 'dataview';

type DateField = 'due' | 'scheduled' | 'start';

const EMOJI_PRIORITY: Record<PriorityName, string> = {
	highest: '🔺',
	high: '⏫',
	medium: '🔼',
	none: '',
	low: '🔽',
	lowest: '⏬',
};

const DATAVIEW_PRIORITY: Record<PriorityName, string> = {
	highest: 'highest',
	high: 'high',
	medium: 'medium',
	none: 'none',
	low: 'low',
	lowest: 'lowest',
};

/** Canonical Tasks field order, used to place newly-added fields correctly. */
const CANONICAL_ORDER = ['priority', 'recurrence', 'created', 'start', 'scheduled', 'due', 'done', 'cancelled', 'id', 'dependsOn'];

const EMOJI_DATE_PREFIX: Record<DateField | 'created' | 'done' | 'cancelled', string> = {
	start: '🛫',
	scheduled: '⏳',
	due: '📅',
	created: '➕',
	done: '✅',
	cancelled: '❌',
};

interface Located {
	key: string;
	index: number;
	length: number;
}

const BLOCK_REF_RE = /(\s\^[A-Za-z0-9-]+)\s*$/;

function splitBlockRef(line: string): { body: string; blockRef: string } {
	const m = BLOCK_REF_RE.exec(line);
	if (!m) return { body: line, blockRef: '' };
	return { body: line.slice(0, m.index), blockRef: m[1]! };
}

function collapseWhitespace(text: string): string {
	return text.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/g, '');
}

function locateEmojiField(body: string, key: string): Located | null {
	if (key === 'priority') {
		const re = /[🔺⏫🔼🔽⏬]/u;
		const m = re.exec(body);
		return m ? { key, index: m.index, length: m[0].length } : null;
	}
	if (key === 'id') {
		const re = /🆔\s*\S+/u;
		const m = re.exec(body);
		return m ? { key, index: m.index, length: m[0].length } : null;
	}
	if (key === 'recurrence') {
		const re = /🔁[^📅⏳🛫➕✅❌🆔⛔🔺⏫🔼🔽⏬]*/u;
		const m = re.exec(body);
		return m ? { key, index: m.index, length: m[0].length } : null;
	}
	const prefix = (EMOJI_DATE_PREFIX as Record<string, string>)[key];
	if (!prefix) return null;
	const re = new RegExp(`${prefix}\\s*\\d{4}-\\d{2}-\\d{2}`, 'u');
	const m = re.exec(body);
	return m ? { key, index: m.index, length: m[0].length } : null;
}

function locateDataviewField(body: string, key: string): Located | null {
	const re = new RegExp(`\\[${key}::[^\\]]*\\]`);
	const m = re.exec(body);
	return m ? { key, index: m.index, length: m[0].length } : null;
}

function locateField(body: string, key: string, format: TaskFieldFormat): Located | null {
	return format === 'emoji' ? locateEmojiField(body, key) : locateDataviewField(body, key);
}

function insertionIndex(body: string, key: string, format: TaskFieldFormat): number {
	const myOrder = CANONICAL_ORDER.indexOf(key);
	let point = body.length;
	for (const otherKey of CANONICAL_ORDER) {
		if (otherKey === key) continue;
		const order = CANONICAL_ORDER.indexOf(otherKey);
		if (order <= myOrder) continue;
		const found = locateField(body, otherKey, format);
		if (found && found.index < point) point = found.index;
	}
	return point;
}

function upsertToken(line: string, key: string, format: TaskFieldFormat, token: string | null): string {
	const { body, blockRef } = splitBlockRef(line);
	const existing = locateField(body, key, format);

	let newBody: string;
	if (token === null) {
		if (!existing) return line;
		newBody = collapseWhitespace(body.slice(0, existing.index) + body.slice(existing.index + existing.length));
	} else if (existing) {
		newBody = body.slice(0, existing.index) + token + body.slice(existing.index + existing.length);
	} else {
		const at = insertionIndex(body, key, format);
		const before = body.slice(0, at).replace(/\s+$/, '');
		const after = body.slice(at);
		const afterWithSpace = after.length > 0 && !after.startsWith(' ') ? ` ${after}` : after;
		newBody = `${before} ${token}${afterWithSpace}`;
	}
	newBody = newBody.replace(/[ \t]+$/g, '');
	return blockRef ? `${newBody}${blockRef}` : newBody;
}

/** Serialises task field mutations in either the Tasks-plugin emoji format or Dataview inline
 * field format, per the field map in spec §5.3. No per-line format detection — the plugin owns
 * one format setting and always writes in it. */
export class FieldWriter {
	constructor(private format: TaskFieldFormat) {}

	setDate(line: string, field: DateField, value: Moment | null): string {
		if (value === null) {
			return this.format === 'emoji'
				? upsertToken(line, field, 'emoji', null)
				: upsertToken(line, field, 'dataview', null);
		}
		const dateStr = value.format('YYYY-MM-DD');
		const token =
			this.format === 'emoji' ? `${EMOJI_DATE_PREFIX[field]} ${dateStr}` : `[${field}:: ${dateStr}]`;
		return upsertToken(line, field, this.format, token);
	}

	setPriority(line: string, priority: PriorityName | null): string {
		if (priority === null || priority === 'none') {
			return upsertToken(line, 'priority', this.format, null);
		}
		const token =
			this.format === 'emoji' ? EMOJI_PRIORITY[priority] : `[priority:: ${DATAVIEW_PRIORITY[priority]}]`;
		return upsertToken(line, 'priority', this.format, token);
	}

	setId(line: string, id: string | null): string {
		if (id === null || id === '') return upsertToken(line, 'id', this.format, null);
		const token = this.format === 'emoji' ? `🆔 ${id}` : `[id:: ${id}]`;
		return upsertToken(line, 'id', this.format, token);
	}

	addTag(line: string, tag: string): string {
		const normalized = tag.startsWith('#') ? tag : `#${tag}`;
		if (new RegExp(`(^|\\s)${escapeRegExp(normalized)}(\\s|$)`).test(line)) return line;
		const { body, blockRef } = splitBlockRef(line);
		const trimmed = body.replace(/\s+$/, '');
		return `${trimmed} ${normalized}${blockRef}`;
	}

	removeTag(line: string, tag: string): string {
		const normalized = tag.startsWith('#') ? tag : `#${tag}`;
		const re = new RegExp(`\\s*${escapeRegExp(normalized)}(?=\\s|$)`);
		return line.replace(re, '');
	}

	/** Format-independent: the checkbox status marker is the same syntax in every field format. */
	setStatusSymbol(line: string, symbol: string): string {
		const re = /^(\s*[-*+] \[)[^\]]*(\].*)$/;
		if (!re.test(line)) {
			throw new Error('Line does not look like a checklist item; refusing to guess its structure');
		}
		return line.replace(re, `$1${symbol}$2`);
	}
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
