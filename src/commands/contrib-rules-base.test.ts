/**
 * `contrib`'s rules row against the base it is given: a line the base already holds is a warning, only a line the
 * change adds can fail the row; without a base the row keeps every error.
 */
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { createContribPackage } from '../../test/scratch-contrib.ts'
import { git, writeFiles } from '../../test/scratch-repository.ts'
import { runContrib } from './contrib.ts'

import { describe, expect, it } from 'vitest'

const FILE = 'src/lib/a.ts'
const CLEAN_TEXT = [
	'export function size(items: string[]): number {',
	'\treturn items.length',
	'}',
	'',
].join('\n')
const MAIN_TEXT = [
	CLEAN_TEXT,
	'export function fill(target: string[]) {',
	"\ttarget.push('a')",
	'}',
	'',
].join('\n')
const MAIN_BROUGHT_LINE = 6
const ADDED_TEXT = [
	MAIN_TEXT,
	'export function drain(other: string[]) {',
	'\tother.length = 0',
	'}',
	'',
].join('\n')
const ADDED_LINE = 10

/** A package whose `base` commit holds a clean `a.ts`, checked out detached with the tree of `mainTip` on top. */
function rehearsalClone(params: { workingText: string; withoutScopedStep?: boolean }): {
	root: string
	mainTip: string
} {
	const root = createContribPackage({
		steps: [{ name: 'docs', run: 'true' }],
		...(params.withoutScopedStep && {
			gateFast: [{ name: 'plain', run: 'true' }],
			gateFull: [{ name: 'plain', run: 'true' }],
		}),
		files: { [FILE]: CLEAN_TEXT },
	})
	const base = git({ root, args: ['rev-parse', 'HEAD'] }).trim()
	writeFiles({ root, files: { [FILE]: MAIN_TEXT } })
	git({ root, args: ['add', '-A'] })
	git({ root, args: ['commit', '-q', '-m', 'feat: main brings a line'] })
	const mainTip = git({ root, args: ['rev-parse', 'HEAD'] }).trim()
	git({ root, args: ['checkout', '-q', '--detach', base] })
	git({ root, args: ['read-tree', '-u', '--reset', mainTip] })
	writeFiles({ root, files: { [FILE]: params.workingText } })
	return { root, mainTip }
}

describe('contrib: the rules row against a base', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a rule error on a line the base holds, no line added → the row passes, the line a warning (not added by this change)', async () => {
		const { root, mainTip } = rehearsalClone({ workingText: MAIN_TEXT })

		const result = await runContrib({ cwd: root, argv: ['--no-reuse'], rulesBase: mainTip })

		expect(result.exitCode).toBe(0)
		expect(result.output).toMatch(
			new RegExp(`${FILE}:${MAIN_BROUGHT_LINE}:\\d+.*\\(not added by this change\\)`),
		)
	})

	it('a rule error on a line the change adds, on top of a base line → exit 1, the row failed, its first error the added line', async () => {
		const { root, mainTip } = rehearsalClone({ workingText: ADDED_TEXT })

		const result = await runContrib({ cwd: root, argv: ['--no-reuse'], rulesBase: mainTip })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain(`first: ${FILE}:${ADDED_LINE}:`)
	})

	it('no base given and no scoped gate step → the base line stays an error, exit 1', async () => {
		const { root } = rehearsalClone({ workingText: MAIN_TEXT, withoutScopedStep: true })

		const result = await runContrib({ cwd: root, argv: ['--no-reuse'] })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain(`first: ${FILE}:${MAIN_BROUGHT_LINE}:`)
	})

	it('no base given, the default scoped rules step, HEAD on a branch from main → the line main holds is a warning (not added by this change), exit 0', async () => {
		const root = createContribPackage({
			steps: [{ name: 'docs', run: 'true' }],
			files: { [FILE]: MAIN_TEXT },
		})
		git({ root, args: ['checkout', '-q', '-b', 'feat/work'] })
		writeFiles({ root, files: { [FILE]: MAIN_TEXT.replace('items.length', 'items.length + 0') } })

		const result = await runContrib({ cwd: root, argv: ['--no-reuse'] })

		expect(result.exitCode).toBe(0)
		expect(result.output).toMatch(
			new RegExp(`${FILE}:${MAIN_BROUGHT_LINE}:\\d+.*\\(not added by this change\\)`),
		)
	})
})
