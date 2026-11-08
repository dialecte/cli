/** `lot start`: the store list holds the store before the lot folder is published (33S section 5, step 3; E2). */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { createStartWorkspace } from '../../test/lot-start-workspace.ts'
import { LOT_NAME, START_NOW } from '../../test/lot-start.constants.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { startLot } from './lot-start.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** What a test sees when the seam before the publish runs. */
type SeenBeforePublish = { storeList: string | undefined; lotFolderExists: boolean }

describe('lot start, the order of the writes', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('the seam before the lot folder is published -> called once, the store list already holds the store, the lot folder not yet there', () => {
		const start = createStartWorkspace()
		const seen: SeenBeforePublish[] = []

		expect(
			startLot({
				cwd: start.cwd,
				argv: [start.workspace.briefPath],
				now: START_NOW,
				seams: {
					beforePublish: function lookAtTheStore() {
						seen.push({
							storeList: existsSync(start.workspace.storeList)
								? readFileSync(start.workspace.storeList, 'utf8')
								: undefined,
							lotFolderExists: existsSync(join(start.store, LOT_NAME)),
						})
					},
				},
			}),
		).toMatchObject({ exitCode: 0 })
		expect(seen).toEqual([{ storeList: `${start.store}\n`, lotFolderExists: false }])
	})

	it('a seam before the publish that throws -> no lot folder is published, the store list keeps the store', () => {
		const start = createStartWorkspace()

		expect(
			startLot({
				cwd: start.cwd,
				argv: [start.workspace.briefPath],
				now: START_NOW,
				seams: {
					beforePublish: function breaks() {
						throw new Error('stopped before the publish')
					},
				},
			}),
		).toMatchObject({ exitCode: 1, output: expect.stringContaining('stopped before the publish') })
		expect(existsSync(join(start.store, LOT_NAME))).toBe(false)
		expect(readFileSync(start.workspace.storeList, 'utf8')).toBe(`${start.store}\n`)
	})
})
