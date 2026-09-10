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
	createdAt : Date
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
	}];
}

// from what I understand epubcfi is in static for whatever reason this is some kinda funky work around
const CFI_URL = "/foliate-js/epubcfi.js";
let cfiModule: Promise<any> | null = null;
const loadCFI = (): Promise<any> =>
	(cfiModule ??= import(/* @vite-ignore */ CFI_URL));


const OVERLAYER_URL = "/foliate-js/overlayer.js";
let overlayerModule: Promise<any> | null = null;
const loadOverlayer = (): Promise<any> =>
	(overlayerModule ??= import(/* @vite-ignore */ OVERLAYER_URL));


export class AnnotationController {
	#reader: any = null;
	#bookid = 0;
	#cfi = $state<any>(null); // epubcfi.js, once it lands
	#overlayer = $state<any>(null); // epubcfi.js, once it lands
	#docs = new Map<Document, () => void>();
	#dragging = false;
	annotations = $state<Annotation[]>([])


	attach(reader: ReaderController, bookId: number) {
		this.#reader= reader;
		this.#bookid = bookId;
		this.annotations = loadAnnotations(bookId);

		loadCFI()
			.then((m) => {
				this.#cfi = m;
			})
			.catch((e) => console.warn("annotations unavailable", e));
		
		loadOverlayer()
			.then((m) => {
				this.#overlayer = m;
			})
			.catch((e) => console.warn("annotations unavailable", e));
		// view.addEventListener("relocate", this.#onRelocate);

		// note : use onSection
		this.#reader.onSection(() => {
			const view = this.#reader.view;

			if (!view) return;

			// if (!overlayer) return;
			for (let { key, value } of this.annotations) {
				const { index, anchor } = view.resolveCFI(value);

				// Get specific overlayer
				console.log(index)
				const content = view.renderer
				?.getContents()
				?.find((c: any) => c.index === index);

				const range = anchor(content.doc);

				content?.overlayer.add(key, range, this.#overlayer.highlight, { color : "red" } )
				


            	// const { _ , anchor } = await this.resolveNavigation(value)
				// const range = anchor;
                // overlayer.add(value, range, this.#searchDraw, this.#searchDrawOptions)


				// console.log(`I ran ${annotation.value}`);
				


				// overlayer.add(annotation, Overlayer);
				}
		});
	}

	detatch() { 
		// this.#view?.removeEventListener?.("relocate", this.#onRelocate);
		this.#reader = null;
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
	

}
