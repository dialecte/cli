/**
 * The card's `effort` gate line (33L1 section 5, D20, D26): right after the `review` line, the detail of
 * `buildEffortLine` from the hand-over folder's `risk.jsonl`; a warning below the risk class that never changes the
 * card's verdict; none on a release hand-over.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { editedPackage } from '../../../test/handover-profile.ts'
import { STORE_BRANCH, STORE_FIRST_NAME } from '../../../test/handover-store-scenario.constants.ts'
import { show, writeStoreHandover } from '../../../test/handover-store-scenario.ts'
import { RMSYNC_REASON } from '../../../test/risk-workspace.constants.ts'
import { derivedLineOf, effortLineOf, writeRiskLines } from '../../../test/risk-workspace.ts'
import { runGateIn } from '../../../test/scratch-checks.ts'
import { git, isolateGitConfig } from '../../../test/scratch-repository.ts'
import { EDITOR_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { STANDARD_ENVIRONMENT_VARIABLE } from '../standard/standard.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { RiskDerivedLine, RiskEffortLine } from '../risk/risk.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

type CardLine = { name: string; status: string; detail: string }

/** A hand-over of a green package, its folder holding `lines` as `risk.jsonl`; `release` marks its lots file. */
async function handoverWith(params: {
	lines: Array<RiskEffortLine | RiskDerivedLine>
	release: boolean
}): Promise<{ root: string }> {
	isolateGitConfig()
	vi.stubEnv(STANDARD_ENVIRONMENT_VARIABLE, undefined)
	const root = editedPackage({ profile: null })
	git({ root, args: ['checkout', '-q', '-b', STORE_BRANCH] })
	await runGateIn({ cwd: root, argv: [] })
	const { folder } = writeStoreHandover({ root, name: 'effort' })
	if (params.release) {
		const folderLots = join(folder, 'lots.json')
		writeFileSync(
			folderLots,
			JSON.stringify({ ...JSON.parse(readFileSync(folderLots, 'utf8')), release: true }),
		)
	}
	writeRiskLines({ folder, lines: params.lines })
	return { root }
}

/** The card of the hand-over of `root` as data: its verdict, failed gates and gate lines. */
function cardOf(params: { root: string }): {
	verdict: string
	failedGates: string[]
	gates: CardLine[]
} {
	return JSON.parse(show({ cwd: params.root, argv: [STORE_FIRST_NAME, '--json'] }).output)
}

/** The gate line that follows the `review` line, with the verdict and the failed gates. */
function afterReview(params: { root: string }): {
	verdict: string
	failedGates: string[]
	line: CardLine | undefined
} {
	const { verdict, failedGates, gates } = cardOf(params)
	return {
		verdict,
		failedGates,
		line: gates[gates.findIndex((gate) => gate.name === 'review') + 1],
	}
}

describe('the effort line of the card', { timeout: EDITOR_CASE_TIMEOUT }, () => {
	it('an effort line and a derived line -> the effort line right after review, with the detail', async () => {
		const { root } = await handoverWith({
			lines: [
				effortLineOf({ effort: 'high' }),
				derivedLineOf({ class: 'high', reasons: [RMSYNC_REASON], from: 'handover-write' }),
			],
			release: false,
		})

		expect(afterReview({ root })).toEqual({
			verdict: 'READY',
			failedGates: [],
			line: {
				name: 'effort',
				status: 'passed',
				detail:
					'high · risk class high at handover write (src/cleanup.ts:2: rmSync) · 0 review rounds of 3',
			},
		})
	})

	it('an effort below the class -> a warning line, the verdict still READY', async () => {
		const { root } = await handoverWith({
			lines: [
				effortLineOf({ effort: 'medium', reason: 'a rerun is cheap' }),
				derivedLineOf({ class: 'high', reasons: [RMSYNC_REASON], from: 'handover-write' }),
			],
			release: false,
		})

		expect(afterReview({ root })).toEqual({
			verdict: 'READY',
			failedGates: [],
			line: {
				name: 'effort',
				status: 'warning',
				detail: 'medium below risk class high (by reviewer: a rerun is cheap)',
			},
		})
	})

	it('the same folder shown as text -> the effort row starts with the warning mark', async () => {
		const { root } = await handoverWith({
			lines: [
				effortLineOf({ effort: 'medium', reason: 'a rerun is cheap' }),
				derivedLineOf({ class: 'high', reasons: [RMSYNC_REASON], from: 'handover-write' }),
			],
			release: false,
		})

		const output = show({ cwd: root, argv: [STORE_FIRST_NAME] }).output

		expect(output).toMatch(
			/^│ ! effort +medium below risk class high \(by reviewer: a rerun is cheap\) *│$/m,
		)
	})

	it('the same lines, release or not -> the effort line only on the one that is not', async () => {
		const lines = [
			effortLineOf({ effort: 'high' }),
			derivedLineOf({ class: 'high', reasons: [RMSYNC_REASON], from: 'handover-write' as const }),
		]
		const plain = await handoverWith({ lines, release: false })
		const release = await handoverWith({ lines, release: true })

		expect({
			plain: cardOf({ root: plain.root }).gates.some((gate) => gate.name === 'effort'),
			release: cardOf({ root: release.root }).gates.some((gate) => gate.name === 'effort'),
		}).toEqual({ plain: true, release: false })
	})
})
