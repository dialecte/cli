/**
 * `dialecte lot brief <id> --from <brief.json> --by <who> --reason <text>`: a started lot's public text rewritten -
 * its summary, issue, step titles and behaviours, nothing else - after the start's public-text checks, recorded as a
 * transition with the old and new brief hashes, so its pull request renders from the corrected records.
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { FIRST_WORD } from '../../test/forbidden-words-workspace.constants.ts'
import { configureMachine } from '../../test/forbidden-words-workspace.ts'
import { LOT_NAME, LOT_STEP } from '../../test/lot-pr.constants.ts'
import { pullRequestLot } from '../../test/lot-pr.ts'
import { planEntryOf, writeMarkedPlan } from '../../test/plan-block.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { preparePullRequest } from '../lib/pr/pull-request-sources.ts'
import { readTransitions } from '../lib/store/transitions.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PullRequestLot } from '../../test/lot-pr.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const BY = 'person-a'
const REASON = 'the behaviour quoted a plan id'

/** The lot's stored brief text and its parsed value. */
function storedBriefOf(lot: PullRequestLot): { text: string; value: Record<string, unknown> } {
	const text = readFileSync(join(lot.lotFolder, 'brief.json'), 'utf8')
	return { text, value: JSON.parse(text) as Record<string, unknown> }
}

/** `lot brief <lot> --from <the stored brief with changes> --by --reason`; the new brief's text beside the result. */
function rewrite(params: { lot: PullRequestLot; changes: Record<string, unknown> }) {
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

/** The brief's one step with its behaviours replaced. */
function stepWith(behaviours: string[]): Record<string, unknown>[] {
	return [{ ...LOT_STEP, spec: '## Step 1', behaviours }]
}

describe('dialecte lot brief', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a new summary and behaviour → the stored brief replaced, a transition with both hashes, by and reason', () => {
		const lot = pullRequestLot()
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

	it.each([
		['its scope', { scope: ['src/', 'changes/', 'docs/'] }, 'scope'],
		['a step added', { steps: [...stepWith(['a -> b']), ...stepWith(['c -> d'])] }, 'steps'],
		[
			'a step spec',
			{ steps: [{ ...stepWith(['a -> b'])[0], spec: '## Step 2' }] },
			'steps[0].spec',
		],
		['its commit message', { lots: [{ paths: ['src/'], message: 'feat(x): other' }] }, 'lots'],
		['its branch', { branch: 'feat/y' }, 'branch'],
	])('a change of %s → refused, the field named, nothing written', (_name, changes, field) => {
		const lot = pullRequestLot()
		const before = storedBriefOf(lot).text
		const transitions = readTransitions({ lotFolder: lot.lotFolder }).length

		const { result } = rewrite({ lot, changes })

		expect(result.exitCode).toBe(1)
		expect(result.output).toBe(
			`lot brief: ${field} changed: only the summary, the issue, step titles and behaviours change after the start, nothing written`,
		)
		expect(storedBriefOf(lot).text).toBe(before)
		expect(readTransitions({ lotFolder: lot.lotFolder })).toHaveLength(transitions)
	})

	it('a behaviour holding a forbidden word → refused with the start refusal, nothing written', () => {
		const lot = pullRequestLot()
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
		const lot = pullRequestLot()

		const result = runLot({
			cwd: lot.workspace.repository,
			argv: ['brief', LOT_NAME, '--from', join(lot.lotFolder, 'brief.json')],
		})

		expect(result.exitCode).toBe(2)
	})

	it("a brief quoting the lot's plan entry id → no pull request text; rewritten → its body renders", () => {
		const lot = pullRequestLot({ brief: { steps: stepWith(['x asked as SUB1 says -> one']) } })
		writeMarkedPlan({
			briefFolder: lot.workspace.briefFolder,
			file: 'lot-plan.md',
			lots: [planEntryOf({ id: 'SUB1', branch: String(storedBriefOf(lot).value.branch) })],
		})
		function prepare() {
			return preparePullRequest({
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
})
