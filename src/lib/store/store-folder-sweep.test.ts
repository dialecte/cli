/** The store sweep of `lot start`: a dead builder's `.<name>.tmp-<pid>` folder goes, a file named like one stays. */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { deadPid } from '../../../test/dead-pid.ts'
import { snapshotOf } from '../../../test/lot-start-workspace.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { removeStoreLeftovers } from './store-folder.ts'

import { describe, expect, it } from 'vitest'

const INNER_TEXT = 'half a lot folder'
const FILE_BYTES = 'a user file that only looks like a leftover\n'

describe('removeStoreLeftovers', { timeout: STORE_CASE_TIMEOUT }, () => {
	it("a dead pid's .<name>.tmp-<pid> folder with files inside, and a dead pid's FILE named .x.tmp-<pid> -> the folder removed with what it holds, the file byte-identical", () => {
		const store = temporaryFolder('dialecte-store-sweep-')
		const pid = deadPid()
		const fileName = `.x.tmp-${pid}`
		const folder = join(store, `.0001-repo-lot.tmp-${pid}`)
		writeFileSync(join(store, fileName), FILE_BYTES)
		mkdirSync(join(folder, 'transitions'), { recursive: true })
		writeFileSync(join(folder, 'transitions', '000001.json'), INNER_TEXT)

		expect(removeStoreLeftovers({ store })).toBeUndefined()

		expect(existsSync(folder)).toBe(false)
		expect(snapshotOf(store)).toEqual({ [fileName]: FILE_BYTES })
	})
})
