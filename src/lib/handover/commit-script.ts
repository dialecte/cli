/** The text of the commit-by-lots script a hand-over writes. */
import { REFERENCE_FREE_EXTENSIONS } from '../rules/committed-text.constants.ts'
import { COMMIT_SCRIPT_TEMPLATE } from './handover.constants.ts'

import type { ReferencePattern } from '../rules/committed-text.types.ts'
import type { HandoverPlan } from './handover.types.ts'

export function renderCommitScript(params: {
	plan: HandoverPlan
	referencePatterns: readonly ReferencePattern[]
	scriptPath: string
	lockPath: string
}): string {
	const { plan } = params
	const count = plan.lots.length
	const header = [
		`${count} commit(s) on ${plan.branch} in ${plan.repository}, on top of ${plan.head.slice(0, 12)}.`,
		`Gates before the hand-over: ${plan.gates ?? 'not stated'}.`,
		'Checks the branch, HEAD, an empty index, the files against the reviewed snapshot (files.sha256),',
		'that no other file changed, and refuses plan tags and standard citations. Commits only, never pushes.',
		'Written by `dialecte handover`: run `dialecte handover --rehash <lots.json>` after an edit.',
	]
		.flatMap((line) => line.split(/\r?\n|\r/))
		.map((line) => `# ${line}`.trimEnd())
		.join('\n')
	const values: Record<string, string> = {
		__HEADER__: header,
		__REPOSITORY__: shellQuote(plan.repository),
		__BRANCH__: shellQuote(plan.branch),
		__HEAD__: shellQuote(plan.head),
		__REFERENCES__: shellQuote(
			params.referencePatterns.map((pattern) => `(${pattern.source})`).join('|'),
		),
		__LOCK__: shellQuote(params.lockPath),
		__SCRIPT__: shellQuote(params.scriptPath),
		__LOT_CALLS__: plan.lots
			.map((_lot, index) => `commit_lot "$HERE/lot${index + 1}.txt" "$HERE/lot${index + 1}.msg"`)
			.join('\n'),
		__COUNT__: String(count),
		__REFERENCE_FREE_CASE__: REFERENCE_FREE_EXTENSIONS.map((extension) => `*.${extension}`).join(
			'|',
		),
	}
	return COMMIT_SCRIPT_TEMPLATE.replace(
		/__[A-Z_]+__/g,
		(placeholder) => values[placeholder] ?? placeholder,
	)
}

/** One shell word, whatever it holds. */
export function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`
}
