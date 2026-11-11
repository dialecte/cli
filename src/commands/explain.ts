/**
 * `dialecte explain <code>` - what an error or diagnostic code means, when it is raised, the usual fix
 * and the docs page, read from the catalogues of the installed core and dialecte.
 */
import { jsonOf, textOf } from '../lib/print/print.ts'
import { collectCatalogues, explainCode, explainedCodeLines } from '../lib/run/explain-code.ts'
import { loadInstalledPackages } from '../lib/run/load-run-environment.ts'
import { EXPLAIN_USAGE } from './explain.constants.ts'
import { processOutput } from './process-output.ts'
import { EXIT_FAILED, EXIT_OK, EXIT_USAGE } from './run.constants.ts'

import type { RunCommandParams } from './run.types.ts'

export async function explain(argv: string[]): Promise<void> {
	const exitCode = await explainCommand({
		argv,
		cwd: process.cwd(),
		output: processOutput(),
	})
	if (exitCode !== EXIT_OK) process.exit(exitCode)
}

/** Answers 0 with the entries found, 1 when no catalogue knows the code, 2 on a usage error. */
export async function explainCommand(params: RunCommandParams): Promise<number> {
	const { argv, cwd, output } = params
	const packageIndex = argv.indexOf('--package')
	const packageName = packageIndex >= 0 ? argv[packageIndex + 1] : undefined
	const json = argv.includes('--json')
	const packageValueIndex = packageIndex >= 0 ? packageIndex + 1 : -1
	const positionals = argv.filter(
		(argument, index) => !argument.startsWith('--') && index !== packageValueIndex,
	)
	const unknownOptions = argv.filter(
		(argument) => argument.startsWith('--') && argument !== '--package' && argument !== '--json',
	)
	if (
		positionals.length !== 1 ||
		unknownOptions.length > 0 ||
		(packageIndex >= 0 && !packageName)
	) {
		output.stderr(textOf([EXPLAIN_USAGE]))
		return EXIT_USAGE
	}
	const [code] = positionals

	let catalogues: ReturnType<typeof collectCatalogues>
	try {
		const installed = await loadInstalledPackages({
			projectDirectory: cwd,
			packageName,
			dialecteRequired: false,
		})
		catalogues = collectCatalogues({ coreIndex: installed.coreIndex, dialecte: installed.dialecte })
	} catch (thrown) {
		output.stderr(textOf([thrown instanceof Error ? thrown.message : String(thrown)]))
		return EXIT_USAGE
	}

	const found = explainCode({ code, catalogues })
	if (json) output.stdout(jsonOf(found, 2))
	else if (found.length === 0) {
		const searched = [...catalogues.errors, ...catalogues.diagnostics].map(({ name }) => name)
		output.stdout(textOf([`no code "${code}" in the catalogues of ${searched.join(', ')}`]))
	} else
		output.stdout(
			textOf(
				found.flatMap((explained, index) => [
					...(index === 0 ? [] : ['']),
					...explainedCodeLines({ explained }),
				]),
			),
		)
	return found.length > 0 ? EXIT_OK : EXIT_FAILED
}
