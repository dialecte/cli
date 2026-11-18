/**
 * `handover write` of a store lot holds the lot to its design (DESIGN-GATE section 3, hand-over flow): a lot whose
 * required design is missing is refused, nothing written, nothing registered.
 */
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { STORE_WRITER_CLI } from '../../test/handover-store-scenario.constants.ts'
import { registeredFolders, startRealLot } from '../../test/lot-handover-workspace.ts'
import { noRepositoryCli } from '../../test/repository-cli-probe.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { COMMIT_SCRIPT_FILE } from '../lib/handover/handover.constants.ts'
import { runHandover } from './handover.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const DECLARED = 'src/dataflow/**'

describe('handover write - the design gate', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a store lot whose scope reaches a declared area, the design missing -> refused, nothing written or registered', () => {
		const lot = startRealLot()
		writeFileSync(
			join(lot.start.workspace.repository, 'package.json'),
			`${JSON.stringify({ name: 'scratch', dialecte: { risk: { high: [DECLARED] } } })}\n`,
		)

		expect(
			runHandover({
				argv: [lot.lotsPath, '--out', lot.lotFolder],
				cliPath: STORE_WRITER_CLI,
				probe: noRepositoryCli,
				now: new Date('2026-11-17T12:00:00.000Z'),
			}),
		).toMatchObject({
			exitCode: 2,
			output: expect.stringContaining(
				`handover write: lot ${lot.lotName} design missing (shared ${DECLARED}): `,
			),
		})
		expect(existsSync(join(lot.lotFolder, COMMIT_SCRIPT_FILE))).toBe(false)
		expect(registeredFolders(lot)).toEqual([])
	})
})
