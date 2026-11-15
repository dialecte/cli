/**
 * `contrib`'s rules row against the base it is given: a line the base already holds is a warning, only a line the
 * change adds can fail the row; without a base the row keeps every error.
 */
import { join } from 'node:path'

import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { createContribPackage } from '../../test/scratch-contrib.ts'
import { git, temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { GATE_SCOPE_VARIABLES } from '../lib/gate/selection.constants.ts'
import { runContrib } from './contrib.ts'
import { runRules } from './rules.ts'

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

/** A package whose `base` commit holds a clean `a.ts`, checked out detached with the tree of `mainTip` on top; `withoutBaseBranch` renames `main` so no base branch exists. */
function rehearsalClone(params: { workingText: string; withoutBaseBranch?: boolean }): {
	root: string
	mainTip: string
} {
	const root = createContribPackage({
		steps: [{ name: 'docs', run: 'true' }],
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
	if (params.withoutBaseBranch) git({ root, args: ['branch', '-m', 'main', 'trunk'] })
	return { root, mainTip }
}

/** A package declaring its own gate lists (one plain step, none scoped), `main` holding the mutation line, HEAD on a branch from it with `workingText` on disk. */
function branchWithMutationLine(params: { workingText: string }): string {
	const root = createContribPackage({
		steps: [{ name: 'docs', run: 'true' }],
		gateFast: [{ name: 'plain', run: 'true' }],
		gateFull: [{ name: 'plain', run: 'true' }],
		files: { [FILE]: MAIN_TEXT },
	})
	git({ root, args: ['checkout', '-q', '-b', 'feat/work'] })
	writeFiles({ root, files: { [FILE]: params.workingText } })
	return root
}

/** The scoped rules step as the gate runs it on `root` with `base` (the empty tree when left out): its exit code and printed findings. */
function gateRulesStep(params: { root: string; base?: string }): {
	exitCode: number
	output: string
} {
	const { root } = params
	const changedFolder = temporaryFolder('dialecte-changed-')
	writeFiles({ root: changedFolder, files: { changed: `${FILE}\0` } })
	const result = runRules({
		cwd: root,
		argv: [],
		environment: {
			XDG_CONFIG_HOME: temporaryFolder('dialecte-config-'),
			[GATE_SCOPE_VARIABLES.changed]: join(changedFolder, 'changed'),
			[GATE_SCOPE_VARIABLES.tree]: 'b'.repeat(40),
			[GATE_SCOPE_VARIABLES.selection]: join(
				temporaryFolder('dialecte-selection-'),
				'selection.json',
			),
			[GATE_SCOPE_VARIABLES.base]:
				params.base ?? git({ root, args: ['hash-object', '-t', 'tree', '/dev/null'] }).trim(),
		},
	})
	return { exitCode: result.exitCode, output: result.output }
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

	it('no base given, no base branch anywhere and no store lot → no base, the base line stays an error, exit 1', async () => {
		const { root } = rehearsalClone({ workingText: MAIN_TEXT, withoutBaseBranch: true })

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

	it('a custom gate list with no scoped step, no base given, HEAD on a branch from main whose commit holds a mutation line, the change edits another line → exit 0, the line a warning (not added by this change)', async () => {
		const root = branchWithMutationLine({
			workingText: MAIN_TEXT.replace('items.length', 'items.length + 0'),
		})

		const result = await runContrib({ cwd: root, argv: ['--no-reuse'] })

		expect(result.exitCode).toBe(0)
		expect(result.output).toMatch(
			new RegExp(`${FILE}:${MAIN_BROUGHT_LINE}:\\d+.*\\(not added by this change\\)`),
		)
	})

	it('a custom gate list with no scoped step, no base given, HEAD on a branch from main, the change adds a mutation line → exit 1, the row failed, its first error the added line', async () => {
		const root = branchWithMutationLine({ workingText: ADDED_TEXT })

		const result = await runContrib({ cwd: root, argv: ['--no-reuse'] })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain(`first: ${FILE}:${ADDED_LINE}:`)
	})

	it('the default scoped rules step, no base branch, a release tag after the held mutation line, another line edited → contrib exits 0 with the held line a warning, and the gate scoped rules step on the same package agrees', async () => {
		const root = createContribPackage({
			steps: [{ name: 'docs', run: 'true' }],
			files: { [FILE]: MAIN_TEXT },
		})
		git({ root, args: ['branch', '-m', 'main', 'trunk'] })
		git({ root, args: ['tag', 'demo@v0.1.0'] })
		writeFiles({ root, files: { [FILE]: MAIN_TEXT.replace('items.length', 'items.length + 0') } })

		const contrib = await runContrib({ cwd: root, argv: ['--no-reuse'] })
		const gate = gateRulesStep({ root })

		const heldWarning = new RegExp(
			`${FILE}:${MAIN_BROUGHT_LINE}:\\d+.*\\(not added by this change\\)`,
		)
		expect({
			contribExit: contrib.exitCode,
			contribHeld: heldWarning.test(contrib.output),
			gateExit: gate.exitCode,
			gateHeld: heldWarning.test(gate.output),
		}).toEqual({ contribExit: 0, contribHeld: true, gateExit: 0, gateHeld: true })
	})

	it('HEAD on main itself, a release tag after the held mutation line, another line edited uncommitted → contrib counts the held line against HEAD (a warning, exit 0), and the gate scoped rules step agrees', async () => {
		const root = createContribPackage({
			steps: [{ name: 'docs', run: 'true' }],
			files: { [FILE]: MAIN_TEXT },
		})
		git({ root, args: ['tag', 'demo@v0.1.0'] })
		writeFiles({ root, files: { [FILE]: MAIN_TEXT.replace('items.length', 'items.length + 0') } })
		const head = git({ root, args: ['rev-parse', 'HEAD'] }).trim()

		const contrib = await runContrib({ cwd: root, argv: ['--no-reuse'] })
		const gate = gateRulesStep({ root, base: head })

		const heldWarning = new RegExp(
			`${FILE}:${MAIN_BROUGHT_LINE}:\\d+.*\\(not added by this change\\)`,
		)
		expect({
			contribExit: contrib.exitCode,
			contribHeld: heldWarning.test(contrib.output),
			gateExit: gate.exitCode,
			gateHeld: heldWarning.test(gate.output),
		}).toEqual({ contribExit: 0, contribHeld: true, gateExit: 0, gateHeld: true })
	})
})
