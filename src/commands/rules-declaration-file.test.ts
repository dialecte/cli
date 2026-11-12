import { createScratchRepository, writeFiles } from '../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runRules } from './rules.ts'

import { describe, expect, it } from 'vitest'

describe('runRules on a declaration file', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	it('a changed .d.ts with a syntax error → one unreadable-file finding at its place, never thrown', () => {
		const root = createScratchRepository({ 'src/types.d.ts': 'export declare const a: string\n' })
		writeFiles({ root, files: { 'src/types.d.ts': 'export declare const a: = string\n' } })

		const result = runRules({ cwd: root, argv: [] })

		expect(result.exitCode).toBe(1)
		expect(result.output).toMatch(/^src\/types\.d\.ts:1:\d+ {2}error {2}unreadable-file {2}/m)
	})

	it('a changed .d.ts that parses → no unreadable-file finding, never thrown', () => {
		const root = createScratchRepository({ 'src/types.d.ts': 'export declare const a: string\n' })
		writeFiles({
			root,
			files: { 'src/types.d.ts': 'export declare function b(value: string): number\n' },
		})

		const result = runRules({ cwd: root, argv: [] })

		expect(result.output).not.toContain('unreadable-file')
		expect(result.output).toContain('rules: 1 file(s)')
	})
})
