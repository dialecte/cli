/**
 * What `lot report` never holds, touches or starts (33L0 section 2 rules 2 and 3, section 14 cases 30 and 31): nothing
 * of `asks/` in its text or JSON, no `node:child_process` in its import graph, the store's and the registry's bytes
 * unchanged by a run, and `next` for a committed lot whose worktree is on disk is `lot close <registry name>`, never `--yes`.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { reachFrom } from '../../test/import-reach.ts'
import { ASK_SENTINEL, REPORT_NOW } from '../../test/lot-report-workspace.constants.ts'
import { createRecordedLot, hashTree } from '../../test/lot-report-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StationLot } from '../../test/lot-station-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const COMMANDS_FOLDER = import.meta.dirname
const EVENTS_FOLDER = join(COMMANDS_FOLDER, '..', 'lib', 'events')

/** A committed recorded lot whose `asks/` holds a file with the sentinel. */
function lotWithAsk(): StationLot {
	const lot = createRecordedLot({ state: 'committed' })
	mkdirSync(join(lot.lotFolder, 'asks'), { recursive: true })
	writeFileSync(join(lot.lotFolder, 'asks', 'A-1.json'), JSON.stringify({ text: ASK_SENTINEL }))
	return lot
}

describe('lot report: case 30, asks/ stays out', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a lot whose asks/ holds the sentinel → neither the text nor the JSON contains it', () => {
		const lot = lotWithAsk()

		expect(
			((text, json) => ({
				text: text.output.includes(ASK_SENTINEL),
				json: json.output.includes(ASK_SENTINEL),
				read: [text.exitCode, json.exitCode],
			}))(
				runLot({ cwd: lot.cwd, argv: ['report', lot.name], now: REPORT_NOW }),
				runLot({ cwd: lot.cwd, argv: ['report', lot.name, '--json'], now: REPORT_NOW }),
			),
		).toEqual({ text: false, json: false, read: [0, 0] })
	})
})

describe('lot report: case 31, reads files only', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('the import graph of lot-report.ts reaches the reader and the renderer and no node:child_process', () => {
		const { files, childProcessImporters } = reachFrom(join(COMMANDS_FOLDER, 'lot-report.ts'))

		expect({ childProcessImporters, files }).toEqual({
			childProcessImporters: [],
			files: expect.arrayContaining([
				join(EVENTS_FOLDER, 'read-lot-report.ts'),
				join(EVENTS_FOLDER, 'render-report.ts'),
			]),
		})
	})

	it('a report of the lot, text and JSON, then of its feature → every file of the store, the registry, the worktree’s git folder and the state folder has the same bytes, and no file is added', () => {
		const lot = lotWithAsk()
		const state = process.env.XDG_STATE_HOME ?? ''
		const before = {
			store: hashTree(lot.workspace.store),
			registry: hashTree(lot.workspace.registry),
			worktreeGit: hashTree(join(lot.worktree, '.git')),
			state: hashTree(state),
		}

		expect(
			((results) => ({
				exits: results.map((result) => result.exitCode),
				store: hashTree(lot.workspace.store),
				registry: hashTree(lot.workspace.registry),
				worktreeGit: hashTree(join(lot.worktree, '.git')),
				state: hashTree(state),
			}))([
				runLot({ cwd: lot.cwd, argv: ['report', lot.name], now: REPORT_NOW }),
				runLot({ cwd: lot.cwd, argv: ['report', lot.name, '--json'], now: REPORT_NOW }),
				runLot({ cwd: lot.cwd, argv: ['report', '--feature', 'branch'], now: REPORT_NOW }),
			]),
		).toEqual({ exits: [0, 0, 0], ...before })
	})

	it('R4-3 (was: lot prune): a committed lot whose worktree is on disk, with a registry entry → next is dialecte lot close <registry name> in text and JSON, never --yes', () => {
		const lot = createRecordedLot({ state: 'committed' })

		expect(
			((text, json) => ({
				textNext: text.output.split('\n').filter((line) => /^next\s/.test(line)),
				jsonNext: JSON.parse(json.output).next,
				yes: text.output.includes('--yes') || json.output.includes('--yes'),
			}))(
				runLot({ cwd: lot.cwd, argv: ['report', lot.name], now: REPORT_NOW }),
				runLot({ cwd: lot.cwd, argv: ['report', lot.name, '--json'], now: REPORT_NOW }),
			),
		).toEqual({
			textNext: [expect.stringMatching(new RegExp(`dialecte lot close ${lot.name}$`))],
			jsonNext: `dialecte lot close ${lot.name}`,
			yes: false,
		})
	})
})
