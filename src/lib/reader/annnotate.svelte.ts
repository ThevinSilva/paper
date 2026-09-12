import * as library from "$lib/library";
import type { ReaderController } from "./reader.svelte";


// NOTE: subject to change based on later implementation of freehand ink support
export type Annotation = {
	id: number,
	bookId: number,
	kind: "highlight" | "ink", // magari piu nel futuro 
	index: number,
	value : string, // Note this is a CFI string
	createdAt: Date
	option: Object
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
	
	option = $state({kind: "highlight", color: "#ffeb3b"});
	panelOpen = $state(false);

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

		return () => { 
			this.#reader.view.removeEventListener?.("relocate", this.#onRelocate);
			this.#reader = null;
			this.annotations = [];
			this.sessionIds = [];
		}
	}

	
	// ── selection tracking ─────────────────────────────────────────
	// lifted straight from quote.svelte.ts ngl heh heh 
	observe(doc: Document, index: number) {
		if (this.#docs.has(doc)) return;

		const up = async () =>  {
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
		if (!id) return;
		const annotation = this.annotations.find((a) => a.id === id);
		this.annotations = this.annotations.filter((a) => a.id !== id);
		await library.deleteAnnotation(id);
		if (annotation) this.#eraseDrawing(annotation.value, id);
	}



	#resolves(cfi: string): boolean {
		try {
			const { index } = this.#reader?.view?.resolveCFI?.(cfi) ?? {};
			return typeof index === "number" && !!this.#reader?.view?.book?.sections?.[index];
		} catch {
			return false;
		}
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
				case "ink":
					this.#drawInk(view, id, value, option)
			}
		}
	}

	#drawHighlight(view: any, id : number, cfi : string, option : object) { 
		const { index, anchor } = view.resolveCFI(cfi);

		const content = view.renderer
			?.getContents()
			?.find((c: any) => c.index === index);

		if (!content?.overlayer) return;

		const range = anchor(content.doc);
		content.overlayer.add(id.toString(), range, this.#overlayer.highlight, option)
	}

	#drawInk(view: any, id: number, value: string, option: object) { 
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
