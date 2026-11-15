import { join } from 'node:path'

import { runRules } from '../src/commands/rules.ts'
import { createScratchRepository, temporaryFolder } from './scratch-repository.ts'

import type { RuleFinding } from '../src/lib/rules/check-code-rules.types.ts'
import type { LineOfParams, RunRulesJsonParams, TwiceTestParams } from './rules-import-run.types.ts'

/** A module's source: the lines joined, with a final newline. */
export function moduleOf(lines: string[]): string {
	return [...lines, ''].join('\n')
}

/** A test whose act calls each name twice, in the order given. */
export function twiceTestOf(params: TwiceTestParams): string {
	return moduleOf([
		...params.imports,
		'const testCases = {',
		"\t'a widget': { sourceXml: '<Root/>' },",
		'}',
		'runWidgetTestCases.withExport({',
		'\ttestCases,',
		'\tact: async () => {',
		...params.names.flatMap((name) => [`\t\t${name}({ id: 1 })`, `\t\t${name}({ id: 2 })`]),
		'\t},',
		'})',
	])
}

/** The findings of `rules` on one file of a scratch repository, given relative or as an absolute path. */
export function runJson(params: RunRulesJsonParams): RuleFinding[] {
	const root = createScratchRepository(params.files)
	const result = runRules({
		cwd: root,
		argv: [params.absolute ? join(root, params.file) : params.file, '--json'],
		environment: { XDG_CONFIG_HOME: temporaryFolder('dialecte-config-') },
	})
	return (JSON.parse(result.output) as { findings: RuleFinding[] }).findings
}

/** The 1-based number of the first line of `text` that holds `needle`. */
export function lineOf(params: LineOfParams): number {
	return params.text.split('\n').findIndex((line) => line.includes(params.needle)) + 1
}
