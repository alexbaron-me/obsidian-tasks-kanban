import { App, PluginSettingTab, Setting, type Plugin } from 'obsidian';
import type { GlobalSettings } from './GlobalSettings';
import { DEFAULT_CASCADE_SETTINGS } from './GlobalSettings';

export interface SettingsTabDeps {
	getSettings: () => GlobalSettings;
	saveSettings: () => Promise<void>;
}

export class TasksBoardSettingsTab extends PluginSettingTab {
	constructor(
		app: App,
		plugin: Plugin,
		private deps: SettingsTabDeps,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const settings = this.deps.getSettings();

		containerEl.createEl('h2', { text: 'Tasks Board' });

		new Setting(containerEl)
			.setName('Field format')
			.setDesc('How new/edited fields (dates, priority, id) are written into task lines. Seeded once from the Tasks plugin, then yours to change — never re-synced automatically.')
			.addDropdown((dd) => {
				dd.addOption('emoji', 'Tasks emoji format');
				dd.addOption('dataview', 'Dataview inline fields');
				dd.setValue(settings.format);
				dd.onChange(async (value) => {
					settings.format = value === 'dataview' ? 'dataview' : 'emoji';
					await this.deps.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Default quick-add target')
			.setDesc('Vault-relative path used when a board, view, and the active note all leave the quick-add target unset.')
			.addText((text) => {
				text.setPlaceholder('e.g. Inbox.md');
				text.setValue(settings.defaultQuickAddTarget ?? '');
				text.onChange(async (value) => {
					settings.defaultQuickAddTarget = value.trim() === '' ? null : value.trim();
					await this.deps.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Manual-ordering id confirmation')
			.setDesc('Whether the one-time "this will add a 🆔" confirmation has been dismissed.')
			.addToggle((toggle) => {
				toggle.setValue(settings.idConfirmDismissed);
				toggle.onChange(async (value) => {
					settings.idConfirmDismissed = value;
					await this.deps.saveSettings();
				});
			});

		containerEl.createEl('h3', { text: 'Default board/view settings' });
		containerEl.createEl('p', {
			text: 'These are the outermost level of the settings cascade (global → board → view). Boards and views can override any of them.',
		});

		new Setting(containerEl)
			.setName('Hide done tasks after (days)')
			.setDesc('0 disables auto-hide.')
			.addText((text) => {
				text.setValue(String(settings.cascade.hideDoneAfterDays ?? DEFAULT_CASCADE_SETTINGS.hideDoneAfterDays));
				text.onChange(async (value) => {
					const n = Number(value);
					settings.cascade.hideDoneAfterDays = Number.isFinite(n) ? n : DEFAULT_CASCADE_SETTINGS.hideDoneAfterDays;
					await this.deps.saveSettings();
				});
			});

		new Setting(containerEl).setName('Click action').addDropdown((dd) => {
			dd.addOption('file', 'Open source file');
			dd.addOption('modal', 'Open edit modal');
			dd.addOption('preview', 'Hover preview');
			dd.addOption('none', 'None');
			dd.setValue(settings.cascade.clickAction ?? DEFAULT_CASCADE_SETTINGS.clickAction);
			dd.onChange(async (value) => {
				settings.cascade.clickAction = value as GlobalSettings['cascade']['clickAction'];
				await this.deps.saveSettings();
			});
		});

		new Setting(containerEl).setName('WIP limit mode').addDropdown((dd) => {
			dd.addOption('soft', 'Soft (warn)');
			dd.addOption('hard', 'Hard (block)');
			dd.setValue(settings.cascade.wipMode ?? DEFAULT_CASCADE_SETTINGS.wipMode);
			dd.onChange(async (value) => {
				settings.cascade.wipMode = value as GlobalSettings['cascade']['wipMode'];
				await this.deps.saveSettings();
			});
		});

		new Setting(containerEl).setName('Blocked-drop mode').addDropdown((dd) => {
			dd.addOption('soft', 'Soft (warn)');
			dd.addOption('hard', 'Hard (block)');
			dd.setValue(settings.cascade.blockedDropMode ?? DEFAULT_CASCADE_SETTINGS.blockedDropMode);
			dd.onChange(async (value) => {
				settings.cascade.blockedDropMode = value as GlobalSettings['cascade']['blockedDropMode'];
				await this.deps.saveSettings();
			});
		});

		new Setting(containerEl).setName('Postpone field').addDropdown((dd) => {
			dd.addOption('due', 'Due date');
			dd.addOption('scheduled', 'Scheduled date');
			dd.setValue(settings.cascade.postponeField ?? DEFAULT_CASCADE_SETTINGS.postponeField);
			dd.onChange(async (value) => {
				settings.cascade.postponeField = value as GlobalSettings['cascade']['postponeField'];
				await this.deps.saveSettings();
			});
		});

		containerEl.createEl('h3', { text: 'Accent rules' });
		containerEl.createEl('p', {
			text: 'First match wins. Rules run through the same query engine as filters, including "filter by function" — which runs with full plugin privileges. Do not open .board files from untrusted sources.',
		});
		settings.accentRules.forEach((rule, index) => {
			new Setting(containerEl)
				.setName(rule.name || `Rule ${index + 1}`)
				.addText((text) => {
					text.setPlaceholder('Name');
					text.setValue(rule.name);
					text.onChange(async (value) => {
						rule.name = value;
						await this.deps.saveSettings();
					});
				})
				.addText((text) => {
					text.setPlaceholder('Filter, e.g. priority is high');
					text.setValue(rule.filter);
					text.onChange(async (value) => {
						rule.filter = value;
						await this.deps.saveSettings();
					});
				})
				.addText((text) => {
					text.setPlaceholder('--color-red');
					text.setValue(rule.cssVar);
					text.onChange(async (value) => {
						rule.cssVar = value;
						await this.deps.saveSettings();
					});
				})
				.addButton((btn) => {
					btn.setButtonText('Remove');
					btn.onClick(async () => {
						settings.accentRules.splice(index, 1);
						await this.deps.saveSettings();
						this.display();
					});
				});
		});
		new Setting(containerEl).addButton((btn) => {
			btn.setButtonText('Add accent rule');
			btn.onClick(async () => {
				settings.accentRules.push({ name: '', filter: '', cssVar: '--color-red' });
				await this.deps.saveSettings();
				this.display();
			});
		});
	}
}
