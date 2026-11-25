/**
 * `dialecte lot brief <id> --from <brief.json> --by <who> --reason <text>`: a started lot's public text rewritten -
 * its summary, issue, step titles and behaviours, nothing else - after the start's public-text checks, recorded as a
 * transition with the old and new brief hashes, so its pull request renders from the corrected records.
 */
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createBriefWorkspace, writeStoreLot } from '../../test/brief-workspace.ts'
import { FIRST_WORD } from '../../test/forbidden-words-workspace.constants.ts'
import { configureMachine } from '../../test/forbidden-words-workspace.ts'
import { LOT_NAME, LOT_STEP } from '../../test/lot-describe.constants.ts'
import { changeRequestLot } from '../../test/lot-describe.ts'
import { planEntryOf, writeMarkedPlan } from '../../test/plan-block.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { prepareChangeRequest } from '../lib/change-request/change-request-sources.ts'
import { readTransitions } from '../lib/store/transitions.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ChangeRequestLot } from '../../test/lot-describe.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const BY = 'person-a'
const REASON = 'the behaviour quoted a plan id'

/** The lot's stored brief text and its parsed value. */
function storedBriefOf(lot: ChangeRequestLot): { text: string; value: Record<string, unknown> } {
	const text = readFileSync(join(lot.lotFolder, 'brief.json'), 'utf8')
	return { text, value: JSON.parse(text) as Record<string, unknown> }
}

/** `lot brief <lot> --from <the stored brief with changes> --by --reason`; the new brief's text beside the result. */
function rewrite(params: { lot: ChangeRequestLot; changes: Record<string, unknown> }) {
	const text = `${JSON.stringify({ ...storedBriefOf(params.lot).value, ...params.changes }, null, 2)}\n`
	const from = join(temporaryFolder('dialecte-new-brief-'), 'brief.json')
	writeFileSync(from, text)
	const result = runLot({
		cwd: params.lot.workspace.repository,
		argv: ['brief', LOT_NAME, '--from', from, '--by', BY, '--reason', REASON],
	})
	return { result, text }
}

function sha256(text: string): string {
	return createHash('sha256').update(text).digest('hex')
}

type BriefLot = { paths: string[]; message: string }

/** The commit lots of the lot's stored brief. */
function lotsOf(lot: ChangeRequestLot): BriefLot[] {
	return storedBriefOf(lot).value.lots as BriefLot[]
}

/** The brief's one step with its behaviours replaced. */
function stepWith(behaviours: string[]): Record<string, unknown>[] {
	return [{ ...LOT_STEP, spec: '## Step 1', behaviours }]
}

describe('dialecte lot brief', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a new summary and behaviour → the stored brief replaced, a transition with both hashes, by and reason', () => {
		const lot = changeRequestLot()
		const before = storedBriefOf(lot).text

		const { result, text } = rewrite({
			lot,
			changes: { summary: 'X answers one, now.', steps: stepWith(['x asked twice -> one']) },
		})

		expect(result.exitCode).toBe(0)
		expect(result.output).toBe(
			`lot brief: ${LOT_NAME} rewritten (summary, steps[0].behaviours[0]) by ${BY}`,
		)
		expect(storedBriefOf(lot).text).toBe(text)
		expect(readTransitions({ lotFolder: lot.lotFolder }).at(-1)).toMatchObject({
			state: 'working',
			cause: { kind: 'brief', by: BY, reason: REASON },
			brief: { from: sha256(before), to: sha256(text) },
		})
	})

	it('reviewer sections added, then reordered, then removed → each rewrite stored, the line naming sections', () => {
		const lot = changeRequestLot()
		const first = { heading: 'Deviations from the design', text: 'One pass kept.' }
		const second = { heading: 'Removals this fix refuses', text: 'Nothing outside the lot.' }

		const added = rewrite({ lot, changes: { sections: [first, second] } })
		expect(added.result.output).toBe(`lot brief: ${LOT_NAME} rewritten (sections) by ${BY}`)
		expect(storedBriefOf(lot).value.sections).toEqual([first, second])

		rewrite({ lot, changes: { sections: [second, first] } })
		expect(storedBriefOf(lot).value.sections).toEqual([second, first])

		const removed = rewrite({ lot, changes: { sections: [] } })
		expect(removed.result.exitCode).toBe(0)
		expect(storedBriefOf(lot).value.sections).toEqual([])
	})

	it('a reviewer section led by # → refused by the field check, nothing written', () => {
		const lot = changeRequestLot()
		const before = storedBriefOf(lot).text

		const { result } = rewrite({
			lot,
			changes: { sections: [{ heading: '## Deviations', text: 'One pass kept.' }] },
		})

		expect(result).toEqual({
			exitCode: 1,
			output:
				'lot brief: sections[0].heading must be one non-empty line of at most 120 characters, without a leading #: nothing written',
		})
		expect(storedBriefOf(lot).text).toBe(before)
	})

	it.each([
		['its scope', { scope: ['src/', 'changes/', 'docs/'] }, 'scope'],
		['a step added', { steps: [...stepWith(['a -> b']), ...stepWith(['c -> d'])] }, 'steps'],
		[
			'a step spec',
			{ steps: [{ ...stepWith(['a -> b'])[0], spec: '## Step 2' }] },
			'steps[0].spec',
		],
		['its branch', { branch: 'feat/y' }, 'branch'],
	])('a change of %s → refused, the field named, nothing written', (_name, changes, field) => {
		const lot = changeRequestLot()
		const before = storedBriefOf(lot).text
		const transitions = readTransitions({ lotFolder: lot.lotFolder }).length

		const { result } = rewrite({ lot, changes })

		expect(result.exitCode).toBe(1)
		expect(result.output).toBe(
			`lot brief: ${field} changed: only the summary, the issue, the reviewer sections, step titles and behaviours, and each lot's commit message change after the start, nothing written`,
		)
		expect(storedBriefOf(lot).text).toBe(before)
		expect(readTransitions({ lotFolder: lot.lotFolder })).toHaveLength(transitions)
	})

	it.each([
		{
			label: "a lot's paths",
			change: (lots: BriefLot[]) => ({ lots: [{ ...lots[0], paths: ['src/other.ts'] }] }),
			field: 'lots[0].paths',
		},
		{
			label: 'a lot added',
			change: (lots: BriefLot[]) => ({ lots: [...lots, { ...lots[0], message: 'feat(x): more' }] }),
			field: 'lots',
		},
		{
			label: 'a lot removed',
			change: (lots: BriefLot[]) => ({ lots: lots.slice(1) }),
			field: 'lots',
		},
	])('a change of $label → refused, the field named, nothing written', ({ change, field }) => {
		const lot = changeRequestLot()
		const before = storedBriefOf(lot).text
		const transitions = readTransitions({ lotFolder: lot.lotFolder }).length

		const { result } = rewrite({ lot, changes: change(lotsOf(lot)) })

		expect(result.exitCode).toBe(1)
		expect(result.output).toBe(
			`lot brief: ${field} changed: only the summary, the issue, the reviewer sections, step titles and behaviours, and each lot's commit message change after the start, nothing written`,
		)
		expect(storedBriefOf(lot).text).toBe(before)
		expect(readTransitions({ lotFolder: lot.lotFolder })).toHaveLength(transitions)
	})

	it('a new commit message of a lot → the stored brief replaced, the line naming lots[0].message, a transition', () => {
		const lot = changeRequestLot()
		const [first] = lotsOf(lot)

		const { result, text } = rewrite({
			lot,
			changes: { lots: [{ ...first, message: 'chore(release): @scope/x 0.9.0' }] },
		})

		expect(result.exitCode).toBe(0)
		expect(result.output).toBe(`lot brief: ${LOT_NAME} rewritten (lots[0].message) by ${BY}`)
		expect(storedBriefOf(lot).text).toBe(text)
		expect(readTransitions({ lotFolder: lot.lotFolder }).at(-1)).toMatchObject({
			cause: { kind: 'brief', by: BY, reason: REASON },
		})
	})

	it('a commit message on two lines → refused by the field check, nothing written', () => {
		const lot = changeRequestLot()
		const [first] = lotsOf(lot)
		const before = storedBriefOf(lot).text

		const { result } = rewrite({
			lot,
			changes: { lots: [{ ...first, message: 'fix(x): one\ntwo' }] },
		})

		expect(result.exitCode).toBe(1)
		expect(result.output).toBe(
			'lot brief: lots[0] must be an object with a one-line message: nothing written',
		)
		expect(storedBriefOf(lot).text).toBe(before)
	})

	it('a rewritten commit message → the pull request title renders it', () => {
		const lot = changeRequestLot()
		const [first] = lotsOf(lot)

		rewrite({ lot, changes: { lots: [{ ...first, message: 'fix(x): renamed' }] } })
		const prepared = prepareChangeRequest({
			lotFolder: lot.lotFolder,
			worktree: lot.worktree,
			baseRef: 'main',
		})

		expect('refusal' in prepared ? prepared.refusal : prepared.sources.messages[0]).toBe(
			'fix(x): renamed',
		)
	})

	it('a behaviour holding a forbidden word → refused with the start refusal, nothing written', () => {
		const lot = changeRequestLot()
		configureMachine({ userFileLines: [FIRST_WORD] })
		const before = storedBriefOf(lot).text

		const { result } = rewrite({
			lot,
			changes: { steps: stepWith([`x asked by ${FIRST_WORD} -> one`]) },
		})

		expect(result.exitCode).toBe(1)
		expect(result.output).toBe(
			'lot brief: steps[0].behaviours[0] holds a forbidden word: nothing written',
		)
		expect(storedBriefOf(lot).text).toBe(before)
	})

	it('without --by and --reason → the usage, exit 2', () => {
		const lot = changeRequestLot()

		const result = runLot({
			cwd: lot.workspace.repository,
			argv: ['brief', LOT_NAME, '--from', join(lot.lotFolder, 'brief.json')],
		})

		expect(result.exitCode).toBe(2)
	})

	it("a brief quoting the lot's plan entry id → no pull request text; rewritten → its body renders", () => {
		const lot = changeRequestLot({ brief: { steps: stepWith(['x asked as SUB1 says -> one']) } })
		writeMarkedPlan({
			briefFolder: lot.workspace.briefFolder,
			file: 'lot-plan.md',
			lots: [planEntryOf({ id: 'SUB1', branch: String(storedBriefOf(lot).value.branch) })],
		})
		function prepare() {
			return prepareChangeRequest({
				lotFolder: lot.lotFolder,
				worktree: lot.worktree,
				baseRef: 'main',
			})
		}
		const refused = prepare()

		rewrite({ lot, changes: { steps: stepWith(['x asked once -> one']) } })

		expect('refusal' in refused).toBe(true)
		const rendered = prepare()
		expect('refusal' in rendered ? rendered.refusal : rendered.sources.steps).toEqual([
			{ title: LOT_STEP.title, behaviours: ['x asked once -> one'] },
		])
	})

	it('a simulated lot → refused: it plays its scenario, nothing written', () => {
		const workspace = createBriefWorkspace()
		writeStoreLot({ workspace, name: LOT_NAME, scope: ['src/'], simulated: true })
		const from = join(temporaryFolder('dialecte-new-brief-'), 'brief.json')
		writeFileSync(from, '{}')

		const result = runLot({
			cwd: workspace.repository,
			argv: ['brief', LOT_NAME, '--from', from, '--by', BY, '--reason', REASON],
		})

		expect(result).toEqual({
			exitCode: 1,
			output: `lot brief: ${LOT_NAME} is simulated: it plays its scenario, nothing written`,
		})
	})

	it('a --from path relative to the command folder → read from there', () => {
		const lot = changeRequestLot()
		const text = `${JSON.stringify({ ...storedBriefOf(lot).value, summary: 'X answers one, again.' })}\n`
		writeFileSync(join(lot.workspace.repository, 'new-brief.json'), text)

		function run() {
			return runLot({
				cwd: lot.workspace.repository,
				argv: ['brief', LOT_NAME, '--from', 'new-brief.json', '--by', BY, '--reason', REASON],
			})
		}

		expect(run).not.toThrow()
		expect(storedBriefOf(lot).text).toBe(text)
	})

	it('a --from file that cannot be read → refused, exit 1, nothing written', () => {
		const lot = changeRequestLot()

		function run() {
			return runLot({
				cwd: lot.workspace.repository,
				argv: ['brief', LOT_NAME, '--from', 'missing.json', '--by', BY, '--reason', REASON],
			})
		}

		expect(run).not.toThrow()
		expect(run()).toEqual({
			exitCode: 1,
			output: 'lot brief: missing.json cannot be read: nothing written',
		})
	})

	it('a canceled lot → refused, its state named', () => {
		const lot = changeRequestLot()
		runLot({ cwd: lot.workspace.repository, argv: ['stop', LOT_NAME, '--reason', 'done'] })

		const { result } = rewrite({ lot, changes: { summary: 'X answers one, now.' } })

		expect(result.output).toBe(
			`lot brief: ${LOT_NAME} is canceled: only a working or ready lot takes a new brief, nothing written`,
		)
	})

	it('the same brief with its keys in another order → already held, no transition', () => {
		const lot = changeRequestLot()
		const transitions = readTransitions({ lotFolder: lot.lotFolder }).length
		const reordered = Object.fromEntries(Object.entries(storedBriefOf(lot).value).reverse())
		const from = join(temporaryFolder('dialecte-new-brief-'), 'brief.json')
		writeFileSync(from, JSON.stringify(reordered))

		const result = runLot({
			cwd: lot.workspace.repository,
			argv: ['brief', LOT_NAME, '--from', from, '--by', BY, '--reason', REASON],
		})

		expect(result.output).toBe(`lot brief: ${LOT_NAME} already holds this brief: nothing written`)
		expect(readTransitions({ lotFolder: lot.lotFolder })).toHaveLength(transitions)
	})

	it.each([
		['an issue number', 7, 0, `lot brief: ${LOT_NAME} rewritten (issue) by ${BY}`],
		[
			'an issue that is no positive integer',
			0,
			1,
			'lot brief: issue must be a positive integer: nothing written',
		],
	])('%s → %s', (_name, issue, exitCode, line) => {
		const lot = changeRequestLot()

		const { result } = rewrite({ lot, changes: { issue } })

		expect({ exitCode: result.exitCode, output: result.output }).toEqual({
			exitCode,
			output: line,
		})
	})

	it('a rewrite → the stored brief stays read-only, the state and position kept', () => {
		const lot = changeRequestLot()
		const before = readTransitions({ lotFolder: lot.lotFolder }).at(-1)

		rewrite({ lot, changes: { summary: 'X answers one, now.' } })

		expect(statSync(join(lot.lotFolder, 'brief.json')).mode & 0o222).toBe(0)
		expect(readTransitions({ lotFolder: lot.lotFolder }).at(-1)).toMatchObject({
			state: before?.state,
			position: before?.position,
			question: null,
		})
	})

	it('its transition cannot be written → refused, the stored brief and the transitions as they were, no next brief left', () => {
		const lot = changeRequestLot()
		const before = storedBriefOf(lot).text
		const transitions = readTransitions({ lotFolder: lot.lotFolder }).length
		const folder = join(lot.lotFolder, 'transitions')
		chmodSync(folder, 0o555)
		try {
			function rewriteNow() {
				return rewrite({ lot, changes: { summary: 'X answers one, now.' } }).result
			}

			expect(rewriteNow).not.toThrow()
			expect(rewriteNow().output).toMatch(
				/^lot brief: its transition cannot be written: .+: nothing written$/,
			)
		} finally {
			chmodSync(folder, 0o755)
		}
		expect(storedBriefOf(lot).text).toBe(before)
		expect(readTransitions({ lotFolder: lot.lotFolder })).toHaveLength(transitions)
		expect(existsSync(join(lot.lotFolder, 'brief.json.next'))).toBe(false)
	})
})

describe('dialecte lot brief - how --by reads', { timeout: STORE_CASE_TIMEOUT }, () => {
	/** A new brief file: the stored brief with a new summary; its path. */
	function newBriefOf(lot: ChangeRequestLot): string {
		const text = `${JSON.stringify({ ...storedBriefOf(lot).value, summary: 'X answers one, now.' }, null, 2)}\n`
		const from = join(temporaryFolder('dialecte-new-brief-'), 'brief.json')
		writeFileSync(from, text)
		return from
	}

	it('--by orchestrator after -- -> a usage refusal (exit 2), the brief not rewritten', () => {
		const lot = changeRequestLot()
		const before = storedBriefOf(lot).text
		const from = newBriefOf(lot)

		expect(
			[
				runLot({
					cwd: lot.workspace.repository,
					argv: [
						'brief',
						LOT_NAME,
						'--from',
						from,
						'--reason',
						REASON,
						'--',
						'--by',
						'orchestrator',
					],
				}),
			].map(function readOf(result) {
				return { exitCode: result.exitCode, brief: storedBriefOf(lot).text }
			})[0],
		).toEqual({ exitCode: 2, brief: before })
	})

	it('--by given twice -> the last value signs, as every verb reads its options', () => {
		const lot = changeRequestLot()
		const from = newBriefOf(lot)

		expect(
			[
				runLot({
					cwd: lot.workspace.repository,
					argv: [
						'brief',
						LOT_NAME,
						'--from',
						from,
						'--by',
						'person-a',
						'--by',
						'person-b',
						'--reason',
						REASON,
					],
				}),
			].map(function signerOf(result) {
				return {
					exitCode: result.exitCode,
					by: (
						readTransitions({ lotFolder: lot.lotFolder }).at(-1)?.cause as
							| { by?: string }
							| undefined
					)?.by,
				}
			})[0],
		).toEqual({ exitCode: 0, by: 'person-b' })
	})
})
