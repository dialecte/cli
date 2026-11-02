/** `dialecte handover run`: the `mutation` guard reads the store when it runs, never what the card said. */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	ACT_ON_EACH_LINE,
	MERGED_BRANCH,
	MUTATION_GATE_NAME,
	STATUS_TAIL,
} from '../../test/mutation-hooks.constants.ts'
import {
	finishRunning,
	guardLines,
	guardRow,
	headOf,
	hooksHandover,
	mergeHandover,
	rehearsedMergeTree,
	recordGreenGates,
	reportRun,
	runFolder,
	scheduleSurvivor,
	startRunning,
	startSleeper,
	stopSleeper,
	writeHandover,
} from '../../test/mutation-hooks.ts'
import { SCOPE_FILE } from '../../test/mutation-package.constants.ts'
import { survivorOf } from '../../test/mutation-package.ts'
import { git } from '../../test/scratch-repository.ts'
import { HANDOVER_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { computeStateTree } from '../lib/gate-records/state-hash.ts'

import { describe, expect, it, onTestFinished } from 'vitest'

const GUARD = MUTATION_GATE_NAME
const GATE_ALONE = 'gate lot: run dialecte mutants run on this tree first'
const GATE_PART = ` · ${GATE_ALONE}`
const NEW_SURVIVOR_ROW = guardRow({
	mark: '✗',
	name: GUARD,
	detail: `1 new survivor${STATUS_TAIL}`,
})
const NEW_SURVIVOR_LINE = `    ${SCOPE_FILE}:2 ConditionalExpression: x === 1 -> true (lot main)`

describe('handover run: the mutation guard', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('a new survivor → refused at the mutation guard with its lines, exit 1, nothing committed', async () => {
		const { root, lotsPath, out } = hooksHandover({ declared: true })
		expect(writeHandover(lotsPath).exitCode).toBe(0)
		reportRun({ root, survivors: [survivorOf({ key: 'k1' })] })
		const before = headOf(root)

		const ran = await runFolder({ out })

		expect(ran.exitCode).toBe(1)
		expect(guardLines({ lines: ran.lines, name: GUARD })).toEqual([
			NEW_SURVIVOR_ROW,
			NEW_SURVIVOR_LINE,
			`    ${ACT_ON_EACH_LINE}`,
		])
		expect(headOf(root)).toBe(before)
	})

	it('a run of the branch still running → the guard passes with the running detail, both lots committed', async () => {
		const { root, lotsPath, out } = hooksHandover({ declared: true })
		expect(writeHandover(lotsPath).exitCode).toBe(0)
		const before = headOf(root)
		const running = startRunning({ root })

		const ran = await runFolder({ out })

		expect(guardLines({ lines: ran.lines, name: GUARD })).toEqual([
			guardRow({
				mark: '✓',
				name: GUARD,
				detail: `run ${running.runId} still running (pid ${process.pid}): its survivors are not in yet`,
			}),
		])
		expect(ran.exitCode).toBe(0)
		expect(git({ root, args: ['rev-list', '--count', `${before}..HEAD`] }).trim()).toBe('2')
	})

	it('nothing pending → ✓ mutation nothing pending, both lots committed', async () => {
		const { root, lotsPath, out } = hooksHandover({ declared: true })
		expect(writeHandover(lotsPath).exitCode).toBe(0)
		const before = headOf(root)

		const ran = await runFolder({ out })

		expect(guardLines({ lines: ran.lines, name: GUARD })).toEqual([
			guardRow({ mark: '✓', name: GUARD, detail: 'nothing pending' }),
		])
		expect(ran.exitCode).toBe(0)
		expect(git({ root, args: ['rev-list', '--count', `${before}..HEAD`] }).trim()).toBe('2')
	})

	it('a package without dialecte.mutation → ✓ mutation no mutation scope declared', async () => {
		const { lotsPath, out } = hooksHandover({ declared: false })
		expect(writeHandover(lotsPath).exitCode).toBe(0)

		const ran = await runFolder({ out })

		expect(guardLines({ lines: ran.lines, name: GUARD })).toEqual([
			guardRow({ mark: '✓', name: GUARD, detail: 'no mutation scope declared' }),
		])
		expect(ran.exitCode).toBe(0)
	})

	it('the mutation guard is the last of the list, after references', async () => {
		const { lotsPath, out } = hooksHandover({ declared: true })
		expect(writeHandover(lotsPath).exitCode).toBe(0)

		const ran = await runFolder({ out })

		const guardNames = ran.lines
			.filter((line) => /^[✓✗] \S+ /.test(line))
			.map((line) => line.split(' ')[1])
			.filter((name) => ['references', GUARD].includes(name))
		expect(guardNames).toEqual(['references', GUARD])
	})
})

describe(
	'handover run: a run finishing between the card and the run',
	{ timeout: HANDOVER_CASE_TIMEOUT },
	() => {
		it('the card written while a run is running (READY, a warning), the run then reports a survivor → refused at the guard, nothing committed', async () => {
			const { root, lotsPath, out } = hooksHandover({ declared: true })
			await recordGreenGates(root)
			const running = startRunning({ root })
			const card = writeHandover(lotsPath)
			expect(card.output).toContain('READY')
			expect(card.output).toContain(
				`! mutation  run ${running.runId} still running (pid ${process.pid}): its survivors are not in yet`,
			)
			finishRunning({ root, run: running, survivors: [survivorOf({ key: 'k1' })] })
			const before = headOf(root)

			const ran = await runFolder({ out })

			expect(ran.exitCode).toBe(1)
			expect(guardLines({ lines: ran.lines, name: GUARD })).toEqual([
				NEW_SURVIVOR_ROW,
				NEW_SURVIVOR_LINE,
				`    ${ACT_ON_EACH_LINE}`,
			])
			expect(headOf(root)).toBe(before)
		})

		it('the card BLOCKED on a new survivor, the survivor then scheduled → the run passes the guard', async () => {
			const { root, lotsPath, out } = hooksHandover({ declared: true })
			await recordGreenGates(root)
			reportRun({ root, survivors: [survivorOf({ key: 'k1' })] })
			const card = writeHandover(lotsPath)
			expect(card.output).toContain('BLOCKED')
			expect(card.output).toContain(`✗ mutation  1 new survivor${STATUS_TAIL}`)
			scheduleSurvivor({ root, key: 'k1' })

			const ran = await runFolder({ out })

			expect(guardLines({ lines: ran.lines, name: GUARD })).toEqual([
				guardRow({ mark: '✓', name: GUARD, detail: 'nothing pending' }),
			])
			expect(ran.exitCode).toBe(0)
		})

		it('a run running at card time whose owner is gone when the guard runs → refused: it died before reporting', async () => {
			const { root, lotsPath, out } = hooksHandover({ declared: true })
			await recordGreenGates(root)
			const owner = startSleeper()
			onTestFinished(function stopOwner() {
				owner.kill()
			})
			const running = startRunning({ root, pid: owner.pid })
			expect(writeHandover(lotsPath).output).toContain('READY')
			await stopSleeper(owner)
			const before = headOf(root)

			const ran = await runFolder({ out })

			expect(ran.exitCode).toBe(1)
			expect(guardLines({ lines: ran.lines, name: GUARD })).toEqual([
				guardRow({ mark: '✗', name: GUARD, detail: `1 died run${STATUS_TAIL}` }),
				`    run ${running.runId} died before reporting: rerun or dialecte mutants abandon ${running.runId}`,
				`    ${ACT_ON_EACH_LINE}`,
			])
			expect(headOf(root)).toBe(before)
		})
	},
)

describe('handover run: what the guard reads', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('the hand-over folder holds lot.json {"mutation":"gate"} and a run of the branch is running → refused: a gate lot waits for it', async () => {
		const { root, lotsPath, out } = hooksHandover({ declared: true })
		expect(writeHandover(lotsPath).exitCode).toBe(0)
		writeFileSync(join(out, 'lot.json'), `${JSON.stringify({ mutation: 'gate' })}\n`)
		const running = startRunning({ root })
		const before = headOf(root)

		const ran = await runFolder({ out })

		expect(ran.exitCode).toBe(1)
		expect(guardLines({ lines: ran.lines, name: GUARD })).toEqual([
			guardRow({
				mark: '✗',
				name: GUARD,
				detail: `run ${running.runId} still running (pid ${process.pid}): a gate lot waits for it${GATE_PART}`,
			}),
		])
		expect(headOf(root)).toBe(before)
	})

	it('the hand-over folder holds lot.json {"mutation":"gate"} and no run → refused: run dialecte mutants run on this tree first', async () => {
		const { root, lotsPath, out } = hooksHandover({ declared: true })
		expect(writeHandover(lotsPath).exitCode).toBe(0)
		writeFileSync(join(out, 'lot.json'), `${JSON.stringify({ mutation: 'gate' })}\n`)
		const before = headOf(root)

		const ran = await runFolder({ out })

		expect(ran.exitCode).toBe(1)
		expect(guardLines({ lines: ran.lines, name: GUARD })).toEqual([
			guardRow({ mark: '✗', name: GUARD, detail: GATE_ALONE }),
		])
		expect(headOf(root)).toBe(before)
	})

	it('a gate lot and a run of the branch reported on the tree the hand-over commits → ✓ nothing pending, the lots committed', async () => {
		const { root, lotsPath, out } = hooksHandover({ declared: true })
		expect(writeHandover(lotsPath).exitCode).toBe(0)
		writeFileSync(join(out, 'lot.json'), `${JSON.stringify({ mutation: 'gate' })}\n`)
		reportRun({ root, survivors: [], tree: computeStateTree(root) })
		const before = headOf(root)

		const ran = await runFolder({ out })

		expect(guardLines({ lines: ran.lines, name: GUARD })).toEqual([
			guardRow({ mark: '✓', name: GUARD, detail: 'nothing pending' }),
		])
		expect(ran.exitCode).toBe(0)
		expect(git({ root, args: ['rev-list', '--count', `${before}..HEAD`] }).trim()).toBe('2')
	})

	it('a gate lot and a run of the branch reported on HEAD’s tree, not the changed one → refused: run dialecte mutants run on this tree first', async () => {
		const { root, lotsPath, out } = hooksHandover({ declared: true })
		expect(writeHandover(lotsPath).exitCode).toBe(0)
		writeFileSync(join(out, 'lot.json'), `${JSON.stringify({ mutation: 'gate' })}\n`)
		const headTree = git({ root, args: ['rev-parse', 'HEAD^{tree}'] }).trim()
		expect(headTree).not.toBe(computeStateTree(root))
		reportRun({ root, survivors: [], tree: headTree })
		const before = headOf(root)

		const ran = await runFolder({ out })

		expect(ran.exitCode).toBe(1)
		expect(guardLines({ lines: ran.lines, name: GUARD })).toEqual([
			guardRow({ mark: '✗', name: GUARD, detail: GATE_ALONE }),
		])
		expect(headOf(root)).toBe(before)
	})

	it('a merge lot and a gate lot.json, a run of feat/x reported on the merge’s trial tree → ✓ nothing pending, the merge committed', async () => {
		const tree = await rehearsedMergeTree()
		const { root, lotsPath, out } = mergeHandover({ tree })
		expect(writeHandover(lotsPath).exitCode).toBe(0)
		writeFileSync(join(out, 'lot.json'), `${JSON.stringify({ mutation: 'gate' })}\n`)
		reportRun({ root, branch: MERGED_BRANCH, survivors: [], tree })
		const before = headOf(root)

		const ran = await runFolder({ out })

		expect(guardLines({ lines: ran.lines, name: GUARD })).toEqual([
			guardRow({ mark: '✓', name: GUARD, detail: 'nothing pending' }),
		])
		expect(ran.exitCode).toBe(0)
		expect(git({ root, args: ['rev-list', '--count', `${before}..HEAD`] }).trim()).not.toBe('0')
	})

	it('a merge lot and a gate lot.json, a run of feat/x reported on the worktree’s tree, not the merge’s → refused: run dialecte mutants run on this tree first', async () => {
		const tree = await rehearsedMergeTree()
		const { root, lotsPath, out } = mergeHandover({ tree })
		expect(writeHandover(lotsPath).exitCode).toBe(0)
		writeFileSync(join(out, 'lot.json'), `${JSON.stringify({ mutation: 'gate' })}\n`)
		expect(computeStateTree(root)).not.toBe(tree)
		reportRun({ root, branch: MERGED_BRANCH, survivors: [], tree: computeStateTree(root) })
		const before = headOf(root)

		const ran = await runFolder({ out })

		expect(ran.exitCode).toBe(1)
		expect(guardLines({ lines: ran.lines, name: GUARD })).toEqual([
			guardRow({ mark: '✗', name: GUARD, detail: GATE_ALONE }),
		])
		expect(headOf(root)).toBe(before)
	})

	it('a new survivor and the run under --rehearse → the same guard refuses: exit 1, the ✗ mutation row and its item lines', async () => {
		const { root, lotsPath, out } = hooksHandover({ declared: true })
		expect(writeHandover(lotsPath).exitCode).toBe(0)
		reportRun({ root, survivors: [survivorOf({ key: 'k1' })] })

		const ran = await runFolder({ out, argv: ['--rehearse'] })

		expect(ran.exitCode).toBe(1)
		expect(guardLines({ lines: ran.lines, name: GUARD })).toEqual([
			NEW_SURVIVOR_ROW,
			NEW_SURVIVOR_LINE,
			`    ${ACT_ON_EACH_LINE}`,
		])
	})

	it('a merge lot whose branch has a running run → refused: the merge waits for it', async () => {
		const tree = await rehearsedMergeTree()
		const { root, lotsPath, out } = mergeHandover({ tree })
		expect(writeHandover(lotsPath).exitCode).toBe(0)
		const running = startRunning({ root, branch: MERGED_BRANCH })
		const before = headOf(root)

		const ran = await runFolder({ out })

		expect(ran.exitCode).toBe(1)
		expect(guardLines({ lines: ran.lines, name: GUARD })).toEqual([
			guardRow({
				mark: '✗',
				name: GUARD,
				detail: `run ${running.runId} still running (pid ${process.pid}): the merge waits for it`,
			}),
		])
		expect(headOf(root)).toBe(before)
	})
})
