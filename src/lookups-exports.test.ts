/**
 * R1-A6: the library entry exports every type its functions answer with: `CommandOutput.output` is a `PrintedText`,
 * so a consumer must be able to name it.
 */
import { join } from 'node:path'

import { SOURCE_TREE_SCAN_CASE_TIMEOUT } from '../test/test-timing.constants.ts'
import { LOOKUPS_ENTRY, PACKAGE_FOLDER, TYPE_EXPORTS } from './lookups-exports.constants.ts'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/** The names the entry exports (values and types), as the compiler resolves its re-exports. */
function exportedNamesOf(entry: string): string[] {
	const config = ts.readConfigFile(join(PACKAGE_FOLDER, 'tsconfig.json'), ts.sys.readFile)
	const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, PACKAGE_FOLDER)
	const program = ts.createProgram({ rootNames: [entry], options })
	const checker = program.getTypeChecker()
	const source = program.getSourceFile(entry)
	const symbol = source ? checker.getSymbolAtLocation(source) : undefined
	return symbol ? checker.getExportsOfModule(symbol).map((exported) => exported.getName()) : []
}

describe('the lookups entry', { timeout: SOURCE_TREE_SCAN_CASE_TIMEOUT }, () => {
	for (const name of TYPE_EXPORTS)
		it(`${name} -> exported from the entry as a type`, () => {
			expect(exportedNamesOf(LOOKUPS_ENTRY)).toContain(name)
		})
})
