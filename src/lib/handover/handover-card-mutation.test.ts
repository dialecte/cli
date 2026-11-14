/** The hand-over card's `mutation` gate line: from what the package still owes, never from a file. */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	MERGED_BRANCH,
	MUTATION_GATE_NAME,
	STATUS_TAIL,
} from '../../../test/mutation-hooks.constants.ts'
import {
	headOf,
	hooksRepository,
	mergeHandover,
	rehearsedMergeTree,
	reportRun,
	startRunning,
	writeHandover,
	writeGreenRecords,
} from '../../../test/mutation-hooks.ts'
import { survivorOf } from '../../../test/mutation-package.ts'
import { noRepositoryCli } from '../../../test/repository-cli-probe.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { renderSectionCard } from '../card/render-section-card.ts'
import { computeStateTree } from '../gate-records/state-hash.ts'
import { buildHandoverCard, handoverCardSections } from './handover-card.ts'

import { describe, expect, it } from 'vitest'

/** The card of a hand-over on `main` holding no lot, every gate recorded green on the tree as it is. */
function cardOf(params: { declared: boolean; gate?: boolean; lotFile?: string }) {
	const root = hooksRepository(params)
	writeGreenRecords(root)
	const folder = temporaryFolder('dialecte-card-folder-')
	if (params.gate)
		writeFileSync(join(folder, 'lot.json'), `${JSON.stringify({ mutation: 'gate' })}\n`)
	if (params.lotFile !== undefined) writeFileSync(join(folder, 'lot.json'), params.lotFile)
	return {
		root,
		folder,
		card: () =>
			buildHandoverCard({
				root,
				folder,
				branch: 'main',
				head: headOf(root),
				notes: undefined,
				lots: [],
				commits: [],
				probe: noRepositoryCli,
			}),
	}
}

function printed(card: ReturnType<ReturnType<typeof cardOf>['card']>): string {
	return renderSectionCard({ card: handoverCardSections(card), colour: false })
}

describe('the card’s mutation gate line', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a new survivor → BLOCKED, mutation among the failed gates, the ✗ line with its detail', () => {
		const { root, card } = cardOf({ declared: true })
		reportRun({ root, survivors: [survivorOf({ key: 'k1' })] })

		const built = card()

		expect(built.verdict).toBe('BLOCKED')
		expect(built.failedGates).toEqual([MUTATION_GATE_NAME])
		expect(built.gates.find((line) => line.name === MUTATION_GATE_NAME)).toMatchObject({
			status: 'failed',
			detail: `1 new survivor${STATUS_TAIL}`,
		})
		expect(printed(built)).toContain(`✗ mutation  1 new survivor${STATUS_TAIL}`)
	})

	it('a running run of the branch, a plain hand-over → READY, a ! line saying its survivors are not in yet', () => {
		const { root, card } = cardOf({ declared: true })
		const running = startRunning({ root })

		const built = card()
		const detail = `run ${running.runId} still running (pid ${process.pid}): its survivors are not in yet`

		expect(built.verdict).toBe('READY')
		expect(built.failedGates).toEqual([])
		expect(built.gates.find((line) => line.name === MUTATION_GATE_NAME)).toMatchObject({
			status: 'warning',
			detail,
		})
		expect(printed(built)).toContain(`! mutation  ${detail}`)
	})

	it('nothing pending → a ✓ line, after the gate steps and before the review line', () => {
		const { card } = cardOf({ declared: true })

		const built = card()

		expect(built.gates.map((line) => line.name)).toEqual([
			'check',
			'mutation',
			'review',
			'effort',
			'standard',
		])
		expect(built.gates.find((line) => line.name === MUTATION_GATE_NAME)).toMatchObject({
			status: 'passed',
			detail: 'nothing pending',
		})
		expect(printed(built)).toContain('✓ mutation  nothing pending')
	})

	it('a package without dialecte.mutation → no mutation line', () => {
		const { card } = cardOf({ declared: false })

		expect(card().gates.map((line) => line.name)).toEqual(['check', 'review', 'effort', 'standard'])
	})

	it('a gate lot.json in the folder and no run → BLOCKED, the ✗ line says to run dialecte mutants run on this tree first', () => {
		const { card } = cardOf({ declared: true, gate: true })

		const built = card()

		expect(built.verdict).toBe('BLOCKED')
		expect(built.failedGates).toEqual([MUTATION_GATE_NAME])
		expect(printed(built)).toContain(
			'✗ mutation  gate lot: run dialecte mutants run on this tree first',
		)
	})

	it('a gate lot.json and a reported run of the branch on the card’s tree → READY, ✓ nothing pending', () => {
		const { root, card } = cardOf({ declared: true, gate: true })
		reportRun({ root, survivors: [], tree: computeStateTree(root) })

		const built = card()

		expect(built.verdict).toBe('READY')
		expect(built.gates.find((line) => line.name === MUTATION_GATE_NAME)).toMatchObject({
			status: 'passed',
			detail: 'nothing pending',
		})
	})

	it('a merge lot whose branch has a running run → BLOCKED, the ✗ line says the merge waits for it', () => {
		const { root, lotsPath } = mergeHandover({})
		const running = startRunning({ root, branch: MERGED_BRANCH })

		const written = writeHandover(lotsPath)

		expect(written.output).toContain('BLOCKED')
		expect(written.output).toContain(
			`✗ mutation  run ${running.runId} still running (pid ${process.pid}): the merge waits for it`,
		)
	})

	it('a merge lot, a gate lot.json and a run of feat/x reported on the merge’s trial tree → the mutation line is ✓ nothing pending', async () => {
		const tree = await rehearsedMergeTree()
		const { root, lotsPath, out } = mergeHandover({ tree })
		writeFileSync(join(out, 'lot.json'), `${JSON.stringify({ mutation: 'gate' })}\n`)
		reportRun({ root, branch: MERGED_BRANCH, survivors: [], tree })

		expect(writeHandover(lotsPath).output).toContain('✓ mutation  nothing pending')
	})

	it('a merge lot, a gate lot.json and a run of feat/x reported on the worktree’s tree → the mutation line is ✗ run dialecte mutants run on this tree first', async () => {
		const tree = await rehearsedMergeTree()
		const { root, lotsPath, out } = mergeHandover({ tree })
		writeFileSync(join(out, 'lot.json'), `${JSON.stringify({ mutation: 'gate' })}\n`)
		reportRun({ root, branch: MERGED_BRANCH, survivors: [], tree: computeStateTree(root) })

		expect(writeHandover(lotsPath).output).toContain(
			'✗ mutation  gate lot: run dialecte mutants run on this tree first',
		)
	})

	it('a folder lot.json with an unknown mutation mode → BLOCKED, the ✗ mutation line carries the reason', () => {
		const { folder, card } = cardOf({
			declared: true,
			lotFile: `${JSON.stringify({ mutation: 'sometimes' })}\n`,
		})
		const reason = `${join(folder, 'lot.json')}: "mutation" must be one of off, changed, audit, gate, not "sometimes"`

		const built = card()

		expect(built.verdict).toBe('BLOCKED')
		expect(built.failedGates).toEqual([MUTATION_GATE_NAME])
		expect(built.gates.find((line) => line.name === MUTATION_GATE_NAME)).toMatchObject({
			status: 'failed',
			detail: reason,
		})
		expect(printed(built)).toContain(`✗ mutation  ${reason}`)
	})
})
