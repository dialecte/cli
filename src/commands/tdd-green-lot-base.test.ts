/**
 * tdd's single base (FIX-ci-loop design, section 4, item 6): `tdd red`, `green`, `status` and the hook measure from the
 * lot base, the merge-base of HEAD with the base branch as the newest of its local and origin's tips, never HEAD; a
 * green taken before a rebase still counts after it, and a plain `tdd green` proves the lot's committed cases again.
 * `--base <ref>` stays the explicit override, which the command map declares.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { runHookIn } from '../../test/gate-hook.ts'
import { countingStep, createCounter } from '../../test/scratch-checks.ts'
import { git, writeFiles } from '../../test/scratch-repository.ts'
import { createVitestPackage } from '../../test/scratch-vitest-package.ts'
import { HELPER_SCENARIO_TIMEOUT } from '../../test/test-timing.constants.ts'
import { commandSurfaceOf } from '../lib/command-map/command-surface.ts'
import { allRenamedWords } from '../lib/command-map/renamed-answer.ts'
import { listedCommands } from '../lib/command-map/render-help.ts'
import { checkCliInvocations } from '../lib/skills/cli-invocations.ts'
import { writeHygieneBaseline } from '../lib/worktree/hygiene.ts'
import { runTdd } from './tdd.ts'

import { describe, expect, it } from 'vitest'

const NOW = new Date('2026-11-17T12:00:00.000Z')
const STUB =
	"export function add(left: number, right: number): number {\n\tthrow new Error('not implemented: add')\n}\n"
const IMPLEMENTED =
	'export function add(left: number, right: number): number {\n\treturn left + right\n}\n'
const REFACTORED =
	'export function add(left: number, right: number): number {\n\treturn right + left\n}\n'
const ADD_TEST = [
	"import { add } from './add.ts'",
	"import { expect, it } from 'vitest'",
	"it('one plus two → three', () => { expect(add(1, 2)).toBe(3) })",
	'',
].join('\n')
/** A test file main gains while the lot works: a case of main's, not of the lot. */
const MAIN_TEST = [
	"import { expect, it } from 'vitest'",
	"it('main keeps working', () => { expect(1).toBe(1) })",
	'',
].join('\n')
const OK_LINE = 'ok    tdd  1 case(s) of the change: 1 red then green'

function tdd(params: { root: string; argv: string[] }) {
	return runTdd({ cwd: params.root, argv: params.argv, now: () => NOW })
}

/**
 * A vitest package whose hook runs one counting step, its lot branch `lot` cut from main as `worktree add` makes it
 * (the hygiene baseline recording main).
 */
function lotPackage(): string {
	const root = createVitestPackage({
		dialecte: {
			gate: {
				hook: [countingStep({ counter: createCounter(), name: 'check' })],
			},
		},
	})
	git({ root, args: ['switch', '-q', '-c', 'lot'] })
	writeHygieneBaseline({ root, now: NOW, from: 'main' })
	return root
}

/** The lot's test and production committed after its red then green. */
async function commitProvenLot(root: string): Promise<void> {
	writeFiles({
		root,
		files: { 'src/add.ts': STUB, 'src/add.test.ts': ADD_TEST },
	})
	await tdd({ root, argv: ['red'] })
	writeFileSync(join(root, 'src/add.ts'), IMPLEMENTED)
	await tdd({ root, argv: ['green'] })
	git({ root, args: ['add', '-A'] })
	git({ root, args: ['commit', '-q', '-m', 'feat: add'] })
}

/** Origin's main gains a commit holding a test file of its own; the local main stays behind, the lot rebased onto origin's. */
function moveOriginMainAndRebase(root: string): void {
	git({ root, args: ['switch', '-q', '-c', 'upstream', 'main'] })
	writeFiles({ root, files: { 'src/main.test.ts': MAIN_TEST } })
	git({ root, args: ['add', '-A'] })
	git({ root, args: ['commit', '-q', '-m', 'test: main keeps working'] })
	git({ root, args: ['update-ref', 'refs/remotes/origin/main', 'upstream'] })
	git({ root, args: ['switch', '-q', 'lot'] })
	git({ root, args: ['branch', '-q', '-D', 'upstream'] })
	git({ root, args: ['rebase', '-q', 'refs/remotes/origin/main'] })
}

describe('tdd measures from the lot base', { timeout: HELPER_SCENARIO_TIMEOUT }, () => {
	it('tdd green taken, origin’s main moves, the lot rebased onto it → the hook passes with no new green', async () => {
		const root = lotPackage()
		await commitProvenLot(root)
		moveOriginMainAndRebase(root)

		await expect(runHookIn({ cwd: root })).resolves.toMatchObject({
			exitCode: 0,
			output: expect.stringContaining(OK_LINE),
		})
	})

	it('the lot’s cases committed, production changed after their green → a plain tdd green proves them again and the hook passes', async () => {
		const root = lotPackage()
		await commitProvenLot(root)
		writeFileSync(join(root, 'src/add.ts'), REFACTORED)

		await expect(tdd({ root, argv: ['green'] })).resolves.toMatchObject({
			exitCode: 0,
		})
		git({ root, args: ['add', '-A'] })
		await expect(runHookIn({ cwd: root })).resolves.toMatchObject({
			exitCode: 0,
		})
	})

	it('the lot’s test and stub committed, no --base → tdd red runs the committed test file red', async () => {
		const root = lotPackage()
		writeFiles({
			root,
			files: { 'src/add.ts': STUB, 'src/add.test.ts': ADD_TEST },
		})
		git({ root, args: ['add', '-A'] })
		git({ root, args: ['commit', '-q', '-m', 'test: add'] })

		await expect(tdd({ root, argv: ['red'] })).resolves.toMatchObject({
			exitCode: 0,
			output: expect.stringMatching(/^tdd red: 1 red/m),
		})
	})

	it('the lot’s test committed, no --base → tdd status lists its case', async () => {
		const root = lotPackage()
		writeFiles({
			root,
			files: { 'src/add.ts': STUB, 'src/add.test.ts': ADD_TEST },
		})
		git({ root, args: ['add', '-A'] })
		git({ root, args: ['commit', '-q', '-m', 'test: add'] })

		await expect(tdd({ root, argv: ['status'] })).resolves.toMatchObject({
			output: expect.stringContaining('src/add.test.ts::one plus two → three'),
		})
	})
})

describe('tdd green --base in a skill', () => {
	it('a page citing dialecte tdd green --base <lot base> → skills check finds nothing', () => {
		expect(
			checkCliInvocations({
				file: 'skills/demo/SKILL.md',
				markdown: 'Run `dialecte tdd green --base 4380668e` again.\n',
				surface: {
					commands: listedCommands().map(commandSurfaceOf),
					renamed: allRenamedWords(),
				},
				ignored: new Set(),
			}),
		).toEqual([])
	})
})
