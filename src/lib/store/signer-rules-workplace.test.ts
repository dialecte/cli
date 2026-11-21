/**
 * The signer rule (SAFE 3.5, 5.6): `--by orchestrator` - any candidate of the line, trimmed and case-folded - is
 * refused from a lot's workplace (its own worktree, a `-round-<n>` or `-verify` throwaway), for any verb that signs;
 * the main checkout, a rehearsal clone and a folder outside any repository sign freely; a `--by` the verb's walk
 * consumed as another option's value is no candidate. `lot approve` takes `--by orchestrator` for the cli's own lots
 * only, recorded as the one word.
 */
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { recordingHost } from '../../../test/land-lot.ts'
import { addRoundOf, landingLotOf } from '../../../test/landing-lot.ts'
import { LOT_NAME } from '../../../test/lot-pr.constants.ts'
import { OTHER_PACKAGE } from '../../../test/lot-review.constants.ts'
import { landedLot } from '../../../test/lot-review.ts'
import { addVerifyThrowaway, rehearsalCloneOf } from '../../../test/scope-guard-lot.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { runLotApprove } from '../../commands/lot-approve.ts'
import { runLot } from '../../commands/lot.ts'
import {
	approvalSignerRefusal,
	isOrchestratorSigner,
	lotWorkplaceOf,
	recordedByOf,
	workplaceSignerRefusal,
} from './signer-rules.ts'
import { STORE_FILES } from './store.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LandingLot } from '../../../test/landing-lot.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** Where a case runs from, around the lot. */
type Place = 'worktree' | 'round' | 'verify' | 'main' | 'clone' | 'outside'

/** The real path of `place` for the lot. */
function placeOf(params: { lot: LandingLot; place: Place }): string {
	const { lot, place } = params
	if (place === 'worktree') return lot.worktree
	if (place === 'round') return addRoundOf({ lot, round: 1 })
	if (place === 'verify') return addVerifyThrowaway(lot)
	if (place === 'main') return realpathSync(lot.repository.root)
	if (place === 'clone') return rehearsalCloneOf({ root: lot.worktree, branch: lot.branch })
	return realpathSync(temporaryFolder('dialecte-signer-outside-'))
}

/** The dispatch refusal naming the lot. */
function refusalOf(lot: LandingLot): string {
	return `--by orchestrator is signed from the main checkout: from lot ${lot.name}'s worktree, sign --by lot-session`
}

describe('isOrchestratorSigner', () => {
	const ROWS: { by: string; orchestrator: boolean }[] = [
		{ by: 'orchestrator', orchestrator: true },
		{ by: 'Orchestrator', orchestrator: true },
		{ by: ' ORCHESTRATOR ', orchestrator: true },
		{ by: 'lot-session', orchestrator: false },
		{ by: 'person-a', orchestrator: false },
		{ by: 'orchestrator-bot', orchestrator: false },
	]

	for (const { by, orchestrator } of ROWS)
		it(`${JSON.stringify(by)} -> ${orchestrator ? 'the orchestrator' : 'not the orchestrator'}`, () => {
			expect(isOrchestratorSigner(by)).toBe(orchestrator)
		})
})

describe('lotWorkplaceOf', { timeout: STORE_CASE_TIMEOUT }, () => {
	const WORKPLACES: Place[] = ['worktree', 'round', 'verify']
	const ELSEWHERE: Place[] = ['main', 'clone', 'outside']

	for (const place of WORKPLACES)
		it(`from the ${place} -> the lot's folder`, () => {
			const lot = landingLotOf()
			const cwd = placeOf({ lot, place })

			expect(lotWorkplaceOf({ cwd })).toBe(lot.lotFolder)
		})

	for (const place of ELSEWHERE)
		it(`from the ${place} -> none`, () => {
			const lot = landingLotOf()
			const cwd = placeOf({ lot, place })

			expect(lotWorkplaceOf({ cwd })).toBeUndefined()
		})
})

describe('workplaceSignerRefusal', { timeout: STORE_CASE_TIMEOUT }, () => {
	type Row = { title: string; place: Place; command: string; argv: (name: string) => string[] }

	const REFUSED: Row[] = [
		{
			title: "lot scope --by orchestrator from the lot's worktree",
			place: 'worktree',
			command: 'lot',
			argv: (name) => ['scope', name, '--add', 'src/y.ts', '--by', 'orchestrator', '--reason', 'r'],
		},
		{
			title: 'the same from its -round-1 throwaway',
			place: 'round',
			command: 'lot',
			argv: (name) => ['scope', name, '--add', 'src/y.ts', '--by', 'orchestrator', '--reason', 'r'],
		},
		{
			title: 'the same from its -verify throwaway',
			place: 'verify',
			command: 'lot',
			argv: (name) => ['scope', name, '--add', 'src/y.ts', '--by', 'orchestrator', '--reason', 'r'],
		},
		{
			title: '--by Orchestrator from the worktree',
			place: 'worktree',
			command: 'lot',
			argv: (name) => ['scope', name, '--add', 'src/y.ts', '--by', 'Orchestrator', '--reason', 'r'],
		},
		{
			title: "--by ' ORCHESTRATOR ' from the worktree",
			place: 'worktree',
			command: 'lot',
			argv: (name) => [
				'scope',
				name,
				'--add',
				'src/y.ts',
				'--by',
				' ORCHESTRATOR ',
				'--reason',
				'r',
			],
		},
		{
			title: 'handover run --not-a-lot --by orchestrator --reason r --by x (the first value)',
			place: 'worktree',
			command: 'handover',
			argv: () => ['run', '--not-a-lot', '--by', 'orchestrator', '--reason', 'r', '--by', 'x'],
		},
		{
			title: 'lot scope x --by x --by orchestrator (the last value)',
			place: 'worktree',
			command: 'lot',
			argv: (name) => ['scope', name, '--by', 'x', '--by', 'orchestrator'],
		},
		{
			title: 'handover run --probe --by orchestrator (a hidden option)',
			place: 'worktree',
			command: 'handover',
			argv: () => ['run', '--probe', '--by', 'orchestrator'],
		},
		{
			title:
				'lot scope x --reason --reason --by orchestrator (the walk consumed the second --reason)',
			place: 'worktree',
			command: 'lot',
			argv: (name) => ['scope', name, '--reason', '--reason', '--by', 'orchestrator'],
		},
		{
			title: 'lot verify --by orchestrator from the -verify throwaway, no lot argument',
			place: 'verify',
			command: 'lot',
			argv: () => ['verify', '--by', 'orchestrator', '--note', 'n'],
		},
		{
			title: 'ask answer a1 "t" --quote --by --by orchestrator (fails closed)',
			place: 'worktree',
			command: 'ask',
			argv: () => ['answer', 'a1', 't', '--quote', '--by', '--by', 'orchestrator'],
		},
		{
			title: '--by=orchestrator',
			place: 'worktree',
			command: 'lot',
			argv: (name) => ['scope', name, '--add', 'src/y.ts', '--by=orchestrator', '--reason', 'r'],
		},
		{
			title: 'lot unkeep <id> --by orchestrator',
			place: 'worktree',
			command: 'lot',
			argv: (name) => ['unkeep', name, '--by', 'orchestrator', '--reason', 'r'],
		},
	]

	const NOT_REFUSED: Row[] = [
		{
			title: 'the same from the main checkout',
			place: 'main',
			command: 'lot',
			argv: (name) => ['scope', name, '--add', 'src/y.ts', '--by', 'orchestrator', '--reason', 'r'],
		},
		{
			title: 'the same from a rehearsal clone',
			place: 'clone',
			command: 'lot',
			argv: (name) => ['scope', name, '--add', 'src/y.ts', '--by', 'orchestrator', '--reason', 'r'],
		},
		{
			title: 'the same from a folder outside any repository',
			place: 'outside',
			command: 'lot',
			argv: (name) => ['scope', name, '--add', 'src/y.ts', '--by', 'orchestrator', '--reason', 'r'],
		},
		{
			title: '--by lot-session from the worktree',
			place: 'worktree',
			command: 'lot',
			argv: (name) => ['scope', name, '--add', 'src/y.ts', '--by', 'lot-session', '--reason', 'r'],
		},
		{
			title: '--by person-a from the worktree',
			place: 'worktree',
			command: 'lot',
			argv: (name) => ['scope', name, '--add', 'src/y.ts', '--by', 'person-a', '--reason', 'r'],
		},
		{
			title: '--by orchestrator-bot from the worktree',
			place: 'worktree',
			command: 'lot',
			argv: (name) => [
				'scope',
				name,
				'--add',
				'src/y.ts',
				'--by',
				'orchestrator-bot',
				'--reason',
				'r',
			],
		},
		{
			title: 'lot scope x --reason --by --by lot-session (the reason holds --by)',
			place: 'worktree',
			command: 'lot',
			argv: (name) => ['scope', name, '--reason', '--by', '--by', 'lot-session'],
		},
		{
			title: 'lot status, a verb whose usage takes no --by',
			place: 'worktree',
			command: 'lot',
			argv: (name) => ['status', name, '--by', 'orchestrator'],
		},
	]

	for (const { title, place, command, argv } of REFUSED)
		it(`${title} -> refused`, () => {
			const lot = landingLotOf()
			const cwd = placeOf({ lot, place })

			expect(workplaceSignerRefusal({ command, argv: argv(lot.name), cwd })).toBe(refusalOf(lot))
		})

	for (const { title, place, command, argv } of NOT_REFUSED)
		it(`${title} -> not refused`, () => {
			const lot = landingLotOf()
			const cwd = placeOf({ lot, place })

			expect(workplaceSignerRefusal({ command, argv: argv(lot.name), cwd })).toBeUndefined()
		})
})

describe('workplaceSignerRefusal - a --by after --', { timeout: STORE_CASE_TIMEOUT }, () => {
	it("lot brief <id> --from f --reason r -- --by orchestrator from the lot's worktree -> no signature: past the scan, a usage refusal (exit 2), the brief unchanged", () => {
		const lot = landingLotOf()
		const briefFile = join(lot.lotFolder, STORE_FILES.brief)
		const before = readFileSync(briefFile, 'utf8')
		const from = join(temporaryFolder('dialecte-signer-brief-'), 'brief.json')
		writeFileSync(
			from,
			`${JSON.stringify({ ...(JSON.parse(before) as Record<string, unknown>), summary: 'X answers one, now.' }, null, 2)}\n`,
		)
		const argv = ['brief', lot.name, '--from', from, '--reason', 'r', '--', '--by', 'orchestrator']

		expect({
			dispatch: workplaceSignerRefusal({ command: 'lot', argv, cwd: lot.worktree }),
			exitCode: runLot({ cwd: lot.worktree, argv }).exitCode,
			brief: readFileSync(briefFile, 'utf8'),
		}).toEqual({ dispatch: undefined, exitCode: 2, brief: before })
	})
})

describe("lot approve - the orchestrator signs the cli's own lots", () => {
	const OTHER_PACKAGE_LINE =
		"lot approve: demo lots are approved by a person: --by orchestrator is for the cli's own lots"

	const ROWS: { title: string; by: string; packageName: string; refusal: string | undefined }[] = [
		{
			title: 'orchestrator on another package',
			by: 'orchestrator',
			packageName: 'demo',
			refusal: OTHER_PACKAGE_LINE,
		},
		{
			title: "' orchestrator ' on another package",
			by: ' orchestrator ',
			packageName: 'demo',
			refusal: OTHER_PACKAGE_LINE,
		},
		{
			title: "orchestrator on the cli's own lot",
			by: 'orchestrator',
			packageName: '@dialecte/cli',
			refusal: undefined,
		},
		{
			title: 'a person on another package',
			by: 'person-a',
			packageName: 'demo',
			refusal: undefined,
		},
	]

	for (const { title, by, packageName, refusal } of ROWS)
		it(`${title} -> ${refusal === undefined ? 'taken' : 'refused with the package line'}`, () => {
			expect(approvalSignerRefusal({ by, packageName })).toBe(refusal)
		})

	it("' orchestrator ' -> recorded as orchestrator", () => {
		expect(recordedByOf({ by: ' orchestrator ' })).toBe('orchestrator')
	})
})

/** `lot approve <lot> --by <by>` from the main checkout of a landed lot of `packageName`, its checks green. */
function approveAs(params: { by: string; packageName?: string }) {
	const lot = landedLot({ packageName: params.packageName })
	const { host } = recordingHost({
		existing: lot.changeRequest,
		checks: { head: lot.head, state: 'green', failing: [], pending: [] },
	})
	const result = runLotApprove({
		cwd: lot.workspace.repository,
		argv: [LOT_NAME, '--by', params.by],
		host,
	})
	const approvals = join(lot.lotFolder, STORE_FILES.approvals)
	return {
		exitCode: result.exitCode,
		output: result.output,
		recordedBy: existsSync(approvals)
			? readFileSync(approvals, 'utf8')
					.split('\n')
					.filter(Boolean)
					.map((line) => (JSON.parse(line) as { by: string }).by)
			: [],
	}
}

describe(
	'lot approve - the orchestrator through the command',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it("' Orchestrator ' on a package other than the cli -> refused with the package line, nothing recorded", () => {
			expect(approveAs({ by: ' Orchestrator ', packageName: OTHER_PACKAGE })).toEqual({
				exitCode: 2,
				output: `lot approve: ${OTHER_PACKAGE} lots are approved by a person: --by orchestrator is for the cli's own lots`,
				recordedBy: [],
			})
		})

		it("' orchestrator ' on the cli's own lot -> approved, recorded as orchestrator", () => {
			expect(approveAs({ by: ' orchestrator ' })).toMatchObject({
				exitCode: 0,
				recordedBy: ['orchestrator'],
			})
		})
	},
)

describe(
	'lot approve - the orchestrator through the command (kept as today)',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it("orchestrator on the cli's own lot -> approved, recorded as orchestrator", () => {
			expect(approveAs({ by: 'orchestrator' })).toMatchObject({
				exitCode: 0,
				recordedBy: ['orchestrator'],
			})
		})
	},
)
