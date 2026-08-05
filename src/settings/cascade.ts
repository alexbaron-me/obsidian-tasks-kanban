import type { SettingsBlock } from '../types/board';
import type { GlobalSettings } from './GlobalSettings';

export type ResolvedSettings = Required<
	Pick<
		SettingsBlock,
		| 'hideDoneAfterDays'
		| 'clickAction'
		| 'density'
		| 'wipMode'
		| 'blockedDropMode'
		| 'postponeField'
		| 'laneCollapseDefault'
	>
> & { quickAddTarget: string | null };

/** Nearest-wins, three levels: view overrides board overrides the global cascade defaults. Only
 * the cascaded keys in §14 participate — global-only and view-only keys are read directly from
 * their owning scope, not through this function. */
export function resolveSettings(global: GlobalSettings, board: SettingsBlock, view: SettingsBlock): ResolvedSettings {
	return {
		hideDoneAfterDays: view.hideDoneAfterDays ?? board.hideDoneAfterDays ?? global.cascade.hideDoneAfterDays!,
		clickAction: view.clickAction ?? board.clickAction ?? global.cascade.clickAction!,
		density: view.density ?? board.density ?? global.cascade.density!,
		wipMode: view.wipMode ?? board.wipMode ?? global.cascade.wipMode!,
		blockedDropMode: view.blockedDropMode ?? board.blockedDropMode ?? global.cascade.blockedDropMode!,
		postponeField: view.postponeField ?? board.postponeField ?? global.cascade.postponeField!,
		laneCollapseDefault:
			view.laneCollapseDefault ?? board.laneCollapseDefault ?? global.cascade.laneCollapseDefault!,
		quickAddTarget: view.quickAddTarget ?? board.quickAddTarget ?? global.defaultQuickAddTarget ?? null,
	};
}

/** For UI placeholders: what a given key would resolve to if this scope left it unset. */
export function inheritedValue<K extends keyof SettingsBlock>(
	key: K,
	global: GlobalSettings,
	board: SettingsBlock,
): SettingsBlock[K] | undefined {
	if (key === 'quickAddTarget') return (global.defaultQuickAddTarget ?? undefined) as SettingsBlock[K];
	return board[key] ?? global.cascade[key];
}
