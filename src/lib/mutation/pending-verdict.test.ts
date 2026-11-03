import { join } from 'node:path'

/** What a package still owes a hand-over: the verdict of the card's and the guard's `mutation` line, from the store. */
import {
	ACT_ON_EACH_LINE,
	HOOKS_TREE,
	OTHER_SCOPE_FILE,
	RECORDED_REASON,
	SECOND_SURVIVOR_LINE,
	SECOND_SURVIVOR_MUTATION,
	STATUS_TAIL,
} from '../../../test/mutation-hooks.constants.ts'
import {
	abandonDied,
	declaredRepositoryWithOtherPackage,
	reportRun,
	scheduleSurvivor,
	startDied,
	startRunning,
	startedAt,
} from '../../../test/mutation-hooks.ts'
import { PACKAGE_NAME, SCOPE_FILE } from '../../../test/mutation-package.constants.ts'
import { mutationPackage, survivorOf } from '../../../test/mutation-package.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import {
	createScratchRepository,
	temporaryFolder,
	writeFiles,
} from '../../../test/scratch-repository.ts'
import { lotModeOf, pendingVerdict } from './pending-verdict.ts'

import { describe, expect, it } from 'vitest'

import type { MutationModeSetting, MutationRecords } from './mutation.types.ts'
import type { PendingVerdictParams } from './pending-verdict.types.ts'

/** The part a gate lot without a reported run of its branch on the tree adds, after the other failed parts. */
const GATE_PART = ' · gate lot: run dialecte mutants run on this tree first'
const GATE_ALONE = 'gate lot: run dialecte mutants run on this tree first'
const DEFAULT_MODE: MutationModeSetting = { kind: 'default' }
const FIRST_LINE = `${SCOPE_FILE}:2 ConditionalExpression: x === 1 -> true`
const SECOND_LINE = `${SCOPE_FILE}:${SECOND_SURVIVOR_LINE} ${SECOND_SURVIVOR_MUTATION}`

/** The arguments of a plain hand-over on `main`, unless said otherwise. */
function paramsOf(params: {
	root: string
	branch?: string
	mergedBranches?: string[]
	lotMode?: MutationModeSetting
	tree?: string
}): PendingVerdictParams {
	return {
		root: params.root,
		branch: params.branch ?? 'main',
		mergedBranches: params.mergedBranches ?? [],
		lotMode: params.lotMode ?? DEFAULT_MODE,
		tree: params.tree ?? HOOKS_TREE,
	}
}

function recordsListing(key: string): MutationRecords {
	return {
		[SCOPE_FILE]: {
			[key]: {
				line: 2,
				mutation: 'ConditionalExpression: x === 1 -> true',
				family: 'wording',
				reason: RECORDED_REASON,
				lineHash: 'h',
			},
		},
	}
}

describe('pendingVerdict', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('no dialecte.mutation declaration → undefined', () => {
		const root = createScratchRepository({
			'package.json': `${JSON.stringify({ name: PACKAGE_NAME })}\n`,
		})

		expect(pendingVerdict(paramsOf({ root }))).toBeUndefined()
	})

	it('an invalid declaration → failed, the declaration’s reason', () => {
		const root = createScratchRepository({
			'package.json': `${JSON.stringify({ name: PACKAGE_NAME, dialecte: { mutation: { scope: [] } } })}\n`,
		})

		expect(pendingVerdict(paramsOf({ root }))).toMatchObject({
			status: 'failed',
			detail: 'dialecte.mutation.scope must be a non-empty array of strings',
		})
	})

	it('an invalid lot mode → failed, the mode’s reason', () => {
		const root = mutationPackage()
		const reason =
			'.dialecte/lot.json: "mutation" must be one of off, changed, audit, gate, not "sometimes"'

		expect(pendingVerdict(paramsOf({ root, lotMode: { kind: 'invalid', reason } }))).toMatchObject({
			status: 'failed',
			detail: reason,
		})
	})

	it('new survivors of two lots → failed, the counts and one line per survivor, then the closing line', () => {
		const root = mutationPackage()
		reportRun({ root, branch: 'feat/a', survivors: [survivorOf({ key: 'k1' })], now: startedAt(1) })
		reportRun({
			root,
			branch: 'feat/b',
			survivors: [
				survivorOf({ key: 'k2', line: SECOND_SURVIVOR_LINE, mutation: SECOND_SURVIVOR_MUTATION }),
			],
			now: startedAt(2),
		})

		expect(pendingVerdict(paramsOf({ root }))).toMatchObject({
			status: 'failed',
			detail: `2 new survivors${STATUS_TAIL}`,
		})
		expect(pendingVerdict(paramsOf({ root }))?.lines.at(-1)).toBe(ACT_ON_EACH_LINE)
		expect(pendingVerdict(paramsOf({ root }))?.lines.slice(0, -1).sort()).toEqual([
			`${FIRST_LINE} (lot feat/a)`,
			`${SECOND_LINE} (lot feat/b)`,
		])
	})

	it('one new survivor → the count is singular', () => {
		const root = mutationPackage()
		reportRun({ root, survivors: [survivorOf({ key: 'k1' })] })

		expect(pendingVerdict(paramsOf({ root }))).toEqual({
			status: 'failed',
			detail: `1 new survivor${STATUS_TAIL}`,
			lines: [`${FIRST_LINE} (lot main)`, ACT_ON_EACH_LINE],
		})
	})

	it('a died run of another branch → failed, one line naming the run, then the closing line', () => {
		const root = mutationPackage()
		const died = startDied({ root, branch: 'feat/other' })

		expect(pendingVerdict(paramsOf({ root }))).toEqual({
			status: 'failed',
			detail: `1 died run${STATUS_TAIL}`,
			lines: [
				`run ${died.runId} died before reporting: rerun or dialecte mutants abandon ${died.runId}`,
				ACT_ON_EACH_LINE,
			],
		})
	})

	it('a new survivor and a died run → one detail, both parts joined by " · ", the survivors first', () => {
		const root = mutationPackage()
		reportRun({ root, survivors: [survivorOf({ key: 'k1' })], now: startedAt(1) })
		const died = startDied({ root, now: startedAt(2) })

		expect(pendingVerdict(paramsOf({ root }))).toEqual({
			status: 'failed',
			detail: `1 new survivor · 1 died run${STATUS_TAIL}`,
			lines: [
				`${FIRST_LINE} (lot main)`,
				`run ${died.runId} died before reporting: rerun or dialecte mutants abandon ${died.runId}`,
				ACT_ON_EACH_LINE,
			],
		})
	})

	it('a running run of the branch, a plain hand-over → warning, its survivors are not in yet', () => {
		const root = mutationPackage()
		const running = startRunning({ root })

		expect(pendingVerdict(paramsOf({ root }))).toEqual({
			status: 'warning',
			detail: `run ${running.runId} still running (pid ${process.pid}): its survivors are not in yet`,
			lines: [],
		})
	})

	it('a running run of a merged branch, a merge hand-over → failed, the merge waits for it', () => {
		const root = mutationPackage()
		const running = startRunning({ root, branch: 'feat/x' })

		expect(pendingVerdict(paramsOf({ root, mergedBranches: ['feat/x'] }))).toEqual({
			status: 'failed',
			detail: `run ${running.runId} still running (pid ${process.pid}): the merge waits for it`,
			lines: [],
		})
	})

	it('a running run of the branch, lot mode gate → failed, a gate lot waits for it', () => {
		const root = mutationPackage()
		const running = startRunning({ root })

		expect(pendingVerdict(paramsOf({ root, lotMode: { kind: 'gate' } }))).toEqual({
			status: 'failed',
			detail: `run ${running.runId} still running (pid ${process.pid}): a gate lot waits for it${GATE_PART}`,
			lines: [],
		})
	})

	it('a running run, a merge hand-over and lot mode gate → the gate wording', () => {
		const root = mutationPackage()
		const running = startRunning({ root, branch: 'feat/x' })

		expect(
			pendingVerdict(paramsOf({ root, mergedBranches: ['feat/x'], lotMode: { kind: 'gate' } })),
		).toMatchObject({
			status: 'failed',
			detail: `run ${running.runId} still running (pid ${process.pid}): a gate lot waits for it${GATE_PART}`,
		})
	})

	it('two running runs of the branch → one part per run, joined by " · ", still a warning', () => {
		const root = mutationPackage()
		const first = startRunning({ root, now: startedAt(1) })
		const second = startRunning({ root, now: startedAt(2) })

		expect(pendingVerdict(paramsOf({ root }))).toEqual({
			status: 'warning',
			detail: [first, second]
				.map(
					({ runId }) =>
						`run ${runId} still running (pid ${process.pid}): its survivors are not in yet`,
				)
				.join(' · '),
			lines: [],
		})
	})

	it('a running run of another branch → passed, nothing pending', () => {
		const root = mutationPackage()
		startRunning({ root, branch: 'feat/other' })

		expect(pendingVerdict(paramsOf({ root, mergedBranches: ['feat/x'] }))).toEqual({
			status: 'passed',
			detail: 'nothing pending',
			lines: [],
		})
	})

	it('a new survivor and a running run of a merged branch → failed, the new part first, then the running part', () => {
		const root = mutationPackage()
		reportRun({ root, survivors: [survivorOf({ key: 'k1' })], now: startedAt(1) })
		const running = startRunning({ root, branch: 'feat/x', now: startedAt(2) })

		expect(pendingVerdict(paramsOf({ root, mergedBranches: ['feat/x'] }))).toEqual({
			status: 'failed',
			detail: `1 new survivor${STATUS_TAIL} · run ${running.runId} still running (pid ${process.pid}): the merge waits for it`,
			lines: [`${FIRST_LINE} (lot main)`, ACT_ON_EACH_LINE],
		})
	})

	it('killed, recorded and scheduled survivors, reported and abandoned runs only → passed, nothing pending', () => {
		const root = mutationPackage()
		reportRun({
			root,
			survivors: [survivorOf({ key: 'k1' }), survivorOf({ key: 'k2' }), survivorOf({ key: 'k3' })],
			now: startedAt(1),
		})
		reportRun({
			root,
			survivors: [survivorOf({ key: 'k2' }), survivorOf({ key: 'k3' })],
			detected: ['k1'],
			tested: ['k1', 'k2', 'k3'],
			records: recordsListing('k3'),
			now: startedAt(2),
		})
		scheduleSurvivor({ root, key: 'k2' })
		abandonDied({ root, run: startDied({ root, now: startedAt(3) }) })

		expect(pendingVerdict(paramsOf({ root }))).toEqual({
			status: 'passed',
			detail: 'nothing pending',
			lines: [],
		})
	})

	it('a plain hand-over, one new survivor and a running run of the branch → failed, both parts, the running one with the warning wording', () => {
		const root = mutationPackage()
		reportRun({ root, survivors: [survivorOf({ key: 'k1' })], now: startedAt(1) })
		const running = startRunning({ root, now: startedAt(2) })

		expect(pendingVerdict(paramsOf({ root }))).toMatchObject({
			status: 'failed',
			detail: `1 new survivor${STATUS_TAIL} · run ${running.runId} still running (pid ${process.pid}): its survivors are not in yet`,
		})
	})

	it('two died runs → the count is plural', () => {
		const root = mutationPackage()
		startDied({ root, now: startedAt(1) })
		startDied({ root, now: startedAt(2) })

		expect(pendingVerdict(paramsOf({ root }))).toMatchObject({
			status: 'failed',
			detail: `2 died runs${STATUS_TAIL}`,
		})
	})

	it('an injected isAlive answering false → this process’s running run reads as died', () => {
		const root = mutationPackage()
		const run = startRunning({ root })

		expect(pendingVerdict({ ...paramsOf({ root }), isAlive: () => false })).toEqual({
			status: 'failed',
			detail: `1 died run${STATUS_TAIL}`,
			lines: [
				`run ${run.runId} died before reporting: rerun or dialecte mutants abandon ${run.runId}`,
				ACT_ON_EACH_LINE,
			],
		})
	})

	it('a gate lot with no reported run → failed, run dialecte mutants run on this tree first', () => {
		const root = mutationPackage()

		expect(pendingVerdict(paramsOf({ root, lotMode: { kind: 'gate' } }))).toMatchObject({
			status: 'failed',
			detail: GATE_ALONE,
		})
	})

	it('a gate lot whose only reported run of the branch is on another tree → failed, the same detail', () => {
		const root = mutationPackage()
		reportRun({ root, survivors: [] })

		expect(
			pendingVerdict(paramsOf({ root, lotMode: { kind: 'gate' }, tree: 'b'.repeat(40) })),
		).toMatchObject({ status: 'failed', detail: GATE_ALONE })
	})

	it('a gate lot with a reported run of its branch on the tree and nothing else pending → passed', () => {
		const root = mutationPackage()
		reportRun({ root, survivors: [] })

		expect(pendingVerdict(paramsOf({ root, lotMode: { kind: 'gate' } }))).toEqual({
			status: 'passed',
			detail: 'nothing pending',
			lines: [],
		})
	})

	it('a gate lot whose only reported run is on the same tree but of another branch → failed, the same detail', () => {
		const root = mutationPackage()
		reportRun({ root, branch: 'feat/other', survivors: [] })

		expect(pendingVerdict(paramsOf({ root, lotMode: { kind: 'gate' } }))).toMatchObject({
			status: 'failed',
			detail: GATE_ALONE,
		})
	})

	it('a gate lot whose reported run is of a merged branch on the tree → passed', () => {
		const root = mutationPackage()
		reportRun({ root, branch: 'feat/x', survivors: [] })

		expect(
			pendingVerdict(paramsOf({ root, mergedBranches: ['feat/x'], lotMode: { kind: 'gate' } })),
		).toMatchObject({ status: 'passed', detail: 'nothing pending' })
	})

	it('a gate lot with a new survivor and no reported run → both failed parts, the survivors first', () => {
		const root = mutationPackage()
		reportRun({ root, survivors: [survivorOf({ key: 'k1' })], tree: 'b'.repeat(40) })

		expect(pendingVerdict(paramsOf({ root, lotMode: { kind: 'gate' } }))).toMatchObject({
			status: 'failed',
			detail: `1 new survivor${STATUS_TAIL}${GATE_PART}`,
		})
	})

	it('survivors, a died run and a running run of another package of the repository → passed, nothing pending', () => {
		const { root, other } = declaredRepositoryWithOtherPackage()
		reportRun({
			root: other,
			survivors: [survivorOf({ key: 'k9', file: OTHER_SCOPE_FILE })],
			now: startedAt(1),
		})
		startDied({ root: other, now: startedAt(2) })
		startRunning({ root: other, now: startedAt(3) })

		expect(pendingVerdict(paramsOf({ root }))).toEqual({
			status: 'passed',
			detail: 'nothing pending',
			lines: [],
		})
	})
})

describe('lotModeOf', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	function lotFile(mutation: string): Record<string, string> {
		return { 'lot.json': `${JSON.stringify({ mutation })}\n` }
	}

	it('the hand-over folder holds a lot file → its setting, whatever the root’s says', () => {
		const root = temporaryFolder('dialecte-lot-mode-root-')
		const folder = temporaryFolder('dialecte-lot-mode-folder-')
		writeFiles({
			root,
			files: { '.dialecte/lot.json': `${JSON.stringify({ mutation: 'audit' })}\n` },
		})
		writeFiles({ root: folder, files: lotFile('gate') })

		expect(lotModeOf({ root, folder })).toEqual({ kind: 'gate' })
	})

	it('the folder holds none → the root’s setting', () => {
		const root = temporaryFolder('dialecte-lot-mode-root-')
		const folder = temporaryFolder('dialecte-lot-mode-folder-')
		writeFiles({
			root,
			files: { '.dialecte/lot.json': `${JSON.stringify({ mutation: 'audit' })}\n` },
		})

		expect(lotModeOf({ root, folder })).toEqual({ kind: 'audit' })
	})

	it('neither holds one → default', () => {
		const root = temporaryFolder('dialecte-lot-mode-root-')
		const folder = temporaryFolder('dialecte-lot-mode-folder-')

		expect(lotModeOf({ root, folder })).toEqual({ kind: 'default' })
	})

	it('the folder’s lot file has no mutation key → default, the root’s setting is not read', () => {
		const root = temporaryFolder('dialecte-lot-mode-root-')
		const folder = temporaryFolder('dialecte-lot-mode-folder-')
		writeFiles({
			root,
			files: { '.dialecte/lot.json': `${JSON.stringify({ mutation: 'audit' })}\n` },
		})
		writeFiles({
			root: folder,
			files: { 'lot.json': `${JSON.stringify({ tdd: 'exempt: a rename' })}\n` },
		})

		expect(lotModeOf({ root, folder })).toEqual({ kind: 'default' })
	})

	it('the folder’s lot.json holds an unknown mutation mode → invalid, the reason names the file, the four modes and the value', () => {
		const root = temporaryFolder('dialecte-lot-mode-root-')
		const folder = temporaryFolder('dialecte-lot-mode-folder-')
		writeFiles({ root: folder, files: lotFile('sometimes') })

		expect(lotModeOf({ root, folder })).toEqual({
			kind: 'invalid',
			reason: `${join(folder, 'lot.json')}: "mutation" must be one of off, changed, audit, gate, not "sometimes"`,
		})
	})

	it('the folder’s lot.json is not JSON → invalid, the reason says not JSON with the parser’s message', () => {
		const root = temporaryFolder('dialecte-lot-mode-root-')
		const folder = temporaryFolder('dialecte-lot-mode-folder-')
		const text = 'not json\n'
		writeFiles({ root: folder, files: { 'lot.json': text } })

		expect(lotModeOf({ root, folder })).toEqual({
			kind: 'invalid',
			reason: `${join(folder, 'lot.json')}: not JSON (${parserMessageOf(text)})`,
		})
	})
})

/** What `JSON.parse` says about this text, as the running Node words it. */
function parserMessageOf(text: string): string {
	try {
		JSON.parse(text)
	} catch (error) {
		return (error as Error).message
	}
	throw new Error('the text is JSON')
}
