/** The text of the one-line script a hand-over writes: it runs `dialecte handover run` on its folder. */
import { shellQuote } from '../shell-quote.ts'
import { COMMIT_SCRIPT_TEMPLATE } from './handover.constants.ts'

import type { HandoverPlan } from './handover.types.ts'

export function renderCommitScript(params: {
	plan: HandoverPlan
	/** The folder the script is written in. */
	folder: string
	/** The cli that writes the script: the fallback when the repository installs none that can run it. */
	cliPath: string
}): string {
	const { plan } = params
	const count = plan.lots.length
	const header = [
		`${count} commit(s) on ${plan.branch} in ${plan.repository}, on top of ${plan.head.slice(0, 12)}.`,
		`Gates before the hand-over: ${plan.gates ?? 'not stated'}.`,
		'Runs `dialecte handover run` on this folder: it checks the branch, HEAD, an empty index, the files',
		'against the reviewed snapshot and the references, then commits lot by lot. Commits only, never pushes.',
		'Written by `dialecte handover`: run `dialecte handover --rehash <lots.json>` after an edit.',
	]
		.flatMap((line) => line.split(/\r?\n|\r/))
		.map((line) => `# ${line}`.trimEnd())
		.join('\n')
	const values: Record<string, string> = {
		__HEADER__: header,
		__REPOSITORY__: shellQuote(plan.repository),
		__FALLBACK__: shellQuote(
			`node ${shellQuote(params.cliPath)} handover run ${shellQuote(params.folder)}`,
		),
	}
	return COMMIT_SCRIPT_TEMPLATE.replace(
		/__[A-Z_]+__/g,
		(placeholder) => values[placeholder] ?? placeholder,
	)
}
