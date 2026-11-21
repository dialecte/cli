/**
 * `settleLotLanding`: one store lot's landing as every verb that closes or prunes settles it, once (DESIGN 3.3). A lot
 * that cannot be read says why; a landed fact answers without git or the host; a canceled lot is not read; a merge
 * read by git or the host is recorded once; a committed lot not merged says why (the host's reason, or not provable
 * offline without a host); an open one gives its state.
 */
import { chmodSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { replaceRecord } from '../../../test/damaged-lot-workspace.ts'
import {
	LANDING_LOT_FILE,
	LANDING_NOW,
	LANDING_CHANGE_REQUEST_NUMBER,
	MAIN_EDIT_TEXT,
	MISSING_BASE_BRANCH,
} from '../../../test/landing-lot.constants.ts'
import {
	configureMissingBase,
	landingLotOf,
	registerLotEntry,
	writeLandedFact,
} from '../../../test/landing-lot.ts'
import {
	editOnOrigin,
	landingHostOf,
	mergeOnOrigin,
	changeRequestOf,
	pushBranch,
} from '../../../test/landing-repository.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { runLot } from '../../commands/lot.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { readLanded } from './landed-record.ts'
import {
	NOT_LANDED_TEXTS,
	NOT_PROVABLE_OFFLINE,
	SETTLE_NOT_A_LOT,
} from './lot-landing.constants.ts'
import { settleLotLanding } from './lot-landing.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe('settleLotLanding: one settle per lot', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a folder with no store records → notRead, with why', () => {
		const folder = join(temporaryFolder('dialecte-not-a-lot-'), '0009-repo-none')
		mkdirSync(folder)

		expect(settleLotLanding({ lotFolder: folder, now: LANDING_NOW })).toEqual({
			notRead: SETTLE_NOT_A_LOT,
		})
	})

	it('a damaged lot (its identity does not parse) → notRead, the damage named', () => {
		const lot = landingLotOf()
		replaceRecord({ folder: lot.lotFolder, name: 'identity.json', text: '{' })

		expect(settleLotLanding({ lotFolder: lot.lotFolder, now: LANDING_NOW })).toEqual({
			notRead: expect.stringContaining('identity'),
		})
	})

	it('a lot whose folder holds a landed fact → landed with that fact, the host never asked', () => {
		const lot = landingLotOf()
		writeLandedFact({ lot, tip: lot.tip })
		const { host, asked } = landingHostOf({})

		expect({
			settled: settleLotLanding({ lotFolder: lot.lotFolder, host, now: LANDING_NOW }),
			asked,
		}).toEqual({
			settled: { landed: expect.objectContaining({ how: 'ancestor', tip: lot.tip }) },
			asked: [],
		})
	})

	it('a canceled lot whose work is merged → canceled, its landing not read, nothing written', () => {
		const lot = landingLotOf()
		mergeOnOrigin({ repository: lot.repository, how: 'fast-forward' })
		expect(
			runLot({ cwd: lot.workspace.repository, argv: ['stop', lot.name, '--reason', 'dropped'] })
				.exitCode,
		).toBe(0)
		const { host, asked } = landingHostOf({})

		expect({
			settled: settleLotLanding({ lotFolder: lot.lotFolder, host, now: LANDING_NOW }),
			asked,
			landed: readLanded({ lotFolder: lot.lotFolder }),
		}).toEqual({ settled: { canceled: true }, asked: [], landed: undefined })
	})

	it('an open lot fast-forwarded into main → its landed fact recorded once, landed', () => {
		const lot = landingLotOf()
		mergeOnOrigin({ repository: lot.repository, how: 'fast-forward' })

		expect({
			settled: settleLotLanding({ lotFolder: lot.lotFolder, now: LANDING_NOW }),
			recorded: readLanded({ lotFolder: lot.lotFolder }),
		}).toEqual({
			settled: { landed: expect.objectContaining({ how: 'ancestor', tip: lot.tip }) },
			recorded: expect.objectContaining({ how: 'ancestor', tip: lot.tip }),
		})
	})

	it('a lot squash-merged, main editing its lines again, the host answering merged → landed by the host', () => {
		const lot = landingLotOf()
		mergeOnOrigin({ repository: lot.repository, how: 'squash' })
		editOnOrigin({ repository: lot.repository, files: { [LANDING_LOT_FILE]: MAIN_EDIT_TEXT } })
		const { host } = landingHostOf({
			byBranch: {
				[lot.branch]: changeRequestOf({
					number: LANDING_CHANGE_REQUEST_NUMBER,
					state: 'merged',
					head: lot.tip,
				}),
			},
		})

		expect({
			settled: settleLotLanding({ lotFolder: lot.lotFolder, host, now: LANDING_NOW }),
			recorded: readLanded({ lotFolder: lot.lotFolder }),
		}).toEqual({
			recorded: expect.objectContaining({ how: 'host' }),
			settled: {
				landed: expect.objectContaining({
					how: 'host',
					changeRequest: expect.objectContaining({ number: LANDING_CHANGE_REQUEST_NUMBER }),
				}),
			},
		})
	})

	it('a lot committed by its registry entry, not merged, a silent host → notLanded, its work not in main', () => {
		const lot = landingLotOf()
		registerLotEntry({ lot })
		const { host } = landingHostOf({})

		expect(settleLotLanding({ lotFolder: lot.lotFolder, host, now: LANDING_NOW })).toEqual({
			notLanded: expect.stringContaining(
				fillMessage({ template: NOT_LANDED_TEXTS.unlanded, values: { base: 'main' } }),
			),
		})
	})

	it('a lot committed by its registry entry, pushed, not merged, no host → notLanded, not provable offline', () => {
		const lot = landingLotOf()
		registerLotEntry({ lot })
		pushBranch({ repository: lot.repository })

		expect(settleLotLanding({ lotFolder: lot.lotFolder, now: LANDING_NOW })).toEqual({
			notLanded: fillMessage({ template: NOT_PROVABLE_OFFLINE, values: { lot: lot.name } }),
		})
	})

	it('an open lot not merged → open with its state, nothing written', () => {
		const lot = landingLotOf()
		const { host } = landingHostOf({})

		expect({
			settled: settleLotLanding({ lotFolder: lot.lotFolder, host, now: LANDING_NOW }),
			landed: readLanded({ lotFolder: lot.lotFolder }),
		}).toEqual({
			settled: {
				open: 'working',
				why: fillMessage({ template: NOT_LANDED_TEXTS.unlanded, values: { base: 'main' } }),
			},
			landed: undefined,
		})
	})

	it('a lot whose base branch does not resolve → notRead, the refusal named', () => {
		const lot = landingLotOf()
		configureMissingBase(lot)

		expect(settleLotLanding({ lotFolder: lot.lotFolder, now: LANDING_NOW })).toEqual({
			notRead: expect.stringContaining(MISSING_BASE_BRANCH),
		})
	})

	it('a merged lot whose landed fact cannot be written (its folder read-only) → notRead, nothing decided on a fact not kept', () => {
		const lot = landingLotOf()
		mergeOnOrigin({ repository: lot.repository, how: 'fast-forward' })
		chmodSync(lot.lotFolder, 0o555)
		let settled: unknown
		try {
			settled = settleLotLanding({ lotFolder: lot.lotFolder, now: LANDING_NOW })
		} finally {
			chmodSync(lot.lotFolder, 0o755)
		}

		expect({ settled, recorded: readLanded({ lotFolder: lot.lotFolder }) }).toEqual({
			settled: { notRead: expect.stringMatching(/\S/) },
			recorded: undefined,
		})
	})

	it('a merged lot settled twice → its landed fact recorded once, the second settle leaving its bytes as they are', () => {
		const lot = landingLotOf()
		mergeOnOrigin({ repository: lot.repository, how: 'fast-forward' })
		settleLotLanding({ lotFolder: lot.lotFolder, now: LANDING_NOW })
		const first = readFileSync(join(lot.lotFolder, 'landed.json'), 'utf8')

		expect({
			settled: settleLotLanding({ lotFolder: lot.lotFolder, now: new Date() }),
			bytes: readFileSync(join(lot.lotFolder, 'landed.json'), 'utf8'),
		}).toEqual({ settled: { landed: expect.objectContaining({ tip: lot.tip }) }, bytes: first })
	})
})
