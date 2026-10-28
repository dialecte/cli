/**
 * `dialecte models` - which model each tier (`fast`, `standard`, `strong`, `frontier`) means for the vendor
 * the project uses, so agents name a tier and never a model.
 */
import { getArg, hasFlag } from '../lib/config.ts'
import { missingPackage } from '../lib/missing-package.ts'
import { answerModels } from '../lib/models/answer-models.ts'
import { readRememberedVendor } from '../lib/models/remembered-vendor.ts'

import type { CommandOutput } from '../lib/command-output.types.ts'

export async function run(argv: string[]): Promise<void> {
	const result = runModels({ argv, cwd: process.cwd() })
	process.stderr.write(result.warnings)
	process.stdout.write(result.output)
	process.exitCode = result.exitCode
}

/** The answer, and the warning lines for stderr (an unknown or disagreeing vendor in the manifests). */
export function runModels(params: {
	argv: readonly string[]
	cwd: string
}): CommandOutput & { warnings: string } {
	const missing = missingPackage({ cwd: params.cwd })
	if (missing) return { ...missing, warnings: '' }
	const argv = [...params.argv]
	const remembered = readRememberedVendor(params.cwd)
	const answer = answerModels({
		vendor: getArg(argv, 'vendor') ?? remembered.vendor,
		json: hasFlag(argv, 'json'),
	})
	return { ...answer, warnings: remembered.warnings.map((warning) => `⚠️  ${warning}\n`).join('') }
}
