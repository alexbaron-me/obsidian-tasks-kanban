import { Component as ObsidianComponent, MarkdownRenderer, type App } from 'obsidian';
import { useEffect, useRef } from 'preact/hooks';

export interface MarkdownTextProps {
	app: App;
	markdown: string;
	/** The task's file path (not the board's) so relative links resolve correctly. */
	sourcePath: string;
	class?: string;
}

/**
 * The only place `MarkdownRenderer.render` is called. Each render owns its own Obsidian
 * `Component`, unloaded on unmount — the documented guard against a slow memory climb from
 * leaked components (§11.1).
 */
export function MarkdownText(props: MarkdownTextProps) {
	const ref = useRef<HTMLDivElement>(null);
	const lifecycleRef = useRef<ObsidianComponent | null>(null);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const lifecycle = new ObsidianComponent();
		lifecycleRef.current = lifecycle;
		lifecycle.load();
		el.empty?.() ?? (el.innerHTML = '');
		void MarkdownRenderer.render(props.app, props.markdown, el, props.sourcePath, lifecycle);
		return () => {
			lifecycle.unload();
			lifecycleRef.current = null;
		};
	}, [props.app, props.markdown, props.sourcePath]);

	return <div class={props.class ?? 'tasks-board-markdown'} ref={ref} />;
}
