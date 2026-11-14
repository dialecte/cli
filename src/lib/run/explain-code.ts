import { CORE_CATALOGUE_NAME } from './run.constants.ts'

import type {
	Catalogues,
	ExplainedCode,
	NamedDiagnosticCatalogue,
	NamedErrorCatalogue,
} from './explain-code.types.ts'
import type { ModuleNamespace } from './run.types.ts'

/**
 * The catalogue entries a code names - an error code (`D3009`) or key (`XSI_TYPE_REQUIRED`), a
 * diagnostic code (`unresolved-reference`, which several sources may share) - in catalogue order.
 */
export function explainCode(params: { code: string; catalogues: Catalogues }): ExplainedCode[] {
	const wanted = params.code.toLowerCase()
	const found: ExplainedCode[] = []

	for (const catalogue of params.catalogues.errors) {
		for (const [key, entry] of Object.entries(catalogue.entries)) {
			if (entry.code.toLowerCase() !== wanted && key.toLowerCase() !== wanted) continue
			found.push({
				kind: 'error',
				catalogue: catalogue.name,
				code: entry.code,
				key,
				message: entry.message,
				...(entry.explanation && { explanation: entry.explanation }),
			})
		}
	}

	for (const catalogue of params.catalogues.diagnostics) {
		for (const [code, entry] of Object.entries(catalogue.codes)) {
			if (code.toLowerCase() !== wanted) continue
			found.push({
				kind: 'diagnostic',
				catalogue: catalogue.name,
				source: catalogue.source,
				code,
				severity: entry.severity,
				family: entry.family,
				message: entry.message,
				...(entry.explanation && { explanation: entry.explanation }),
			})
		}
	}

	return found
}

/**
 * The catalogues the installed packages hold: core's error catalogue, and every export of the
 * dialecte module shaped as an error catalogue (`defineErrors`) or a diagnostic catalogue, by name.
 */
export function collectCatalogues(params: {
	coreIndex: ModuleNamespace
	dialecte?: ModuleNamespace
}): Catalogues {
	const { coreIndex, dialecte } = params
	const catalogues: Catalogues = { errors: [], diagnostics: [] }
	if (isErrorCatalogue(coreIndex.ERROR_CATALOG))
		catalogues.errors.push({ name: CORE_CATALOGUE_NAME, entries: coreIndex.ERROR_CATALOG })

	const exports = Object.entries(dialecte ?? {}).sort(([left], [right]) =>
		left.localeCompare(right),
	)
	for (const [name, value] of exports) {
		if (isErrorCatalogue(value)) catalogues.errors.push({ name, entries: value })
		else if (isDiagnosticCatalogue(value))
			catalogues.diagnostics.push({ name, source: value.source, codes: value.codes })
	}
	return catalogues
}

function isErrorCatalogue(value: unknown): value is NamedErrorCatalogue['entries'] {
	if (typeof value !== 'object' || value === null) return false
	const entries = Object.values(value)
	return entries.length > 0 && entries.every(isErrorEntry)
}

function isErrorEntry(entry: unknown): boolean {
	if (typeof entry !== 'object' || entry === null) return false
	const candidate = entry as Record<string, unknown>
	return typeof candidate.code === 'string' && typeof candidate.message === 'string'
}

function isDiagnosticCatalogue(
	value: unknown,
): value is Pick<NamedDiagnosticCatalogue, 'source' | 'codes'> {
	if (typeof value !== 'object' || value === null) return false
	const candidate = value as Record<string, unknown>
	if (typeof candidate.source !== 'string') return false
	if (typeof candidate.codes !== 'object' || candidate.codes === null) return false
	return Object.values(candidate.codes).every(function isDiagnosticEntry(entry: unknown) {
		if (typeof entry !== 'object' || entry === null) return false
		const diagnosticEntry = entry as Record<string, unknown>
		return (
			typeof diagnosticEntry.severity === 'string' && typeof diagnosticEntry.message === 'string'
		)
	})
}

/** An explained code as a few lines: the heading, the message, when, fix, docs. */
export function explainedCodeLines(params: { explained: ExplainedCode }): string[] {
	const { explained } = params
	const heading =
		explained.kind === 'error'
			? `${explained.code} ${explained.key} - error (${explained.catalogue})`
			: `${explained.code} - ${explained.severity} ${explained.family} diagnostic (${explained.source}, ${explained.catalogue})`
	const lines = [heading, `  ${explained.message}`]
	const { explanation } = explained
	if (!explanation) lines.push('  no explanation in its catalogue')
	else {
		lines.push(`  when: ${explanation.when}`, `  fix: ${explanation.fix}`)
		if (explanation.docs) lines.push(`  docs: ${explanation.docs}`)
	}
	return lines
}
