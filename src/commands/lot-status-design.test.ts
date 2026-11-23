/** `lot status` names the lot's design standing (DESIGN-GATE section 4): one line, and a `design` block with `--json`. */
import { APPROVER, DECLARED_GLOB } from '../../test/design-workspace.constants.ts'
import {
	baseDeclaringLot,
	design,
	designLot,
	saveReadyVerdict,
} from '../../test/design-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe('lot status - the design', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('an approved design -> the design line names the state, the approver by kind and why it is needed', () => {
		const lot = designLot({ declared: true })
		design({ lot, words: ['--from', lot.designFile] })
		saveReadyVerdict({ designFile: lot.designFile })
		design({ lot, words: ['--approve', '--by', APPROVER] })

		expect(runLot({ cwd: lot.cwd, argv: ['status', lot.name] }).output.split('\n')).toContain(
			`design approved by person · shared ${DECLARED_GLOB}`,
		)
	})

	it('--json -> a design block, the approver by kind', () => {
		const lot = designLot({ declared: true })

		expect(
			JSON.parse(runLot({ cwd: lot.cwd, argv: ['status', lot.name, '--json'] }).output),
		).toMatchObject({
			design: {
				required: true,
				reasons: [{ kind: 'shared', glob: DECLARED_GLOB, path: 'src' }],
				state: 'missing',
				by: null,
				uncovered: [],
			},
		})
	})

	it("a main checkout whose package.json dropped an area its base declares -> lot status still names it, from the lot's base snapshot", () => {
		const lot = designLot()
		baseDeclaringLot(lot)

		expect(
			JSON.parse(runLot({ cwd: lot.cwd, argv: ['status', lot.name, '--json'] }).output),
		).toMatchObject({
			design: {
				required: true,
				reasons: [{ kind: 'shared', glob: DECLARED_GLOB, path: 'src' }],
				state: 'missing',
			},
		})
	})
})
