import type { Moment } from 'moment';

export interface BoardFile {
	version: 1;
	/** Board-level query text. ANDed with every view's filters. */
	filters: string;
	settings: SettingsBlock;
	views: ViewConfig[];
}

export interface ViewConfig {
	name: string;
	/** ANDed on top of BoardFile.filters. Never replaces it. */
	filters: string;
	/** Default ordering within every bucket. Overridable per bucket. */
	sort: string;
	settings: SettingsBlock;
	columns: ColumnSpec;
	lanes: LaneSpec | null;
	card: CardConfig;
	/** bucketId -> sparse manual-order overrides. */
	order: Record<string, OrderOverride[]>;
}

/** Every field optional. Absent means "inherit from the next level up". */
export interface SettingsBlock {
	hideDoneAfterDays?: number;
	clickAction?: 'file' | 'modal' | 'preview' | 'none';
	density?: 'compact' | 'comfortable';
	wipMode?: 'soft' | 'hard';
	blockedDropMode?: 'soft' | 'hard';
	postponeField?: 'due' | 'scheduled';
	quickAddTarget?: string;
	laneCollapseDefault?: boolean;
}

export type FieldRef =
	| 'status'
	| 'due'
	| 'scheduled'
	| 'start'
	| 'priority'
	| 'tags'
	| 'path'
	| 'folder'
	| 'filename'
	| 'urgency'
	| 'recurrence';

export const WRITABLE_FIELDS: readonly FieldRef[] = [
	'status',
	'due',
	'scheduled',
	'start',
	'priority',
	'tags',
];

export type ColumnGenerator = 'explicit' | 'rolling' | 'auto';

export interface ColumnSpec {
	field: FieldRef;
	generator?: ColumnGenerator;
	buckets?: BucketDef[];
	span?: { from: number; to: number };
	edges?: ('overdue' | 'later' | 'undated')[];
	overrides: Record<string, BucketOverride>;
}

export interface BucketDef {
	name: string;
	match: string[];
}

export interface BucketOverride {
	wip?: { max: number; mode?: 'soft' | 'hard' };
	rollups?: ('count' | 'urgency' | 'priority')[];
	sort?: string;
	collapsed?: boolean;
}

export interface LaneSpec {
	groupBy: string;
	nested?: string;
}

export interface CardConfig {
	chips: ChipKind[];
}

export type ChipKind =
	| 'due'
	| 'scheduled'
	| 'start'
	| 'priority'
	| 'tags'
	| 'path'
	| 'recurrence'
	| 'urgency'
	| 'dependency'
	| 'children';

export type OrderOverride =
	| { id: string; before: string }
	| { id: string; after: string }
	| { id: string; first: true }
	| { id: string; last: true };

/** A generated column. `id` is stable across days; `label` is not. */
export interface Bucket {
	id: string;
	label: string;
	/** The value a drop writes. null = drop rejected (read-only or unwritable bucket). */
	writeValue: BucketWriteValue | null;
	override: BucketOverride;
}

export type BucketWriteValue =
	| { kind: 'status'; symbol: string }
	| { kind: 'date'; field: 'due' | 'scheduled' | 'start'; value: Moment | null }
	| { kind: 'priority'; value: string }
	| { kind: 'tags'; add: string; removeOthers: string[] };
