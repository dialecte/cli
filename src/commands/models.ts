/**
 * `dialecte models` - which model each tier (`fast`, `standard`, `strong`, `frontier`) means for the vendor
 * the project uses, so agents name a tier and never a model.
 */
import { getArg, hasFlag } from '../lib/config.ts'
import { missingPackage } from '../lib/missing-package.ts'
import { answerModels } from '../lib/models/answer-models.ts'
import { readRememberedVendor } from '../lib/models/remembered-vendor.ts'
import { printOut, textOf } from '../lib/print/print.ts'

import type { CommandOutput } from '../lib/command-output.types.ts'
import type { PrintedText } from '../lib/print/print.types.ts'

export async function run(argv: string[]): Promise<void> {
	const result = runModels({ argv, cwd: process.cwd() })
	printOut({ stream: 'stderr', text: result.warnings, ending: 'as-is' })
	printOut({ stream: 'stdout', text: result.output, ending: 'as-is' })
	process.exitCode = result.exitCode
}

/**
 * What `dialecte models` prints for `argv` run in `cwd`, and the warning lines for stderr (an unknown or disagreeing
 * vendor in the manifests).
 *
 * @intent learn which model a tier means without the command line, map the fast, standard, strong and frontier tiers to the project's vendor
 */
export function runModels(params: {
	argv: readonly string[]
	cwd: string
}): CommandOutput & { warnings: PrintedText } {
	const missing = missingPackage({ cwd: params.cwd })
	if (missing) return { ...missing, warnings: textOf([]) }
	const argv = [...params.argv]
	const remembered = readRememberedVendor(params.cwd)
	const answer = answerModels({
		vendor: getArg(argv, 'vendor') ?? remembered.vendor,
		json: hasFlag(argv, 'json'),
	})
	const warnings = remembered.warnings.map((warning) => `⚠️  ${warning}`)
	return { ...answer, warnings: textOf(warnings.length === 0 ? [] : [...warnings, '']) }
}
