import { renderGlobalHelp } from './render-help.ts'

import { describe, expect, it } from 'vitest'

/** The notes block of the global help as it stood at ddd5034, before the zero-config flags became one constant. */
const NOTES_AT_BASE = [
	'Exit codes: 0 an answer or green, 1 nothing found or a failed check, 2 usage or refused;',
	'a command says when it differs. --help or -h before -- prints that command only, runs nothing.',
	'',
	'Zero-config (coverage, bench, narrowing, audit): namespace = capitalized package name, versions',
	'from src/<version>/definition/; core is benched through a built-in test dialect. Override in the',
	'package.json "dialecte" field or with flags:',
	'  --namespace <Name>  --entry <import>  --constants-dir <dir>  --out <dir>  --version <v>  --tsconfig <f>',
	"Generated files are formatted with the package's oxfmt: --format-config <path> | --no-format.",
	'Env: RUNS=5 dialecte bench (repetitions for the min); COVERAGE_CHILD_CAP=N (cap child edges).',
].join('\n')

describe('renderGlobalHelp', () => {
	it('the notes, zero-config lines included → byte-identical to the base', () => {
		expect(renderGlobalHelp().endsWith(NOTES_AT_BASE)).toBe(true)
	})
})
