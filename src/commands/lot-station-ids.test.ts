/**
 * `lot station` and the lot an id names (33L0 case 14): an index two stores hold is refused, listing both full
 * names, and nothing is written in either; the command map lists the verb.
 */
import { existsSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

import { STATION } from '../../test/lot-station-workspace.constants.ts'
import { createWorkspaceWithLots, writeStoreListFile } from '../../test/lot-stores.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { COMMAND_MAP } from '../lib/command-map/command-map.constants.ts'
import { renderLotUsage } from '../lib/command-map/render-help.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** Two stores each holding the index 0005, and a folder that belongs to neither. */
function twoStoresWithTheSameIndex() {
	const first = createWorkspaceWithLots({ names: ['0005-repo-b'] })
	const second = createWorkspaceWithLots({ names: ['0005-repo-c'] })
	writeStoreListFile({
		stores: [first, second].map((each) => realpathSync(each.workspace.store)),
	})
	return {
		eventFiles: [first, second].map((each) =>
			join(Object.values(each.folders)[0], STORE_FILES.events),
		),
		third: realpathSync(temporaryFolder('third-')),
		firstRepository: first.workspace.repository,
	}
}

describe(
	'lot station: an index that two stores hold (case 14)',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('the index 0005 from a third folder → exit 2 listing both full names, nothing written in either', () => {
			const { eventFiles, third } = twoStoresWithTheSameIndex()

			expect(
				((result) => ({
					exitCode: result.exitCode,
					namesBoth: ['0005-repo-b', '0005-repo-c'].every((name) =>
						String(JSON.parse(result.output).error).includes(name),
					),
					next: JSON.parse(result.output).next,
					written: eventFiles.map((file) => existsSync(file)),
				}))(runLot({ cwd: third, argv: ['station', '0005', 'start', STATION, '--json'] })),
			).toEqual({ exitCode: 2, namesBoth: true, next: null, written: [false, false] })
		})

		it('the index 0005 from inside the first store repository → exit 2 listing both, not that store own lot', () => {
			const { eventFiles, firstRepository } = twoStoresWithTheSameIndex()

			expect(
				((result) => ({
					exitCode: result.exitCode,
					namesBoth: ['0005-repo-b', '0005-repo-c'].every((name) =>
						String(JSON.parse(result.output).error).includes(name),
					),
					written: eventFiles.map((file) => existsSync(file)),
				}))(
					runLot({
						cwd: firstRepository,
						argv: ['station', '0005', 'start', STATION, '--json'],
					}),
				),
			).toEqual({ exitCode: 2, namesBoth: true, written: [false, false] })
		})

		it('the full name 0005-repo-c from the third folder → recorded in that lot only', () => {
			const { eventFiles, third } = twoStoresWithTheSameIndex()

			expect(
				((result) => ({
					exitCode: result.exitCode,
					written: eventFiles.map((file) => existsSync(file)),
				}))(runLot({ cwd: third, argv: ['station', '0005-repo-c', 'start', STATION, '--json'] })),
			).toEqual({ exitCode: 0, written: [false, true] })
		})
	},
)

describe('the command map: lot station', () => {
	it('the lot usage lists the three forms of the verb', () => {
		expect(COMMAND_MAP.lot.usage.filter((line) => line.startsWith('dialecte lot station'))).toEqual(
			[
				expect.stringMatching(/^dialecte lot station <id> start <station>/),
				expect.stringMatching(/^dialecte lot station <id> end <station> \[--run <run>\]/),
				expect.stringMatching(/^dialecte lot station <id> --from <file\.json>/),
			],
		)
	})

	it('the end usage line reaches --event (the identity flags are spelled or defined)', () => {
		expect(
			COMMAND_MAP.lot.usage.find((line) => line.startsWith('dialecte lot station <id> end ')),
		).toContain('--event')
	})

	it('the lot notes describe the verb', () => {
		expect(
			(COMMAND_MAP.lot.notes ?? []).filter((note) => note.startsWith('station - ')),
		).toHaveLength(1)
	})

	it('the lot exit codes list the exits 1 and 2 of the verb', () => {
		expect(COMMAND_MAP.lot.exitCodes.filter((line) => /^[12] +.*\bstation\b/.test(line))).toEqual([
			expect.stringMatching(/^1 +.*station/),
			expect.stringMatching(/^2 +.*station/),
		])
	})

	it('the rendered lot usage names the verb', () => {
		expect(renderLotUsage()).toContain('station <id> start <station>')
	})
})
