import { App, Modal, Setting } from 'obsidian';
import type { BoardModel } from '../model/BoardModel';
import type {
	BucketDef,
	CardConfig,
	ChipKind,
	ColumnGenerator,
	ColumnSpec,
	FieldRef,
	SettingsBlock,
	ViewConfig,
} from '../types/board';
import type { GlobalSettings } from '../settings/GlobalSettings';
import { inheritedValue } from '../settings/cascade';
import {
	FILTER_ROW_KINDS,
	TEXT_FILTER_FIELDS,
	FILTER_DATE_FIELDS,
	defaultRow,
	rowsToText,
	textToRows,
	type FilterRow,
	type FilterRowKind,
} from '../board/filterBuilder';
import { SORT_FIELDS, defaultSortRow, rowsToSortText, sortTextToRows, type SortRow } from '../board/sortBuilder';
import { parseQuery, type GroupField } from '../query/parse';

export interface BoardSettingsModalDeps {
	app: App;
	boardModel: BoardModel;
	viewIndex: number;
	view: ViewConfig;
	boardFilters: string;
	boardSettings: SettingsBlock;
	globalSettings: GlobalSettings;
	initialTab?: TabId;
}

type TabId = 'general' | 'query' | 'layout' | 'display';

const TABS: { id: TabId; label: string }[] = [
	{ id: 'general', label: 'General' },
	{ id: 'query', label: 'Filter & sort' },
	{ id: 'layout', label: 'Columns & lanes' },
	{ id: 'display', label: 'Card & behaviour' },
];

const ALL_FIELD_REFS: { value: FieldRef; label: string }[] = [
	{ value: 'status', label: 'Status' },
	{ value: 'priority', label: 'Priority' },
	{ value: 'tags', label: 'Tags' },
	{ value: 'due', label: 'Due date' },
	{ value: 'scheduled', label: 'Scheduled date' },
	{ value: 'start', label: 'Start date' },
	{ value: 'path', label: 'Path' },
	{ value: 'folder', label: 'Folder' },
	{ value: 'filename', label: 'Filename' },
	{ value: 'urgency', label: 'Urgency' },
	{ value: 'recurrence', label: 'Recurrence' },
];

const ROLLING_FIELDS: FieldRef[] = ['due', 'scheduled', 'start'];

const GROUP_FIELDS: { value: GroupField; label: string }[] = [
	{ value: 'status', label: 'Status' },
	{ value: 'status.type', label: 'Status type' },
	{ value: 'priority', label: 'Priority' },
	{ value: 'tags', label: 'Tags' },
	{ value: 'path', label: 'Path' },
	{ value: 'folder', label: 'Folder' },
	{ value: 'filename', label: 'Filename' },
	{ value: 'heading', label: 'Heading' },
	{ value: 'due', label: 'Due date' },
	{ value: 'scheduled', label: 'Scheduled date' },
];

const ALL_CHIPS: { value: ChipKind; label: string }[] = [
	{ value: 'due', label: 'Due' },
	{ value: 'scheduled', label: 'Scheduled' },
	{ value: 'start', label: 'Start' },
	{ value: 'priority', label: 'Priority' },
	{ value: 'tags', label: 'Tags' },
	{ value: 'path', label: 'File' },
	{ value: 'recurrence', label: 'Recurrence' },
	{ value: 'urgency', label: 'Urgency' },
	{ value: 'dependency', label: 'Dependency' },
	{ value: 'children', label: 'Children' },
];

function groupFieldToText(field: GroupField, reverse: boolean): string {
	return `group by ${field}${reverse ? ' reverse' : ''}`;
}

function textToGroupField(text: string): { field: GroupField; reverse: boolean } | null {
	const { instructions, errors } = parseQuery(text);
	if (errors.length > 0 || instructions.length !== 1) return null;
	const instr = instructions[0]!;
	if (instr.kind !== 'group-by') return null;
	return { field: instr.field, reverse: instr.reverse };
}

export function openBoardSettingsModal(deps: BoardSettingsModalDeps): void {
	new BoardSettingsModal(deps).open();
}

/**
 * Every field group here reads its current text (filters/sort/lanes groupBy) and writes back
 * through the same BoardModel mutation methods the rest of the app uses, so there's exactly one
 * source of truth for what a change means — this modal is presentation only.
 */
class BoardSettingsModal extends Modal {
	private activeTab: TabId;
	private filterMode: 'visual' | 'text';
	private filterRows: FilterRow[];
	private sortMode: 'visual' | 'text';
	private sortRows: SortRow[];

	constructor(private deps: BoardSettingsModalDeps) {
		super(deps.app);
		this.activeTab = deps.initialTab ?? 'general';
		const filterParsed = textToRows(deps.view.filters);
		this.filterMode = filterParsed.fullyRepresented ? 'visual' : 'text';
		this.filterRows = filterParsed.rows;
		const sortParsed = sortTextToRows(deps.view.sort);
		this.sortMode = sortParsed.fullyRepresented ? 'visual' : 'text';
		this.sortRows = sortParsed.rows;
		this.modalEl.addClass('tasks-board-settings-modal');
	}

	private get view(): ViewConfig {
		const state = this.deps.boardModel.getState();
		if (state.status !== 'ok') return this.deps.view;
		return state.boardFile.views[this.deps.viewIndex] ?? this.deps.view;
	}

	onOpen(): void {
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.setTitle(`Board settings — ${this.view.name}`);

		const tabStrip = contentEl.createDiv('tasks-board-settings-modal__tabs');
		for (const tab of TABS) {
			const btn = tabStrip.createEl('button', {
				text: tab.label,
				cls: `tasks-board-settings-modal__tab${tab.id === this.activeTab ? ' is-active' : ''}`,
			});
			btn.type = 'button';
			btn.addEventListener('click', () => {
				this.activeTab = tab.id;
				this.render();
			});
		}

		const body = contentEl.createDiv('tasks-board-settings-modal__body');
		switch (this.activeTab) {
			case 'general':
				this.renderGeneral(body);
				break;
			case 'query':
				this.renderQuery(body);
				break;
			case 'layout':
				this.renderLayout(body);
				break;
			case 'display':
				this.renderDisplay(body);
				break;
		}
	}

	// ---------------------------------------------------------------- General

	private renderGeneral(body: HTMLElement): void {
		const { boardModel, viewIndex } = this.deps;
		const view = this.view;

		new Setting(body)
			.setName('View name')
			.addText((text) =>
				text.setValue(view.name).onChange((value) => {
					if (value.trim() !== '') boardModel.renameView(viewIndex, value.trim());
				}),
			);

		new Setting(body)
			.setName('Delete this view')
			.setDesc('This only removes the view from the board — no tasks are affected.')
			.addButton((btn) =>
				btn
					.setButtonText('Delete view')
					.setWarning()
					.onClick(() => {
						boardModel.removeView(viewIndex);
						this.close();
					}),
			);
	}

	// ------------------------------------------------------------------ Query

	private renderQuery(body: HTMLElement): void {
		const { boardModel, viewIndex, boardFilters } = this.deps;

		if (boardFilters.trim() !== '') {
			new Setting(body)
				.setName('Board filters')
				.setDesc('ANDed with this view\'s filters below. Edit at the board level to change them.');
			body.createEl('pre', { cls: 'tasks-board-settings-modal__board-filters', text: boardFilters });
		}

		const filterCanGoVisual = textToRows(this.view.filters).fullyRepresented;
		new Setting(body).setName('Filters').setHeading();
		new Setting(body)
			.setName('Mode')
			.setDesc(
				filterCanGoVisual
					? 'Visual builder ANDs every row together. Switch to text for OR/XOR/NOT or "filter by function".'
					: 'This filter uses boolean logic or a function, which the visual builder can\'t represent — edit as text, or clear it to start over visually.',
			)
			.addDropdown((dd) => {
				if (filterCanGoVisual) dd.addOption('visual', 'Visual');
				dd.addOption('text', 'Text');
				dd.setValue(this.filterMode);
				dd.setDisabled(!filterCanGoVisual);
				dd.onChange((value) => {
					if (value === 'visual') this.filterRows = textToRows(this.view.filters).rows;
					this.filterMode = value === 'text' ? 'text' : 'visual';
					this.render();
				});
			});

		if (this.filterMode === 'visual') {
			this.renderFilterRows(body);
		} else {
			new Setting(body).addTextArea((ta) => {
				ta.setValue(this.view.filters);
				ta.inputEl.rows = 6;
				ta.inputEl.addClass('tasks-board-settings-modal__textarea');
				ta.onChange((value) => boardModel.setViewFilters(viewIndex, value));
			});
		}

		const sortCanGoVisual = sortTextToRows(this.view.sort).fullyRepresented;
		new Setting(body).setName('Sort').setHeading();
		new Setting(body)
			.setName('Mode')
			.setDesc(sortCanGoVisual ? '' : 'This sort uses "sort by function", which the visual builder can\'t represent — edit as text.')
			.addDropdown((dd) => {
				if (sortCanGoVisual) dd.addOption('visual', 'Visual');
				dd.addOption('text', 'Text');
				dd.setValue(this.sortMode);
				dd.setDisabled(!sortCanGoVisual);
				dd.onChange((value) => {
					if (value === 'visual') this.sortRows = sortTextToRows(this.view.sort).rows;
					this.sortMode = value === 'text' ? 'text' : 'visual';
					this.render();
				});
			});

		if (this.sortMode === 'visual') {
			this.renderSortRows(body);
		} else {
			new Setting(body).addTextArea((ta) => {
				ta.setValue(this.view.sort);
				ta.inputEl.rows = 3;
				ta.inputEl.addClass('tasks-board-settings-modal__textarea');
				ta.onChange((value) => boardModel.setViewSort(viewIndex, value));
			});
		}
	}

	private commitFilterRows(): void {
		this.deps.boardModel.setViewFilters(this.deps.viewIndex, rowsToText(this.filterRows));
	}

	private commitSortRows(): void {
		this.deps.boardModel.setViewSort(this.deps.viewIndex, rowsToSortText(this.sortRows));
	}

	private renderFilterRows(body: HTMLElement): void {
		const list = body.createDiv('tasks-board-settings-modal__row-list');
		this.filterRows.forEach((row, index) => {
			const rowEl = list.createDiv('tasks-board-settings-modal__row');
			const setting = new Setting(rowEl).setClass('tasks-board-settings-modal__row-setting');
			setting.addDropdown((dd) => {
				for (const k of FILTER_ROW_KINDS) dd.addOption(k.kind, k.label);
				dd.setValue(row.kind);
				dd.onChange((value) => {
					this.filterRows[index] = { ...defaultRow(value as FilterRowKind) };
					this.commitFilterRows();
					this.render();
				});
			});
			this.renderFilterRowControls(setting, row, index);
			setting.addExtraButton((btn) =>
				btn
					.setIcon('trash')
					.setTooltip('Remove filter')
					.onClick(() => {
						this.filterRows.splice(index, 1);
						this.commitFilterRows();
						this.render();
					}),
			);
		});

		new Setting(body).addButton((btn) =>
			btn.setButtonText('+ Add filter').onClick(() => {
				this.filterRows.push(defaultRow());
				this.commitFilterRows();
				this.render();
			}),
		);
	}

	private renderFilterRowControls(setting: Setting, row: FilterRow, index: number): void {
		const update = (patch: Partial<FilterRow>) => {
			this.filterRows[index] = { ...this.filterRows[index]!, ...patch };
			this.commitFilterRows();
		};

		switch (row.kind) {
			case 'done':
			case 'recurring':
			case 'blocked':
			case 'blocking':
				setting.addDropdown((dd) => {
					dd.addOption('is', row.kind === 'done' ? 'Done' : 'Is');
					dd.addOption('not', row.kind === 'done' ? 'Not done' : 'Is not');
					dd.setValue(row.negate ? 'not' : 'is');
					dd.onChange((v) => update({ negate: v === 'not' }));
				});
				break;
			case 'statusType':
				setting.addDropdown((dd) => {
					for (const t of ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED', 'NON_TASK']) dd.addOption(t, t);
					dd.setValue(row.statusType);
					dd.onChange((v) => update({ statusType: v as FilterRow['statusType'] }));
				});
				break;
			case 'statusName':
				setting.addText((text) =>
					text.setPlaceholder('text').setValue(row.statusNameText).onChange((v) => update({ statusNameText: v })),
				);
				break;
			case 'date':
				setting.addDropdown((dd) => {
					for (const f of FILTER_DATE_FIELDS) dd.addOption(f, f);
					dd.setValue(row.dateField);
					dd.onChange((v) => update({ dateField: v as FilterRow['dateField'] }));
				});
				setting.addDropdown((dd) => {
					dd.addOptions({ before: 'before', after: 'after', on: 'on', 'on-or-before': 'on or before', 'on-or-after': 'on or after' });
					dd.setValue(row.dateOp);
					dd.onChange((v) => update({ dateOp: v as FilterRow['dateOp'] }));
				});
				setting.addText((text) =>
					text.setPlaceholder('today, next friday, 2026-01-01…').setValue(row.dateValue).onChange((v) => update({ dateValue: v })),
				);
				break;
			case 'dateRange':
				setting.addDropdown((dd) => {
					for (const f of FILTER_DATE_FIELDS) dd.addOption(f, f);
					dd.setValue(row.dateField);
					dd.onChange((v) => update({ dateField: v as FilterRow['dateField'] }));
				});
				setting.addText((text) => text.setPlaceholder('from').setValue(row.dateRangeFrom).onChange((v) => update({ dateRangeFrom: v })));
				setting.addText((text) => text.setPlaceholder('to').setValue(row.dateRangeTo).onChange((v) => update({ dateRangeTo: v })));
				break;
			case 'hasDate':
				setting.addDropdown((dd) => {
					dd.addOption('has', 'Has');
					dd.addOption('no', 'No');
					dd.setValue(row.has ? 'has' : 'no');
					dd.onChange((v) => update({ has: v === 'has' }));
				});
				setting.addDropdown((dd) => {
					for (const f of FILTER_DATE_FIELDS) dd.addOption(f, f);
					dd.setValue(row.hasDateField);
					dd.onChange((v) => update({ hasDateField: v as FilterRow['hasDateField'] }));
				});
				break;
			case 'priority':
				setting.addDropdown((dd) => {
					dd.addOption('', 'is exactly');
					dd.addOption('above', 'is above');
					dd.addOption('below', 'is below');
					dd.addOption('not', 'is not');
					dd.setValue(row.priorityMod ?? '');
					dd.onChange((v) => update({ priorityMod: v === '' ? null : (v as FilterRow['priorityMod']) }));
				});
				setting.addDropdown((dd) => {
					for (const p of ['highest', 'high', 'medium', 'none', 'low', 'lowest']) dd.addOption(p, p);
					dd.setValue(row.priorityValue);
					dd.onChange((v) => update({ priorityValue: v as FilterRow['priorityValue'] }));
				});
				break;
			case 'text':
				setting.addDropdown((dd) => {
					for (const f of TEXT_FILTER_FIELDS) dd.addOption(f, f);
					dd.setValue(row.textField);
					dd.onChange((v) => update({ textField: v as FilterRow['textField'] }));
				});
				setting.addDropdown((dd) => {
					dd.addOption('includes', 'includes');
					dd.addOption('excludes', 'does not include');
					dd.setValue(row.textIncludes ? 'includes' : 'excludes');
					dd.onChange((v) => update({ textIncludes: v === 'includes' }));
				});
				setting.addText((text) => text.setPlaceholder('text').setValue(row.textValue).onChange((v) => update({ textValue: v })));
				break;
			case 'regex':
				setting.addText((text) => text.setPlaceholder('pattern').setValue(row.regexPattern).onChange((v) => update({ regexPattern: v })));
				setting.addText((text) => text.setPlaceholder('flags').setValue(row.regexFlags).onChange((v) => update({ regexFlags: v })));
				break;
			case 'tag':
				setting.addDropdown((dd) => {
					dd.addOption('includes', 'includes');
					dd.addOption('excludes', 'does not include');
					dd.setValue(row.tagIncludes ? 'includes' : 'excludes');
					dd.onChange((v) => update({ tagIncludes: v === 'includes' }));
				});
				setting.addText((text) => text.setPlaceholder('#tag').setValue(row.tagValue).onChange((v) => update({ tagValue: v })));
				break;
		}
	}

	private renderSortRows(body: HTMLElement): void {
		const list = body.createDiv('tasks-board-settings-modal__row-list');
		this.sortRows.forEach((row, index) => {
			const rowEl = list.createDiv('tasks-board-settings-modal__row');
			const setting = new Setting(rowEl).setClass('tasks-board-settings-modal__row-setting');
			setting.addDropdown((dd) => {
				for (const f of SORT_FIELDS) dd.addOption(f, f);
				dd.setValue(row.field);
				dd.onChange((v) => {
					this.sortRows[index] = { ...this.sortRows[index]!, field: v as SortRow['field'] };
					this.commitSortRows();
				});
			});
			setting.addToggle((toggle) =>
				toggle
					.setTooltip('Reverse')
					.setValue(row.reverse)
					.onChange((v) => {
						this.sortRows[index] = { ...this.sortRows[index]!, reverse: v };
						this.commitSortRows();
					}),
			);
			setting.addExtraButton((btn) =>
				btn
					.setIcon('trash')
					.setTooltip('Remove sort key')
					.onClick(() => {
						this.sortRows.splice(index, 1);
						this.commitSortRows();
						this.render();
					}),
			);
		});
		new Setting(body).addButton((btn) =>
			btn.setButtonText('+ Add sort key').onClick(() => {
				this.sortRows.push(defaultSortRow());
				this.commitSortRows();
				this.render();
			}),
		);
	}

	// ----------------------------------------------------------------- Layout

	private renderLayout(body: HTMLElement): void {
		const { boardModel, viewIndex } = this.deps;
		const columns = this.view.columns;

		new Setting(body).setName('Columns').setHeading();

		new Setting(body).setName('Field').addDropdown((dd) => {
			for (const f of ALL_FIELD_REFS) dd.addOption(f.value, f.label);
			dd.setValue(columns.field);
			dd.onChange((v) => {
				const field = v as FieldRef;
				const generator: ColumnGenerator = ROLLING_FIELDS.includes(field) && columns.generator === 'rolling' ? 'rolling' : columns.generator ?? 'explicit';
				boardModel.setColumns(viewIndex, { field, generator, buckets: columns.buckets, span: columns.span, edges: columns.edges, overrides: columns.overrides });
				this.render();
			});
		});

		new Setting(body).setName('Generator').addDropdown((dd) => {
			dd.addOption('explicit', 'Explicit (named buckets)');
			if (ROLLING_FIELDS.includes(columns.field)) dd.addOption('rolling', 'Rolling (date window)');
			dd.addOption('auto', 'Auto (distinct values)');
			dd.setValue(columns.generator ?? 'explicit');
			dd.onChange((v) => {
				const generator = v as ColumnGenerator;
				const next: ColumnSpec = { field: columns.field, generator, overrides: columns.overrides };
				if (generator === 'explicit') next.buckets = columns.buckets ?? [{ name: 'New column', match: [] }];
				if (generator === 'rolling') {
					next.span = columns.span ?? { from: 0, to: 6 };
					next.edges = columns.edges ?? ['overdue', 'later', 'undated'];
				}
				boardModel.setColumns(viewIndex, next);
				this.render();
			});
		});

		const generator = columns.generator ?? (columns.buckets ? 'explicit' : columns.span ? 'rolling' : 'auto');
		if (generator === 'explicit') this.renderExplicitBuckets(body, columns);
		else if (generator === 'rolling') this.renderRollingConfig(body, columns);
		else new Setting(body).setDesc('Buckets are generated automatically from every distinct value of this field (capped at 30).');

		new Setting(body).setName('Lanes (swimlanes)').setHeading();
		this.renderLanes(body);
	}

	private renderExplicitBuckets(body: HTMLElement, columns: ColumnSpec): void {
		const { boardModel, viewIndex } = this.deps;
		const buckets = columns.buckets ?? [];

		const commit = (next: BucketDef[]) => {
			boardModel.setColumns(viewIndex, { ...columns, generator: 'explicit', buckets: next });
			this.render();
		};

		const list = body.createDiv('tasks-board-settings-modal__row-list');
		buckets.forEach((bucket, index) => {
			const rowEl = list.createDiv('tasks-board-settings-modal__row');
			const setting = new Setting(rowEl).setClass('tasks-board-settings-modal__row-setting');
			setting.addText((text) =>
				text
					.setPlaceholder('Column name')
					.setValue(bucket.name)
					.onChange((v) => {
						const next = [...buckets];
						next[index] = { ...bucket, name: v };
						commit(next);
					}),
			);
			setting.addText((text) =>
				text
					.setPlaceholder('Match values, comma-separated (e.g. x for status, #work for tags)')
					.setValue(bucket.match.join(', '))
					.onChange((v) => {
						const next = [...buckets];
						next[index] = { ...bucket, match: v.split(',').map((s) => s.trim()).filter((s) => s !== '') };
						commit(next);
					}),
			);
			const override = columns.overrides[bucket.name] ?? {};
			setting.addText((text) => {
				text.inputEl.type = 'number';
				text.inputEl.addClass('tasks-board-settings-modal__wip-input');
				text.setPlaceholder('WIP max');
				text.setValue(override.wip?.max ? String(override.wip.max) : '');
				text.onChange((v) => {
					const max = Number(v);
					const overrides = { ...columns.overrides };
					if (v.trim() === '' || !Number.isFinite(max) || max <= 0) {
						delete overrides[bucket.name];
					} else {
						overrides[bucket.name] = { ...override, wip: { max, mode: override.wip?.mode } };
					}
					boardModel.setColumns(viewIndex, { ...columns, generator: 'explicit', overrides });
				});
			});
			if (index > 0) {
				setting.addExtraButton((btn) =>
					btn
						.setIcon('arrow-up')
						.setTooltip('Move up')
						.onClick(() => {
							const next = [...buckets];
							[next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
							commit(next);
						}),
				);
			}
			if (index < buckets.length - 1) {
				setting.addExtraButton((btn) =>
					btn
						.setIcon('arrow-down')
						.setTooltip('Move down')
						.onClick(() => {
							const next = [...buckets];
							[next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
							commit(next);
						}),
				);
			}
			setting.addExtraButton((btn) =>
				btn
					.setIcon('trash')
					.setTooltip('Remove column')
					.onClick(() => commit(buckets.filter((_, i) => i !== index))),
			);
		});

		new Setting(body).addButton((btn) =>
			btn.setButtonText('+ Add column').onClick(() => commit([...buckets, { name: 'New column', match: [] }])),
		);
	}

	private renderRollingConfig(body: HTMLElement, columns: ColumnSpec): void {
		const { boardModel, viewIndex } = this.deps;
		const span = columns.span ?? { from: 0, to: 6 };
		const edges = new Set(columns.edges ?? []);

		const commit = (patch: Partial<ColumnSpec>) => {
			boardModel.setColumns(viewIndex, { ...columns, generator: 'rolling', ...patch });
		};

		new Setting(body)
			.setName('Window')
			.setDesc('Days relative to today, e.g. -2 to 6 shows two overdue days through six days out.')
			.addText((text) => {
				text.inputEl.type = 'number';
				text.setValue(String(span.from));
				text.onChange((v) => commit({ span: { from: Number(v) || 0, to: span.to } }));
			})
			.addText((text) => {
				text.inputEl.type = 'number';
				text.setValue(String(span.to));
				text.onChange((v) => commit({ span: { from: span.from, to: Number(v) || 0 } }));
			});

		const edgeSetting = new Setting(body).setName('Edge columns');
		for (const edge of ['overdue', 'later', 'undated'] as const) {
			edgeSetting.addToggle((toggle) =>
				toggle
					.setTooltip(edge)
					.setValue(edges.has(edge))
					.onChange((checked) => {
						const nextEdges = new Set(edges);
						if (checked) nextEdges.add(edge);
						else nextEdges.delete(edge);
						commit({ edges: [...nextEdges] });
					}),
			);
		}
		edgeSetting.descEl.setText('Overdue / Later / Undated');
	}

	private renderLanes(body: HTMLElement): void {
		const { boardModel, viewIndex } = this.deps;
		const lanes = this.view.lanes;
		const parsedTop = lanes ? textToGroupField(lanes.groupBy) : null;
		const parsedNested = lanes?.nested ? textToGroupField(lanes.nested) : null;

		new Setting(body).setName('Group by').addDropdown((dd) => {
			dd.addOption('', '(no lanes)');
			for (const f of GROUP_FIELDS) dd.addOption(f.value, f.label);
			dd.setValue(lanes && parsedTop ? parsedTop.field : '');
			dd.onChange((v) => {
				if (v === '') {
					boardModel.setLanes(viewIndex, null);
				} else {
					boardModel.setLanes(viewIndex, { groupBy: groupFieldToText(v as GroupField, parsedTop?.reverse ?? false), nested: lanes?.nested });
				}
				this.render();
			});
		});

		if (lanes) {
			new Setting(body).setName('Nested group by').addDropdown((dd) => {
				dd.addOption('', '(none)');
				for (const f of GROUP_FIELDS) dd.addOption(f.value, f.label);
				dd.setValue(parsedNested ? parsedNested.field : '');
				dd.onChange((v) => {
					boardModel.setLanes(viewIndex, {
						groupBy: lanes.groupBy,
						nested: v === '' ? undefined : groupFieldToText(v as GroupField, false),
					});
				});
			});
		}
	}

	// ---------------------------------------------------------------- Display

	private renderDisplay(body: HTMLElement): void {
		const { boardModel, viewIndex, globalSettings, boardSettings } = this.deps;
		const view = this.view;

		new Setting(body).setName('Card chips').setHeading();
		const chipSetting = new Setting(body).setDesc('Shown in the configured order.');
		for (const chip of ALL_CHIPS) {
			chipSetting.addToggle((toggle) =>
				toggle
					.setTooltip(chip.label)
					.setValue(view.card.chips.includes(chip.value))
					.onChange((checked) => {
						const next: CardConfig = {
							chips: checked ? [...view.card.chips, chip.value] : view.card.chips.filter((c) => c !== chip.value),
						};
						boardModel.setCard(viewIndex, next);
					}),
			);
		}

		new Setting(body).setName('Behaviour').setHeading();
		const patch = (p: Partial<SettingsBlock>) => boardModel.setViewSettings(viewIndex, p);

		new Setting(body)
			.setName('Click action')
			.setDesc(`Inherits: ${inheritedValue('clickAction', globalSettings, boardSettings) ?? '—'}`)
			.addDropdown((dd) => {
				dd.addOption('', '(inherit)');
				for (const v of ['file', 'modal', 'preview', 'none']) dd.addOption(v, v);
				dd.setValue(view.settings.clickAction ?? '');
				dd.onChange((v) => patch({ clickAction: v === '' ? undefined : (v as SettingsBlock['clickAction']) }));
			});

		new Setting(body)
			.setName('Density')
			.setDesc(`Inherits: ${inheritedValue('density', globalSettings, boardSettings) ?? '—'}`)
			.addDropdown((dd) => {
				dd.addOption('', '(inherit)');
				dd.addOption('compact', 'compact');
				dd.addOption('comfortable', 'comfortable');
				dd.setValue(view.settings.density ?? '');
				dd.onChange((v) => patch({ density: v === '' ? undefined : (v as SettingsBlock['density']) }));
			});

		new Setting(body)
			.setName('WIP limit mode')
			.setDesc(`Inherits: ${inheritedValue('wipMode', globalSettings, boardSettings) ?? '—'}`)
			.addDropdown((dd) => {
				dd.addOption('', '(inherit)');
				dd.addOption('soft', 'soft (warn)');
				dd.addOption('hard', 'hard (block)');
				dd.setValue(view.settings.wipMode ?? '');
				dd.onChange((v) => patch({ wipMode: v === '' ? undefined : (v as SettingsBlock['wipMode']) }));
			});

		new Setting(body)
			.setName('Blocked-drop mode')
			.setDesc(`Inherits: ${inheritedValue('blockedDropMode', globalSettings, boardSettings) ?? '—'}`)
			.addDropdown((dd) => {
				dd.addOption('', '(inherit)');
				dd.addOption('soft', 'soft (warn)');
				dd.addOption('hard', 'hard (block)');
				dd.setValue(view.settings.blockedDropMode ?? '');
				dd.onChange((v) => patch({ blockedDropMode: v === '' ? undefined : (v as SettingsBlock['blockedDropMode']) }));
			});

		new Setting(body)
			.setName('Postpone field')
			.setDesc(`Inherits: ${inheritedValue('postponeField', globalSettings, boardSettings) ?? '—'}`)
			.addDropdown((dd) => {
				dd.addOption('', '(inherit)');
				dd.addOption('due', 'due');
				dd.addOption('scheduled', 'scheduled');
				dd.setValue(view.settings.postponeField ?? '');
				dd.onChange((v) => patch({ postponeField: v === '' ? undefined : (v as SettingsBlock['postponeField']) }));
			});

		new Setting(body)
			.setName('Hide done after (days)')
			.setDesc(`Inherits: ${inheritedValue('hideDoneAfterDays', globalSettings, boardSettings) ?? '—'}. 0 disables.`)
			.addText((text) => {
				text.inputEl.type = 'number';
				text.setPlaceholder('inherit');
				text.setValue(view.settings.hideDoneAfterDays !== undefined ? String(view.settings.hideDoneAfterDays) : '');
				text.onChange((v) => patch({ hideDoneAfterDays: v.trim() === '' ? undefined : Number(v) }));
			});

		new Setting(body)
			.setName('Quick-add target')
			.setDesc('Vault-relative path. Leave blank to inherit from the board or the active note.')
			.addText((text) => {
				text.setPlaceholder('inherit');
				text.setValue(view.settings.quickAddTarget ?? '');
				text.onChange((v) => patch({ quickAddTarget: v.trim() === '' ? undefined : v.trim() }));
			});
	}
}
