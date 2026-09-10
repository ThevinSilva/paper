import type { ReaderController } from "./reader.svelte";

// NOTE: subject to change based on later implementation of freehand ink support
export type Annotation = {
	id: number,  
	bookid: number,
	kind: "highlight" | "ink", 
	sectionIndex: number,
	cfi : "",
	color: "string",
	createdAt : Date
}
 
function loadAnnotations(bookId: number): Annotation[] {
	// load in some kinda test data for now
	return [];
}

// from what I understand epubcfi is in static for whatever reason this is some kinda funky work around
const CFI_URL = "/foliate-js/epubcfi.js";
let cfiModule: Promise<any> | null = null;
const loadCFI = (): Promise<any> =>
	(cfiModule ??= import(/* @vite-ignore */ CFI_URL));


export class AnnotationController {
	#view: any = null; 
	#bookid = 0;
	#cfi = $state<any>(null); // epubcfi.js, once it lands
	#docs = new Map<Document, () => void>();
	#dragging = false;
	list = $state<Annotation[]>([])


	attach(reader: ReaderController, bookId: number) {
		this.#view = reader.view;
		this.#bookid = bookId;
		this.list = loadAnnotations(bookId);
		loadCFI()
			.then((m) => {
				this.#cfi = m;
			})
			.catch((e) => console.warn("annotations unavailable", e));
		// view.addEventListener("relocate", this.#onRelocate);

	}

	detatch() { 
		// this.#view?.removeEventListener?.("relocate", this.#onRelocate);
		this.#view = null;
		// this.#pageCfi = "";
		// this.#pageRange = null;

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
			console.log(this.#view.getCFI(index, sel?.getRangeAt(0)))
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
			const { index } = this.#view?.resolveCFI?.(cfi) ?? {};
			return typeof index === "number" && !!this.#view?.book?.sections?.[index];
		} catch {
			return false;
		}
	}
	

}
