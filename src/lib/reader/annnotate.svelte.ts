import { Section } from "glow";
import type { ReaderController } from "./reader.svelte";

// NOTE: subject to change based on later implementation of freehand ink support
export type Annotation = {
	key: number,  
	bookid: number,
	kind: "highlight" | "ink", 
	index: number,
	value : string, // Note this is a CFI string 
	color: string,
	createdAt: Date
	option: Object
}
 
function loadAnnotations(bookId: number): Annotation[] {
	// load in some kinda test data for now
	return [{
		key: 1,
		bookid: 1,
		kind: "highlight",
		index: 3,
		color: "red",
		value: "epubcfi(/6/8!/4/2[halftitlepage]/2,/1:0,/1:7)",
		createdAt: new Date(),
		option: {color : "blue"}
	}];
}

const OVERLAYER_URL = "/foliate-js/overlayer.js";
let overlayerModule: Promise<any> | null = null;
const loadOverlayer = (): Promise<any> =>
	(overlayerModule ??= import(/* @vite-ignore */ OVERLAYER_URL));


export class AnnotationController {
	#reader: any = null;
	#bookid = 0;
	#overlayer = $state<any>(null); // overlayer.js, once it lands offers draw methods
	#docs = new Map<Document, () => void>();
	annotations = $state<Annotation[]>([])
	#dragging = false;
	panelOpen = $state(false);


	attach(reader: ReaderController) {
		this.#reader = reader;
		if (!reader.book) {
			console.warn("Annotations: book not found");
			return;
		}
		this.#bookid = reader.book.id;
		this.annotations = loadAnnotations(this.#bookid);

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
		}
	}

	observe(doc: Document, index: number) {
		if (this.#docs.has(doc)) return;
		const down = () => {
			this.#dragging = true;
			// this.#hide();
		};
		const up = () => {
			this.#dragging = false;
			// this.#schedule();
		};
		const changed = () => {
			const sel = doc.getSelection();
			// if (!sel || sel.isCollapsed) this.#hide();
			// else if (!this.#dragging) this.#schedule();
			console.log(this.#reader.view.getCFI(index, sel?.getRangeAt(0)))
		};
		doc.addEventListener("pointerdown", down);
		doc.addEventListener("pointerup", up);
		doc.addEventListener("selectionchange", changed);
		// the anchor is a viewport position — a scrolled page invalidates it
		// doc.addEventListener("scroll", this.#hide, { passive: true });
		this.#docs.set(doc, () => {
			doc.removeEventListener("pointerdown", down);
			doc.removeEventListener("pointerup", up);
			doc.removeEventListener("selectionchange", changed);
			// doc.removeEventListener("scroll", this.#hide);
		});
	}



	#resolves(cfi: string): boolean {
		try {
			const { index } = this.#reader?.view?.resolveCFI?.(cfi) ?? {};
			return typeof index === "number" && !!this.#reader?.view?.book?.sections?.[index];
		} catch {
			return false;
		}
	}

	// arrow function to solve weird bug
	#onRelocate = () => { 
		const view = this.#reader?.view;

		if (!view) {
			console.warn("Annotations: failed loading annotations")
			return;
		}

		for (let { key, value, option } of this.annotations) {
			const { index, anchor } = view.resolveCFI(value);

			// Get specific overlayer per index
			const content = view.renderer
			?.getContents()
			?.find((c: any) => c.index === index);

			if (!content?.overlayer) continue;

			const range = anchor(content.doc);

			content.overlayer.add(key, range, this.#overlayer.highlight, option)
		}
	}
	

}
