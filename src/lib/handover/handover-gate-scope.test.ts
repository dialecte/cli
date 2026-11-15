/** The base a hand-over hands its commits' hooks: whenever a full or a hook step is scoped. */
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { READ_LOT } from '../../../test/scratch-checks.constants.ts'
import { editReadLot, readFolder, writeHandoverFolder } from '../../../test/scratch-checks.ts'
import { createScratchRepository } from '../../../test/scratch-repository.ts'
import { resolveHandoverGateScope } from './handover-gate-scope.ts'

import { describe, expect, it } from 'vitest'

import type { GateStep } from '../gate/gate-config.types.ts'

const CHECK: GateStep = { name: 'check', run: 'true' }
const SCOPED_TESTS: GateStep = { name: 'tests', run: 'true', counts: 'tests', scoped: true }

describe('resolveHandoverGateScope', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it.each([
		{ label: 'no scoped step anywhere → no base handed down', hook: [CHECK], handsDown: false },
		{
			label: 'only the declared hook list holds a scoped test step → the base is handed down',
			hook: [CHECK, SCOPED_TESTS],
			handsDown: true,
		},
	])('$label', ({ hook, handsDown }) => {
		const root = createScratchRepository({
			'package.json': `${JSON.stringify({ name: 'demo', scripts: {}, dialecte: { gate: { full: [CHECK], fast: [CHECK], hook } } })}\n`,
			'.gitignore': 'node_modules\n',
			'src/read.ts': 'export function read() {}\n',
			'CHANGELOG.md': '# Changelog\n',
		})
		editReadLot(root)
		const { out } = writeHandoverFolder({ root, lots: [READ_LOT] })

		const scope = resolveHandoverGateScope({ handover: readFolder(out) })

		expect('handoverBase' in scope && scope.handoverBase !== undefined).toBe(handsDown)
	})
})
