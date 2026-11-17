/**
 * `lot start` and its dry run print whether the lot needs a design, before any code (DESIGN-GATE section 1): the
 * reasons and what to record when it does.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createStartWorkspace, withLines } from '../../test/lot-start-workspace.ts'
import { START_NOW } from '../../test/lot-start.constants.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const DECLARED = 'src/dataflow/**'
const REQUIRED_LINE = `design required (shared ${DECLARED}): write it, then dialecte lot design <id> --from <file>`

describe('lot start - the design need', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a scope touching no declared area, no plan entry -> the dry run says design not required', () => {
		const start = createStartWorkspace()

		expect(
			withLines(
				runLot({
					cwd: start.cwd,
					argv: ['start', start.workspace.briefPath, '--dry-run'],
					now: START_NOW,
				}),
			).lines,
		).toContain('design not required')
	})

	it('a scope in a declared area -> the dry run names the area and what to record', () => {
		const start = createStartWorkspace()
		writeFileSync(
			join(start.workspace.repository, 'package.json'),
			`${JSON.stringify({ name: 'scratch', dialecte: { risk: { high: [DECLARED] } } })}\n`,
		)

		expect(
			withLines(
				runLot({
					cwd: start.cwd,
					argv: ['start', start.workspace.briefPath, '--effort', 'high', '--dry-run'],
					now: START_NOW,
				}),
			).lines,
		).toContain(REQUIRED_LINE)
	})

	it('a real start in a declared area -> the same line', () => {
		const start = createStartWorkspace()
		writeFileSync(
			join(start.workspace.repository, 'package.json'),
			`${JSON.stringify({ name: 'scratch', dialecte: { risk: { high: [DECLARED] } } })}\n`,
		)

		expect(
			withLines(
				runLot({
					cwd: start.cwd,
					argv: ['start', start.workspace.briefPath, '--effort', 'high'],
					now: START_NOW,
				}),
			).lines,
		).toContain(REQUIRED_LINE)
	})
})
