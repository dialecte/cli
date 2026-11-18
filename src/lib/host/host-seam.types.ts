/** The host seam scan's inputs and findings. */

/** A runtime host vendor as the scan reads it: its folder is `src/lib/host/<name>/`. */
export type HostSeamVendor = {
	name: string
	/** The cli the vendor runs: its exact literal is the vendor's alone. */
	tool: string
}

/** What a finding breaks: a tool literal outside its vendor's folder, or an import across the seam. */
export type HostSeamFindingKind = 'tool-literal' | 'vendor-import' | 'config-import'

/** One breach of the seam: the file (relative to the scanned root, `/`-separated), its line (1-based) and what it breaks. */
export type HostSeamFinding = {
	file: string
	line: number
	kind: HostSeamFindingKind
	/** The literal, the identifier or the import specifier. */
	text: string
}

/** A finding with its 1-based column, kept to order the findings of one file. */
export type PlacedHostSeamFinding = HostSeamFinding & { column: number }
