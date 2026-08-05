import { useState } from 'preact/hooks';
import type { CardConfig, ChipKind, ColumnSpec, LaneSpec, SettingsBlock } from '../../types/board';
import type { GlobalSettings } from '../../settings/GlobalSettings';
import { inheritedValue } from '../../settings/cascade';

export interface ViewSettingsPanelProps {
	globalSettings: GlobalSettings;
	boardSettings: SettingsBlock;
	viewSettings: SettingsBlock;
	columns: ColumnSpec;
	lanes: LaneSpec | null;
	card: CardConfig;
	sort: string;
	onChangeViewSettings: (patch: SettingsBlock) => void;
	onChangeColumns: (columns: ColumnSpec) => void;
	onChangeLanes: (lanes: LaneSpec | null) => void;
	onChangeCard: (card: CardConfig) => void;
	onChangeSort: (sort: string) => void;
	onClose: () => void;
}

const ALL_CHIPS: ChipKind[] = ['due', 'scheduled', 'start', 'priority', 'tags', 'path', 'recurrence', 'urgency', 'dependency', 'children'];

function CascadedSelect(props: {
	label: string;
	value: string | undefined;
	inherited: string | undefined;
	options: string[];
	onChange: (v: string | undefined) => void;
}) {
	return (
		<label class="tasks-board-settings__field">
			{props.label}
			<select
				value={props.value ?? ''}
				onChange={(e) => {
					const v = (e.target as HTMLSelectElement).value;
					props.onChange(v === '' ? undefined : v);
				}}
			>
				<option value="">{`(inherit: ${props.inherited ?? '—'})`}</option>
				{props.options.map((o) => (
					<option key={o} value={o}>
						{o}
					</option>
				))}
			</select>
		</label>
	);
}

export function ViewSettingsPanel(props: ViewSettingsPanelProps) {
	const [columnsJson, setColumnsJson] = useState(JSON.stringify(props.columns, null, 2));
	const [jsonError, setJsonError] = useState<string | null>(null);

	function commitColumnsJson() {
		try {
			const parsed = JSON.parse(columnsJson) as ColumnSpec;
			setJsonError(null);
			props.onChangeColumns(parsed);
		} catch (err) {
			setJsonError(err instanceof Error ? err.message : String(err));
		}
	}

	return (
		<div class="tasks-board-settings-panel">
			<div class="tasks-board-settings-panel__header">
				<h3>View settings</h3>
				<button type="button" onClick={props.onClose} aria-label="Close settings panel">
					✕
				</button>
			</div>

			<section>
				<h4>Sort</h4>
				<textarea
					rows={2}
					value={props.sort}
					onBlur={(e) => props.onChangeSort((e.target as HTMLTextAreaElement).value)}
				/>
			</section>

			<section>
				<h4>Card chips</h4>
				<div class="tasks-board-settings__chip-toggles">
					{ALL_CHIPS.map((chip) => (
						<label key={chip}>
							<input
								type="checkbox"
								checked={props.card.chips.includes(chip)}
								onChange={(e) => {
									const checked = (e.target as HTMLInputElement).checked;
									const next = checked
										? [...props.card.chips, chip]
										: props.card.chips.filter((c) => c !== chip);
									props.onChangeCard({ chips: next });
								}}
							/>
							{chip}
						</label>
					))}
				</div>
			</section>

			<section>
				<h4>Lanes</h4>
				<label class="tasks-board-settings__field">
					Group by
					<input
						type="text"
						placeholder="e.g. group by priority (leave blank for no lanes)"
						value={props.lanes?.groupBy ?? ''}
						onBlur={(e) => {
							const v = (e.target as HTMLInputElement).value.trim();
							props.onChangeLanes(v === '' ? null : { groupBy: v, nested: props.lanes?.nested });
						}}
					/>
				</label>
				{props.lanes ? (
					<label class="tasks-board-settings__field">
						Nested group by
						<input
							type="text"
							value={props.lanes.nested ?? ''}
							onBlur={(e) => {
								const v = (e.target as HTMLInputElement).value.trim();
								props.onChangeLanes({ ...props.lanes!, nested: v === '' ? undefined : v });
							}}
						/>
					</label>
				) : null}
			</section>

			<section>
				<h4>Columns (advanced: raw JSON)</h4>
				<textarea
					rows={10}
					class="tasks-board-settings__json"
					value={columnsJson}
					onInput={(e) => setColumnsJson((e.target as HTMLTextAreaElement).value)}
					onBlur={commitColumnsJson}
				/>
				{jsonError ? <p class="tasks-board-settings__error">{jsonError}</p> : null}
			</section>

			<section>
				<h4>Behaviour</h4>
				<CascadedSelect
					label="Click action"
					value={props.viewSettings.clickAction}
					inherited={inheritedValue('clickAction', props.globalSettings, props.boardSettings)}
					options={['file', 'modal', 'preview', 'none']}
					onChange={(v) => props.onChangeViewSettings({ clickAction: v as SettingsBlock['clickAction'] })}
				/>
				<CascadedSelect
					label="Density"
					value={props.viewSettings.density}
					inherited={inheritedValue('density', props.globalSettings, props.boardSettings)}
					options={['compact', 'comfortable']}
					onChange={(v) => props.onChangeViewSettings({ density: v as SettingsBlock['density'] })}
				/>
				<CascadedSelect
					label="WIP mode"
					value={props.viewSettings.wipMode}
					inherited={inheritedValue('wipMode', props.globalSettings, props.boardSettings)}
					options={['soft', 'hard']}
					onChange={(v) => props.onChangeViewSettings({ wipMode: v as SettingsBlock['wipMode'] })}
				/>
				<CascadedSelect
					label="Blocked drop mode"
					value={props.viewSettings.blockedDropMode}
					inherited={inheritedValue('blockedDropMode', props.globalSettings, props.boardSettings)}
					options={['soft', 'hard']}
					onChange={(v) => props.onChangeViewSettings({ blockedDropMode: v as SettingsBlock['blockedDropMode'] })}
				/>
				<CascadedSelect
					label="Postpone field"
					value={props.viewSettings.postponeField}
					inherited={inheritedValue('postponeField', props.globalSettings, props.boardSettings)}
					options={['due', 'scheduled']}
					onChange={(v) => props.onChangeViewSettings({ postponeField: v as SettingsBlock['postponeField'] })}
				/>
				<label class="tasks-board-settings__field">
					{`Hide done after N days (inherit: ${inheritedValue('hideDoneAfterDays', props.globalSettings, props.boardSettings) ?? '—'})`}
					<input
						type="number"
						value={props.viewSettings.hideDoneAfterDays ?? ''}
						placeholder="inherit"
						onBlur={(e) => {
							const raw = (e.target as HTMLInputElement).value;
							props.onChangeViewSettings({ hideDoneAfterDays: raw === '' ? undefined : Number(raw) });
						}}
					/>
				</label>
			</section>
		</div>
	);
}
