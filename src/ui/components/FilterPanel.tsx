import { useState } from 'preact/hooks';
import type { QueryError } from '../../query/parse';

export interface FilterPanelProps {
	boardFilters: string;
	viewFilters: string;
	errors: readonly QueryError[];
	availableTags: readonly string[];
	onChangeViewFilters: (text: string) => void;
	onClose: () => void;
}

/** Appends an `OR`-combined tag filter line to the view's filter text — the one place OR is
 * synthesised automatically, per §6.2. */
function appendTagOrFilter(currentText: string, tags: readonly string[]): string {
	if (tags.length === 0) return currentText;
	const clause =
		tags.length === 1
			? `tag includes ${tags[0]}`
			: tags.map((t, i, arr) => (i < arr.length - 1 ? `(tag includes ${t}) OR ` : `(tag includes ${t})`)).join('');
	return currentText.trim() === '' ? clause : `${currentText}\n${clause}`;
}

export function FilterPanel(props: FilterPanelProps) {
	const [draft, setDraft] = useState(props.viewFilters);
	const [selectedTags, setSelectedTags] = useState<string[]>([]);

	return (
		<div class="tasks-board-filter-panel">
			<div class="tasks-board-filter-panel__header">
				<h3>Filters</h3>
				<button type="button" onClick={props.onClose} aria-label="Close filter panel">
					✕
				</button>
			</div>
			{props.boardFilters.trim() !== '' ? (
				<div class="tasks-board-filter-panel__board-filters">
					<label>Board filters (applies to every view)</label>
					<pre>{props.boardFilters}</pre>
				</div>
			) : null}
			<label>View filters</label>
			<textarea
				class="tasks-board-filter-panel__textarea"
				value={draft}
				onInput={(e) => setDraft((e.target as HTMLTextAreaElement).value)}
				onBlur={() => props.onChangeViewFilters(draft)}
				rows={6}
			/>
			{props.errors.length > 0 ? (
				<ul class="tasks-board-filter-panel__errors">
					{props.errors.map((err, i) => (
						<li key={i}>
							Line {err.line}: {err.message}
						</li>
					))}
				</ul>
			) : null}
			{props.availableTags.length > 0 ? (
				<div class="tasks-board-filter-panel__tags">
					<label>Quick filter by tag</label>
					<div class="tasks-board-filter-panel__tag-list">
						{props.availableTags.map((tag) => (
							<button
								type="button"
								key={tag}
								class={`tasks-board-filter-panel__tag-btn${selectedTags.includes(tag) ? ' is-selected' : ''}`}
								onClick={() =>
									setSelectedTags((prev) =>
										prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
									)
								}
							>
								{tag}
							</button>
						))}
					</div>
					<button
						type="button"
						disabled={selectedTags.length === 0}
						onClick={() => {
							const next = appendTagOrFilter(draft, selectedTags);
							setDraft(next);
							props.onChangeViewFilters(next);
							setSelectedTags([]);
						}}
					>
						Apply tag filter
					</button>
				</div>
			) : null}
		</div>
	);
}

export { appendTagOrFilter };
