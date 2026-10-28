/** What a catalogue says of a code beyond its message. */
export type CodeExplanation = {
	when: string
	fix: string
	docs?: string
}

/** One catalogue entry a code names: an error of an error catalogue, or a diagnostic of a diagnostic catalogue. */
export type ExplainedCode =
	| {
			kind: 'error'
			/** `core`, or the dialecte package's export holding the catalogue. */
			catalogue: string
			code: string
			key: string
			message: string
			explanation?: CodeExplanation
	  }
	| {
			kind: 'diagnostic'
			catalogue: string
			source: string
			code: string
			severity: string
			family: string
			message: string
			explanation?: CodeExplanation
	  }

/** An error catalogue as `defineErrors` (or core's `ERROR_CATALOG`) holds it, under the name it was found by. */
export type NamedErrorCatalogue = {
	name: string
	entries: Record<string, { code: string; message: string; explanation?: CodeExplanation }>
}

/** A diagnostic catalogue, under the name it was found by. */
export type NamedDiagnosticCatalogue = {
	name: string
	source: string
	codes: Record<
		string,
		{ severity: string; family: string; message: string; explanation?: CodeExplanation }
	>
}

export type Catalogues = {
	errors: NamedErrorCatalogue[]
	diagnostics: NamedDiagnosticCatalogue[]
}
