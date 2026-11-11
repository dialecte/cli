/**
 * R4-1: the `CommandOutput` of the library entry holds a plain string: a consumer that builds one with a string
 * type-checks, and `PrintedText` is still exported. Proven by compiling a consumer's snippet against the entry.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../test/scratch-repository.ts'
import { SOURCE_TREE_SCAN_CASE_TIMEOUT } from '../test/test-timing.constants.ts'
import { LOOKUPS_ENTRY, PACKAGE_FOLDER } from './lookups-exports.constants.ts'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import type { CommandOutput } from './lookups.ts'

/** A plain object, as a consumer builds it: must be assignable to the entry's type. */
const PLAIN: CommandOutput = { exitCode: 0, output: 'plain text' }

/** The messages of the compiler's errors for `source` compiled as a file importing the entry. */
function errorsOf(source: string): string[] {
	const file = join(temporaryFolder('dialecte-consumer-'), 'consumer.ts')
	writeFileSync(file, source)
	const config = ts.readConfigFile(join(PACKAGE_FOLDER, 'tsconfig.json'), ts.sys.readFile)
	const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, PACKAGE_FOLDER)
	const program = ts.createProgram({ rootNames: [file], options })
	return ts
		.getPreEmitDiagnostics(program, program.getSourceFile(file))
		.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
}

describe(
	'the lookups entry as a consumer builds on it',
	{ timeout: SOURCE_TREE_SCAN_CASE_TIMEOUT },
	() => {
		it('an object { exitCode: 0, output: a plain string } -> assignable to CommandOutput', () => {
			const errors = errorsOf(
				`import type { CommandOutput } from '${LOOKUPS_ENTRY}'\nexport const answer: CommandOutput = { exitCode: 0, output: 'plain text' }\n`,
			)

			expect(PLAIN.output).toBe('plain text')
			expect(errors).toEqual([])
		})

		it('PrintedText -> still importable as a type from the entry', () => {
			const errors = errorsOf(
				`import type { PrintedText } from '${LOOKUPS_ENTRY}'\nexport type Kept = PrintedText\n`,
			)

			expect(errors).toEqual([])
		})
	},
)
