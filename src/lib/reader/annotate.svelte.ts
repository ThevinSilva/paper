import * as library from "$lib/library";
import type { ReaderController } from "./reader.svelte";


/** Draw options for an annotation. `color` is all `Overlayer.highlight`
 *  uses today; `width` is here for ink's stroke thickness — unused by
 *  highlights, but the shape a future ink draw function would expect. */
export type AnnotationOption = {
	kind: "highlight" | "ink",
	color: string,
	width?: number,
}

// NOTE: subject to change based on later implementation of freehand ink support
export type Annotation = {
	id: number,
	bookId: number,
	kind: "highlight" | "ink", // magari piu nel futuro
	index: number,
	value : string, // Note this is a CFI string
	createdAt: Date
	option: AnnotationOption
}

/** Tolerate a failed read: a book with no annotations yet still opens fine. */
function loadAnnotations(bookId: number): Promise<Annotation[]> {
	return library.annotations(bookId).catch((e) => {
		console.warn("annotations: failed to load from db - ", e);
		return [];
	});
}

const OVERLAYER_URL = "/foliate-js/overlayer.js";
let overlayerModule: Promise<any> | null = null;
const loadOverlayer = (): Promise<any> =>
	(overlayerModule ??= import(/* @vite-ignore */ OVERLAYER_URL));


export class AnnotationController {
	#reader: any = null;
	#bookId = 0;
	#overlayer = $state<any>(null); // overlayer.js, once it lands offers draw methods
	#docs = new Map<Document, () => void>();
	annotations : Annotation[] = [];
	sessionIds: number[] = [];
	
	option = $state<AnnotationOption>({kind: "highlight", color: "#ffeb3b"});
	panelOpen = $state(false);
	/** A mode, not a "kind" — nothing is being drawn while this is true. */
	erasing = $state(false);

	attach(reader: ReaderController) {
		this.#reader = reader;
		if (!reader.book) {
			console.warn("Annotations: book not found");
			return;
		}
		this.#bookId = reader.book.id;
		loadAnnotations(this.#bookId).then((rows) => {
			this.annotations = rows;
		});

		loadOverlayer()
		.then((m) => {
			this.#overlayer = m.Overlayer;
		})
		.catch((e) => console.warn("annotations unavailable", e));

		// drawing annotations
		this.#reader.view.addEventListener("relocate", this.#onRelocate);
		// erase mode: tapping an existing mark fires this for free
		this.#reader.view.addEventListener("show-annotation", this.#onShowAnnotation);

		// Erase mode must not survive the popover closing, however it closes
		// (Done, click-away, Escape) — a watch on panelOpen covers all of
		// those uniformly, since we don't get a callback for glow's own
		// click-away/Escape dismissal, only the bound `open` value changing.
		const disposeErase = $effect.root(() => {
			$effect(() => {
				if (!this.panelOpen) this.erasing = false;
			});
		});

		return () => {
			this.#reader.view.removeEventListener?.("relocate", this.#onRelocate);
			this.#reader.view.removeEventListener?.("show-annotation", this.#onShowAnnotation);
			disposeErase();
			this.#reader = null;
			this.annotations = [];
			this.sessionIds = [];
		}
	}

	
	// ── selection tracking ─────────────────────────────────────────
	// lifted straight from quote.svelte.ts ngl heh heh 
	observe(doc: Document, index: number) {
		if (this.#docs.has(doc)) return;

		const up = async () => {
			if (this.erasing) return;
			// temporary until ink is implemented
			if (this.option.kind !== "highlight") return;
			const sel = doc.getSelection();
			if (sel && this.panelOpen && sel.toString().length > 0) {
				const cfi = this.#reader.view.getCFI(index, sel.getRangeAt(0))

				const draft: Omit<Annotation, "id">  = {
					index,
					value: cfi,
					bookId: this.#bookId,
					kind: "highlight",
					option: {...this.option},
					createdAt: new Date()
				}

				// NOTE: high chance this isn't in the best order
				// added to db up here
				const annotationId = await library.putAnnotation(draft);
				this.annotations.push({ id: annotationId, ...draft });
				this.sessionIds.push(annotationId);

				const view = this.#reader?.view;

				if (!view) {
					console.warn("Annotations: failed drawing annotation but was saved to ")
					return;
				}

				this.#drawHighlight(view, annotationId, cfi, this.option);
				console.log(`Annotations: annotation was added ${annotationId} and draw succesfully`)
			}
		};
	
		doc.addEventListener("pointerup", up);
		this.#docs.set(doc, () => {
			doc.removeEventListener("pointerup", up);
		});
	}

	undo = async () => {
		const id = this.sessionIds.pop();
		if (id) await this.#erase(id);
	}

	/** Erase mode: tapping an existing mark deletes it. `show-annotation`
	 *  already fires with the tapped key for any drawn overlayer entry, so
	 *  there's no hit-testing to write ourselves. */
	#onShowAnnotation = async (e: any) => {
		if (!this.erasing) return;
		const id = Number(e.detail?.value);
		if (!Number.isNaN(id)) await this.#erase(id);
	}

	/** The one place undo and the eraser both end up: drop the row from the
	 *  db, drop it from the in-memory list, take its mark off the page. */
	async #erase(id: number) {
		const index = this.annotations.findIndex((a) => a.id === id);
		if (index === -1) return;
		const [annotation] = this.annotations.splice(index, 1);
		await library.deleteAnnotation(id);
		this.#eraseDrawing(annotation.value, id);
	}


	// arrow function to solve weird "this" bug
	#onRelocate = () => { 
		const view = this.#reader?.view;

		if (!view) {
			console.warn("Annotations: failed loading annotations")
			return;
		}

		for (let { id, value, option, kind } of this.annotations) {

			switch (kind) { 
				case "highlight":
					this.#drawHighlight(view, id, value, option)
					break;
				case "ink":
					this.#drawInk(view, id, value, option)
					break;
				default:
					console.warn("Annotations: Non e sucesso un cazzo")
			}
		}
	}

	#drawHighlight(view: any, id : number, cfi : string, option : AnnotationOption) {
		const { index, anchor } = view.resolveCFI(cfi);

		const content = view.renderer
			?.getContents()
			?.find((c: any) => c.index === index);

		if (!content?.overlayer) return;

		const range = anchor(content.doc);
		content.overlayer.add(id.toString(), range, this.#overlayer.highlight, option)
	}

	#drawInk(view: any, id: number, value: string, option: AnnotationOption) {
		// NOT DONE YET
		return;
	}
	
	#eraseDrawing(cfi: string, id: number) {
		const view = this.#reader?.view;
		if (!view) return;
		const { index } = view.resolveCFI(cfi);
		const content = view.renderer?.getContents()?.find((c: any) => c.index === index);
		content?.overlayer?.remove(id.toString());
	}

}
