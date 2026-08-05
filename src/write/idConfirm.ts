import { Modal, type App } from 'obsidian';

/**
 * One-time modal shown on the user's first manual drag anywhere in the vault: manual ordering
 * writes a short 🆔 into the task line (standard Tasks syntax, also used by dependencies).
 * Resolves to true (proceed) or false (cancelled).
 */
export class IdConfirmModal extends Modal {
	private resolve!: (proceed: boolean) => void;
	private dontAskAgain = false;

	constructor(app: App) {
		super(app);
	}

	async ask(): Promise<{ proceed: boolean; dontAskAgain: boolean }> {
		return new Promise((resolve) => {
			this.resolve = (proceed) => resolve({ proceed, dontAskAgain: this.dontAskAgain });
			this.open();
		});
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Enable manual ordering for this task?' });
		contentEl.createEl('p', {
			text: 'Dragging a card into a specific position writes a short 🆔 id into the task line — standard Tasks syntax, also used for task dependencies.',
		});
		const checkboxLabel = contentEl.createEl('label');
		const checkbox = checkboxLabel.createEl('input', { type: 'checkbox' });
		checkbox.addEventListener('change', () => {
			this.dontAskAgain = checkbox.checked;
		});
		checkboxLabel.appendText("Don't ask again");

		const buttons = contentEl.createDiv();
		const cancel = buttons.createEl('button', { text: 'Cancel' });
		cancel.addEventListener('click', () => {
			this.resolve(false);
			this.close();
		});
		const proceed = buttons.createEl('button', { text: 'Proceed' });
		proceed.addEventListener('click', () => {
			this.resolve(true);
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
