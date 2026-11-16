import type ts from 'typescript'

/**
 * What one run reads of a package's files, each once: where a specifier leads from a file, and a file's syntax tree
 * (parent nodes set), shared by the Dialecte-change scope and the unit context.
 */
export type ImportReading = {
	/** The package file a specifier names from a file, as a path from the root with `/`; undefined when none. */
	localFileOf(request: { specifier: string; from: string }): string | undefined
	/** The file's syntax tree; undefined for a file that cannot be read. */
	sourceOf(file: string): ts.SourceFile | undefined
	/**
	 * The tree of a checked file whose text the caller read: the tree kept for the run when it holds the same text,
	 * else one parsed now and kept, so a checked file that another one imports is parsed once.
	 */
	sourceOfText(params: { file: string; text: string }): ts.SourceFile
}
