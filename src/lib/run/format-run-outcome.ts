import type { RunError, RunOutcome } from './run.types.ts'

/**
 * The outcome as a few lines of text, the same every time for the same outcome: the verdict (and the
 * error), the operations per tag (`+created ~updated -deleted`), the diagnostics, the staged
 * transaction, the expectations, the export, what the script returned.
 */
export function formatRunOutcome(params: { outcome: RunOutcome }): string {
	return runOutcomeLines(params).join('\n')
}

/** The outcome's lines, one entry per printed line. */
export function runOutcomeLines(params: { outcome: RunOutcome }): string[] {
	const { outcome } = params
	const lines: string[] = []

	if (outcome.error) lines.push(...formatError({ error: outcome.error }))
	else lines.push(outcome.ok ? 'ok' : 'failed: expectations not met')

	const operations = Object.entries(outcome.operations).map(
		([tagName, counts]) => `${tagName} +${counts.created} ~${counts.updated} -${counts.deleted}`,
	)
	lines.push(`operations: ${operations.length ? operations.join(', ') : 'none'}`)

	lines.push(`diagnostics: ${outcome.diagnostics.length || 'none'}`)
	for (const diagnostic of outcome.diagnostics)
		lines.push(
			`  ${diagnostic.severity} ${diagnostic.source}/${diagnostic.code} on ${diagnostic.ref.tagName}#${diagnostic.ref.id}: ${diagnostic.message}`,
		)

	if (outcome.prepared) {
		lines.push(
			`prepared: ${outcome.prepared.label ?? 'unlabelled transaction'} - staged, nothing committed`,
		)
		if (outcome.prepared.report !== undefined)
			lines.push(
				`  report ${JSON.stringify(outcome.prepared.report)}${noted({ note: outcome.prepared.reportNote })}`,
			)
	}

	if (outcome.expectations) {
		const { passed, failed } = outcome.expectations
		lines.push(`expectations: ${passed} passed, ${failed.length} failed`)
		for (const failure of failed) lines.push(`  ✗ ${failure.message}`)
	}

	if (outcome.export) lines.push(`export: ${outcome.export.bytes} bytes`)
	if (outcome.result !== undefined)
		lines.push(`result: ${JSON.stringify(outcome.result)}${noted({ note: outcome.resultNote })}`)

	return lines
}

function formatError(params: { error: RunError }): string[] {
	const { error } = params
	if (!error.code) return [`failed: ${error.message}`]

	const location =
		error.path ?? (error.ref ? `${error.ref.tagName}${error.ref.id ? `#${error.ref.id}` : ''}` : '')
	const where = location ? ` at ${location}` : error.pathNote ? ` (${error.pathNote})` : ''
	const lines = [`failed: ${error.code} ${error.key}${where}`]
	lines.push(`  ${error.detail ?? error.message}`)
	if (error.meta) lines.push(`  meta ${JSON.stringify(error.meta)}`)
	lines.push(`  explain: dialecte explain ${error.code}`)
	return lines
}

function noted(params: { note: string | undefined }): string {
	return params.note ? ` - ${params.note}` : ''
}
