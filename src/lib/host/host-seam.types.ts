/** The host seam scan's inputs and findings. */
import type { HostNouns } from './host.types.ts'

/** A runtime host vendor as the scan reads it: its folder is `src/lib/host/<name>/`. */
export type HostSeamVendor = {
	name: string
	/** The cli the vendor runs: its exact literal is the vendor's alone. */
	tool: string
	/** Its change-request noun as words of an identifier, lower case: refused outside every vendor's folders. */
	nounWords: readonly string[]
	/** Its change-request noun in a file's path: refused outside every vendor's folders. */
	nounPathPattern: RegExp
	/** Its change-request nouns as printed: refused in a source string outside every vendor's folders. */
	nouns: HostNouns
}

/**
 * What a finding breaks: a tool literal outside its vendor's folder, an import across the seam, or a vendor's
 * change-request noun outside the vendor's folders (in an identifier, or in a file's name).
 */
export type HostSeamFindingKind =
	| 'tool-literal'
	| 'vendor-import'
	| 'config-import'
	| 'noun-identifier'
	| 'noun-path'
	| 'noun-text'

/** One breach of the seam: the file (relative to the scanned root, `/`-separated), its line (1-based) and what it breaks. */
export type HostSeamFinding = {
	file: string
	line: number
	kind: HostSeamFindingKind
	/** The literal, the identifier, the import specifier or the file's path. */
	text: string
}

/** A finding with its 1-based column, kept to order the findings of one file. */
export type PlacedHostSeamFinding = HostSeamFinding & { column: number }
