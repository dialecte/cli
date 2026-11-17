/**
 * `lot scope <id> --add <path>` of a stacked lot (FIX-ci-loop item 4): the stack parent's scope is the lot's base,
 * never an overlap, as `lot start --on` reads it; any other open lot's scope still refuses the add.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { writeStoreLot } from '../../test/brief-workspace.ts'
import { startRealLot } from '../../test/lot-handover-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { readLotScope } from '../lib/store/lot-records.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LotHandoverWorkspace } from '../../test/lot-handover-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const NOW = new Date('2026-11-17T20:00:00.000Z')
/** The open lot holding `docs/`, and the path the add names in it. */
const DOCS_LOT = '0009-repo-docs'
const ADDED = 'docs/setup.md'

/** A started lot, an open lot holding `docs/`, and the started lot stacked on it when `stacked`. */
function lotBesideDocsLot(params: { stacked: boolean }): LotHandoverWorkspace {
	const lot = startRealLot()
	writeStoreLot({ workspace: lot.start.workspace, name: DOCS_LOT, scope: ['docs/'] })
	if (params.stacked)
		writeFileSync(
			join(lot.lotFolder, 'stack.json'),
			`${JSON.stringify({ schema: 1, parent: DOCS_LOT })}\n`,
		)
	return lot
}

/** The arguments of `lot scope <lot> --add <ADDED>` from the main checkout. */
function addArgumentsOf(lot: LotHandoverWorkspace) {
	return {
		cwd: lot.start.cwd,
		argv: ['scope', lot.lotName, '--add', ADDED, '--by', 'person-a', '--reason', 'its docs'],
		now: NOW,
	}
}

describe('lot scope --add of a stacked lot', { timeout: STORE_CASE_TIMEOUT }, () => {
	it("lot scope --add of a path of the stack parent's scope → added, never an overlap", () => {
		const lot = lotBesideDocsLot({ stacked: true })

		expect({
			exitCode: runLot(addArgumentsOf(lot)).exitCode,
			added: readLotScope({ lotFolder: lot.lotFolder }).includes(ADDED),
		}).toEqual({ exitCode: 0, added: true })
	})

	it("lot scope --add of a path of another open lot's scope, the lot not stacked on it → refused as an overlap", () => {
		const lot = lotBesideDocsLot({ stacked: false })

		expect({
			exitCode: runLot(addArgumentsOf(lot)).exitCode,
			added: readLotScope({ lotFolder: lot.lotFolder }).includes(ADDED),
		}).toEqual({ exitCode: 2, added: false })
	})
})
