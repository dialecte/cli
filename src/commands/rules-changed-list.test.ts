/**
 * `dialecte rules` without a file argument reads the changed list from DIALECTE_GATE_CHANGED when it is set (a
 * scoped gate step: NUL-separated paths); a file a rule cannot read or parse is an error line, never a silent skip.
 */
import { chmodSync } from 'node:fs'
import { join } from 'node:path'

import { rulesOutcomeOf as outcomeOf } from '../../test/rules-outcome.ts'
import {
	createScratchRepository,
	temporaryFolder,
	writeFiles,
} from '../../test/scratch-repository.ts'
import {
	BROKEN_TEXT,
	CHANGED_VARIABLE,
	CLEAN_TEXT,
	UNPARSABLE_TEXT,
} from '../../test/step4-cases.constants.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runRules } from './rules.ts'

import { describe, expect, it } from 'vitest'

/** The last line of a run's output: its summary. */
function summaryOf(output: string): string {
	return output.split('\n').at(-1) ?? ''
}

/** The changed file a scoped step gets: `paths` NUL-terminated, in a folder of the test's own. */
function changedFileOf(paths: readonly string[]): string {
	const folder = temporaryFolder('dialecte-changed-')
	writeFiles({ root: folder, files: { changed: paths.map((path) => `${path}\0`).join('') } })
	return join(folder, 'changed')
}

/** A repository whose working tree changes `src/listed.ts` (clean) and `src/unlisted.ts` and `src/broken.ts` (broken), uncommitted. */
function changedRepository(): string {
	const root = createScratchRepository({ 'src/listed.ts': CLEAN_TEXT })
	writeFiles({
		root,
		files: {
			'src/listed.ts': `${CLEAN_TEXT}// edited\n`,
			'src/unlisted.ts': BROKEN_TEXT,
			'src/broken.ts': BROKEN_TEXT,
		},
	})
	return root
}

describe(
	'dialecte rules: the changed list of a scoped step',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('DIALECTE_GATE_CHANGED set → only the files it lists are checked; a file argument wins over it; unset → the files changed against HEAD and the new ones', () => {
			const root = changedRepository()
			const listed = { [CHANGED_VARIABLE]: changedFileOf(['src/listed.ts']) }
			const broken = { [CHANGED_VARIABLE]: changedFileOf(['src/broken.ts']) }

			expect({
				set: summaryOf(runRules({ cwd: root, argv: [], environment: listed }).output),
				argumentWins: summaryOf(
					runRules({ cwd: root, argv: ['src/listed.ts'], environment: broken }).output,
				),
				unset: summaryOf(runRules({ cwd: root, argv: [], environment: {} }).output),
			}).toEqual({
				set: 'rules: 1 file(s), 0 error(s), 0 warning(s)',
				argumentWins: 'rules: 1 file(s), 0 error(s), 0 warning(s)',
				unset: 'rules: 3 file(s), 2 error(s), 0 warning(s)',
			})
		})

		it('DIALECTE_GATE_CHANGED lists a broken file → its error line, exit 1, the other broken file left alone', () => {
			const root = changedRepository()
			const environment = {
				[CHANGED_VARIABLE]: changedFileOf(['src/listed.ts', 'src/broken.ts']),
			}

			const result = runRules({ cwd: root, argv: [], environment })

			expect(result.exitCode).toBe(1)
			expect(result.output.split('\n')).toEqual([
				'src/broken.ts:1:14  error  function-as-const  `read` is a function: declare it with `function read`',
				'rules: 2 file(s), 1 error(s), 0 warning(s)',
			])
		})

		it('DIALECTE_GATE_CHANGED lists a path with a newline and a non-ASCII path → each read by its exact name', () => {
			const root = createScratchRepository()
			writeFiles({
				root,
				files: { 'src/odd\nname.ts': BROKEN_TEXT, 'src/é.ts': CLEAN_TEXT },
			})
			const environment = {
				[CHANGED_VARIABLE]: changedFileOf(['src/odd\nname.ts', 'src/é.ts']),
			}

			const result = runRules({ cwd: root, argv: [], environment })

			expect(result.exitCode).toBe(1)
			expect(result.output.split('\n').at(-1)).toBe('rules: 2 file(s), 1 error(s), 0 warning(s)')
		})

		it('DIALECTE_GATE_CHANGED lists only files that are no text files → nothing to check, exit 0', () => {
			const root = changedRepository()
			const environment = { [CHANGED_VARIABLE]: changedFileOf(['logo.png']) }

			expect(runRules({ cwd: root, argv: [], environment })).toEqual({
				exitCode: 0,
				output: 'rules: no changed file to check',
			})
		})

		it('DIALECTE_GATE_CHANGED names an empty file → nothing to check, exit 0, the files changed against HEAD left alone', () => {
			const root = changedRepository()
			const environment = { [CHANGED_VARIABLE]: changedFileOf([]) }

			expect(runRules({ cwd: root, argv: [], environment })).toEqual({
				exitCode: 0,
				output: 'rules: no changed file to check',
			})
		})

		it('DIALECTE_GATE_CHANGED lists a deleted file (no longer on disk) → nothing to check there, no error, as the default leaves deleted files out', () => {
			const root = changedRepository()
			const environment = { [CHANGED_VARIABLE]: changedFileOf(['src/listed.ts', 'src/gone.ts']) }

			const result = runRules({ cwd: root, argv: [], environment })

			expect(result.exitCode).toBe(0)
			expect(result.output).not.toMatch(/gone\.ts/)
		})

		it('DIALECTE_GATE_CHANGED lists a file that exists and cannot be read → an error line naming it, exit 1', () => {
			const root = changedRepository()
			chmodSync(join(root, 'src/listed.ts'), 0o000)
			const environment = { [CHANGED_VARIABLE]: changedFileOf(['src/listed.ts']) }

			expect(outcomeOf({ cwd: root, argv: [], environment })).toMatchObject({
				threw: false,
				exitCode: 1,
				output: expect.stringMatching(/^src\/listed\.ts:\d+:\d+  error  \S+  /m),
			})
		})

		it('DIALECTE_GATE_CHANGED names a changed file that cannot be read → an error line, never a silent skip', () => {
			const missingList = join(temporaryFolder('dialecte-changed-'), 'absent')
			const root = changedRepository()
			const environment = { [CHANGED_VARIABLE]: missingList }

			expect(outcomeOf({ cwd: root, argv: [], environment })).toMatchObject({
				threw: false,
				exitCode: 1,
				output: expect.stringContaining(missingList),
			})
		})

		it('a file given that does not exist → an error line naming it, exit 1', () => {
			const root = createScratchRepository()

			expect(outcomeOf({ cwd: root, argv: ['src/gone.ts'], environment: {} })).toMatchObject({
				threw: false,
				exitCode: 1,
				output: expect.stringMatching(/^src\/gone\.ts:\d+:\d+  error  \S+  /m),
			})
		})

		it('a TypeScript file that does not parse → an error line naming it, exit 1', () => {
			const root = createScratchRepository()
			writeFiles({ root, files: { 'src/wrong.ts': UNPARSABLE_TEXT } })

			expect(outcomeOf({ cwd: root, argv: ['src/wrong.ts'], environment: {} })).toMatchObject({
				threw: false,
				exitCode: 1,
				output: expect.stringMatching(/^src\/wrong\.ts:\d+:\d+  error  \S+  /m),
			})
		})
	},
)
