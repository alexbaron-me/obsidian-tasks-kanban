import * as YAML from 'yaml';
import type {
	BoardFile,
	BucketDef,
	BucketOverride,
	CardConfig,
	ChipKind,
	ColumnGenerator,
	ColumnSpec,
	FieldRef,
	LaneSpec,
	OrderOverride,
	SettingsBlock,
	ViewConfig,
} from '../types/board';

export interface SchemaError {
	path: string;
	message: string;
}

const WRITABLE_FIELD_VALUES: FieldRef[] = [
	'status',
	'due',
	'scheduled',
	'start',
	'priority',
	'tags',
	'path',
	'folder',
	'filename',
	'urgency',
	'recurrence',
];

const CHIP_VALUES: ChipKind[] = [
	'due',
	'scheduled',
	'start',
	'priority',
	'tags',
	'path',
	'recurrence',
	'urgency',
	'dependency',
	'children',
];

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
	return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function validateSettingsBlock(raw: unknown, path: string, errors: SchemaError[]): SettingsBlock {
	if (!isRecord(raw)) return {};
	const out: SettingsBlock = {};
	if (raw.hideDoneAfterDays !== undefined) {
		if (typeof raw.hideDoneAfterDays === 'number') out.hideDoneAfterDays = raw.hideDoneAfterDays;
		else errors.push({ path: `${path}.hideDoneAfterDays`, message: 'expected a number' });
	}
	if (raw.clickAction !== undefined) {
		if (['file', 'modal', 'preview', 'none'].includes(raw.clickAction as string)) {
			out.clickAction = raw.clickAction as SettingsBlock['clickAction'];
		} else errors.push({ path: `${path}.clickAction`, message: 'invalid clickAction' });
	}
	if (raw.density !== undefined) {
		if (raw.density === 'compact' || raw.density === 'comfortable') out.density = raw.density;
		else errors.push({ path: `${path}.density`, message: 'invalid density' });
	}
	if (raw.wipMode !== undefined) {
		if (raw.wipMode === 'soft' || raw.wipMode === 'hard') out.wipMode = raw.wipMode;
		else errors.push({ path: `${path}.wipMode`, message: 'invalid wipMode' });
	}
	if (raw.blockedDropMode !== undefined) {
		if (raw.blockedDropMode === 'soft' || raw.blockedDropMode === 'hard') out.blockedDropMode = raw.blockedDropMode;
		else errors.push({ path: `${path}.blockedDropMode`, message: 'invalid blockedDropMode' });
	}
	if (raw.postponeField !== undefined) {
		if (raw.postponeField === 'due' || raw.postponeField === 'scheduled') out.postponeField = raw.postponeField;
		else errors.push({ path: `${path}.postponeField`, message: 'invalid postponeField' });
	}
	if (raw.quickAddTarget !== undefined) {
		if (typeof raw.quickAddTarget === 'string') out.quickAddTarget = raw.quickAddTarget;
		else errors.push({ path: `${path}.quickAddTarget`, message: 'expected a string' });
	}
	if (raw.laneCollapseDefault !== undefined) {
		if (typeof raw.laneCollapseDefault === 'boolean') out.laneCollapseDefault = raw.laneCollapseDefault;
		else errors.push({ path: `${path}.laneCollapseDefault`, message: 'expected a boolean' });
	}
	return out;
}

function validateBucketOverride(raw: unknown, path: string, errors: SchemaError[]): BucketOverride {
	if (!isRecord(raw)) return {};
	const out: BucketOverride = {};
	if (raw.wip !== undefined) {
		if (isRecord(raw.wip) && typeof raw.wip.max === 'number') {
			out.wip = { max: raw.wip.max, mode: raw.wip.mode === 'hard' ? 'hard' : raw.wip.mode === 'soft' ? 'soft' : undefined };
		} else errors.push({ path: `${path}.wip`, message: 'expected { max, mode? }' });
	}
	if (raw.rollups !== undefined) {
		if (isStringArray(raw.rollups)) out.rollups = raw.rollups.filter((r) => ['count', 'urgency', 'priority'].includes(r)) as BucketOverride['rollups'];
		else errors.push({ path: `${path}.rollups`, message: 'expected a string array' });
	}
	if (raw.sort !== undefined) {
		if (typeof raw.sort === 'string') out.sort = raw.sort;
		else errors.push({ path: `${path}.sort`, message: 'expected a string' });
	}
	if (raw.collapsed !== undefined) {
		if (typeof raw.collapsed === 'boolean') out.collapsed = raw.collapsed;
		else errors.push({ path: `${path}.collapsed`, message: 'expected a boolean' });
	}
	return out;
}

function validateColumnSpec(raw: unknown, path: string, errors: SchemaError[]): ColumnSpec {
	if (!isRecord(raw)) {
		errors.push({ path, message: 'missing columns block; defaulting to status' });
		return { field: 'status', overrides: {} };
	}
	const field = WRITABLE_FIELD_VALUES.includes(raw.field as FieldRef) ? (raw.field as FieldRef) : 'status';
	if (raw.field !== undefined && field !== raw.field) errors.push({ path: `${path}.field`, message: 'invalid field' });

	let generator: ColumnGenerator | undefined;
	if (raw.generator === 'explicit' || raw.generator === 'rolling' || raw.generator === 'auto') {
		generator = raw.generator;
	}

	let buckets: BucketDef[] | undefined;
	if (Array.isArray(raw.buckets)) {
		buckets = raw.buckets
			.filter(isRecord)
			.filter((b) => typeof b.name === 'string' && isStringArray(b.match))
			.map((b) => ({ name: b.name as string, match: b.match as string[] }));
	}

	let span: { from: number; to: number } | undefined;
	if (isRecord(raw.span) && typeof raw.span.from === 'number' && typeof raw.span.to === 'number') {
		span = { from: raw.span.from, to: raw.span.to };
	}

	let edges: ColumnSpec['edges'];
	if (isStringArray(raw.edges)) {
		edges = raw.edges.filter((e) => e === 'overdue' || e === 'later' || e === 'undated') as ColumnSpec['edges'];
	}

	const overrides: Record<string, BucketOverride> = {};
	if (isRecord(raw.overrides)) {
		for (const [key, value] of Object.entries(raw.overrides)) {
			overrides[key] = validateBucketOverride(value, `${path}.overrides.${key}`, errors);
		}
	}

	// generator inference: explicit wins if both buckets and span are present.
	if (!generator) {
		if (buckets !== undefined) generator = 'explicit';
		else if (span !== undefined) generator = 'rolling';
		else generator = 'auto';
	}
	if (buckets !== undefined && span !== undefined && raw.generator === undefined) {
		errors.push({ path, message: 'both buckets and span present; explicit generator wins' });
	}

	const spec: ColumnSpec = { field, overrides };
	if (generator !== undefined) spec.generator = generator;
	if (buckets !== undefined) spec.buckets = buckets;
	if (span !== undefined) spec.span = span;
	if (edges !== undefined) spec.edges = edges;
	return spec;
}

function validateLaneSpec(raw: unknown): LaneSpec | null {
	if (!isRecord(raw)) return null;
	if (typeof raw.groupBy !== 'string') return null;
	const lane: LaneSpec = { groupBy: raw.groupBy };
	if (typeof raw.nested === 'string') lane.nested = raw.nested;
	return lane;
}

function validateCardConfig(raw: unknown): CardConfig {
	if (isRecord(raw) && isStringArray(raw.chips)) {
		return { chips: raw.chips.filter((c) => CHIP_VALUES.includes(c as ChipKind)) as ChipKind[] };
	}
	return { chips: ['due', 'priority', 'tags'] };
}

function validateOrderOverride(raw: unknown): OrderOverride | null {
	if (!isRecord(raw) || typeof raw.id !== 'string') return null;
	if (typeof raw.before === 'string') return { id: raw.id, before: raw.before };
	if (typeof raw.after === 'string') return { id: raw.id, after: raw.after };
	if (raw.first === true) return { id: raw.id, first: true };
	if (raw.last === true) return { id: raw.id, last: true };
	return null;
}

function validateOrder(raw: unknown): Record<string, OrderOverride[]> {
	if (!isRecord(raw)) return {};
	const out: Record<string, OrderOverride[]> = {};
	for (const [bucketId, list] of Object.entries(raw)) {
		if (!Array.isArray(list)) continue;
		out[bucketId] = list.map(validateOrderOverride).filter((o): o is OrderOverride => o !== null);
	}
	return out;
}

function validateView(raw: unknown, index: number, errors: SchemaError[]): ViewConfig {
	const path = `views[${index}]`;
	if (!isRecord(raw)) {
		errors.push({ path, message: 'view is not an object; using defaults' });
		return {
			name: `View ${index + 1}`,
			filters: '',
			sort: '',
			settings: {},
			columns: { field: 'status', overrides: {} },
			lanes: null,
			card: { chips: ['due', 'priority', 'tags'] },
			order: {},
		};
	}
	return {
		name: typeof raw.name === 'string' ? raw.name : `View ${index + 1}`,
		filters: typeof raw.filters === 'string' ? raw.filters : '',
		sort: typeof raw.sort === 'string' ? raw.sort : '',
		settings: validateSettingsBlock(raw.settings, `${path}.settings`, errors),
		columns: validateColumnSpec(raw.columns, `${path}.columns`, errors),
		lanes: validateLaneSpec(raw.lanes),
		card: validateCardConfig(raw.card),
		order: validateOrder(raw.order),
	};
}

/** Normalizes a raw parsed YAML object into a well-typed BoardFile, applying defaults for
 * missing/invalid fields and collecting non-fatal warnings. Unknown keys are simply ignored by
 * this typed view — the caller is responsible for round-tripping them via the raw YAML.Document. */
export function validateBoardFile(raw: unknown): { doc: BoardFile; errors: SchemaError[] } {
	const errors: SchemaError[] = [];
	if (!isRecord(raw)) {
		return {
			doc: { version: 1, filters: '', settings: {}, views: [] },
			errors: [{ path: '', message: 'board file is not a YAML mapping' }],
		};
	}
	const views = Array.isArray(raw.views)
		? raw.views.map((v, i) => validateView(v, i, errors))
		: [];
	return {
		doc: {
			version: 1,
			filters: typeof raw.filters === 'string' ? raw.filters : '',
			settings: validateSettingsBlock(raw.settings, 'settings', errors),
			views,
		},
		errors,
	};
}

export type ParseResult =
	| { ok: true; document: YAML.Document; boardFile: BoardFile; errors: SchemaError[] }
	| { ok: false; parseError: string; raw: string };

/** Parses `.board` YAML text into a mutable YAML.Document (for comment/order-preserving
 * round-trip) plus a validated typed view. Never throws — a syntax error is returned as a
 * result, not an exception, so the caller can render an error panel instead of crashing. */
export function parseBoardYaml(text: string): ParseResult {
	let document: YAML.Document;
	try {
		document = YAML.parseDocument(text, { merge: true });
		if (document.errors.length > 0) {
			return { ok: false, parseError: document.errors.map((e) => e.message).join('; '), raw: text };
		}
	} catch (err) {
		return { ok: false, parseError: err instanceof Error ? err.message : String(err), raw: text };
	}
	const { doc: boardFile, errors } = validateBoardFile(document.toJS() ?? {});
	return { ok: true, document, boardFile, errors };
}

export function serializeBoardFile(boardFile: BoardFile): string {
	return YAML.stringify(boardFile);
}

function defaultColumnsFromStatuses(
	statuses: { symbol: string; name: string; type: string }[],
): ColumnSpec {
	const byType = new Map<string, string[]>();
	const order: string[] = [];
	for (const s of statuses) {
		if (!byType.has(s.type)) {
			byType.set(s.type, []);
			order.push(s.type);
		}
		byType.get(s.type)!.push(s.symbol);
	}
	const label: Record<string, string> = {
		TODO: 'To Do',
		IN_PROGRESS: 'In Progress',
		DONE: 'Done',
		CANCELLED: 'Cancelled',
		NON_TASK: 'Other',
	};
	const buckets: BucketDef[] = order.map((type) => ({
		name: label[type] ?? type,
		match: byType.get(type)!,
	}));
	return { field: 'status', generator: 'explicit', buckets, overrides: {} };
}

/** Bootstraps a new .board file: one "Status" view grouped by the vault's configured statuses,
 * per §13.4. Empty boards are useless and the status config is already available. */
export function bootstrapBoardFile(
	statuses: { symbol: string; name: string; type: string }[],
): BoardFile {
	return {
		version: 1,
		filters: 'not done',
		settings: {},
		views: [
			{
				name: 'Status',
				filters: '',
				sort: '',
				settings: {},
				columns: defaultColumnsFromStatuses(statuses),
				lanes: null,
				card: { chips: ['due', 'priority', 'tags'] },
				order: {},
			},
		],
	};
}
