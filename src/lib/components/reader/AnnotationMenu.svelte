<script lang="ts">
	import { Button, Popover, PopoverMenu } from "glow";
	import { AnnotationController, type Annotation } from "$lib/reader/annnotate.svelte.ts";
	import type { ReaderController } from "$lib/reader/reader.svelte";

	let { reader }: { reader: ReaderController } = $props();
	let settings = {
		theme : "highlight", 

	} 

	
	const items = $derived<PopoverMenuEntry[]>([
		{ kind: "header", label: "Annotations" },
		{
			kind: "radio",
			options: [
				{ value: "highlight", label: "Highlight" },
				{ value: "ink", label: "Ink" },
			],
			value: settings.theme,
			onChange: (v: string) => (settings.theme = v as ThemeName),
		},
		"divider",
		{
			kind: "toggle",
			label: "Justify text",
			checked: settings.justify,
			onChange: (v: boolean) => (settings.justify = v),
		},
		{
			kind: "toggle",
			label: "Realistic pages",
			checked: settings.shading,
			onChange: (v: boolean) => (settings.shading = v),
		},
		{
			kind: "toggle",
			label: "Page pacer",
			description: "A hairline that drains over the page. Paged reading only.",
			checked: settings.pacer,
			onChange: (v: boolean) => (settings.pacer = v),
		},
		// The speed it paces to is only worth showing once it is pacing.
		...(settings.pacer
			? [{ kind: "custom", render: pace } as PopoverMenuEntry]
			: []),
		{ kind: "header", label: "Layout" },
		{
			kind: "radio",
			options: [
				{ value: "paginated", label: "Paged" },
				{ value: "scrolled", label: "Scroll" },
			],
			value: settings.flow,
			onChange: (v: string) =>
				(settings.flow = v as ReaderSettings["flow"]),
		},
		{
			kind: "radio",
			options: [
				{ value: "auto", label: "Two-page" },
				{ value: "single", label: "Single" },
			],
			value: settings.singleColumn ? "single" : "auto",
			onChange: (v: string) => (settings.singleColumn = v === "single"),
		},
	]);

	const annotations = new AnnotationController();

	// Watch the book that is actually open; re-attaches if the route changes id.
	$effect(() => {
		const id = reader.book?.id;
		if (!reader.ready || id === undefined) return;
		return annotations.attach(reader);
	});

	let expanded = $state<number | null>(null);
	// const cast = $derived(characters.cast);
</script>

<!-- Hidden entirely until the scan finds a cast worth browsing: a non-fiction
     book has no characters, and an empty panel is worse than no button. -->
<PopoverMenu {items} align="right" offset={8}>
	{#snippet trigger()}
		<!-- the label would otherwise sit on top of the panel it opened -->
		<Button
			variant="ghost"
			icon="NotebookPen"
			tooltip={annotations.panelOpen ? "" : "Cast so far"}
		/>
	{/snippet}
</PopoverMenu>


<style>
	.panel {
		width: min(21rem, calc(100vw - 1.5rem));
		max-height: min(28rem, 70vh);
		overflow-y: auto;
		padding: 0.55rem;
	}
	.empty {
		margin: 0 0.25rem 0.5rem;
		font-size: 0.7rem;
		line-height: 1.4;
		color: var(--glow-text-muted);
	}
	.empty {
		margin-bottom: 0.25rem;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.row {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		width: 100%;
		padding: 0.35rem 0.45rem;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.row:hover {
		background: var(--glow-fg-soft);
	}
	.name {
		font-size: 0.86rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.noted {
		flex: 0 0 auto;
		font-size: 0.5rem;
		line-height: 1;
		color: var(--glow-primary);
	}
	.count {
		flex: 1 0 auto;
		text-align: right;
		font-size: 0.68rem;
		font-variant-numeric: tabular-nums;
		color: var(--glow-text-muted);
	}
	.detail {
		padding: 0.2rem 0.45rem 0.6rem;
	}
</style>
