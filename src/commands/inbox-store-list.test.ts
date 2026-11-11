/**
 * `dialecte inbox` with a store list that names something that is no store: a file, or a folder that cannot be read.
 * The line is skipped with one line of its own, the other stores list as they did, the exit code is the one the lots
 * decide: never a crash.
 */
import { chmodSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { outcomeOf } from '../../test/call-outcome.ts'
import { RUNS_AS_ROOT } from '../../test/inbox-store-list.constants.ts'
import { createInboxWorkspaces, inboxIn, storePathOf } from '../../test/inbox-workspace.ts'
import { writeStoreListFile } from '../../test/lot-stores.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { InboxWorkspaces } from '../../test/inbox-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The stores of the workspaces, as the list names them. */
function goodStores(workspaces: InboxWorkspaces): string[] {
	return [storePathOf(workspaces.scl), storePathOf(workspaces.core)]
}

/** The text inbox read from the `scl` repository: its exit code and lines, or the message of the error it threw. */
function textInbox(workspaces: InboxWorkspaces) {
	return outcomeOf(function readInbox() {
		const result = inboxIn({ cwd: workspaces.scl.repository })
		return { exitCode: result.exitCode, lines: result.output.split('\n') }
	})
}

/** What the inbox answers once `bad` is in the list: one line naming it, the rest as `before`. */
function skippedAs(params: {
	before: ReturnType<typeof textInbox>
	after: ReturnType<typeof textInbox>
	name: string
}): unknown {
	const { before, after, name } = params
	if (!('value' in before) || !('value' in after)) return after
	return {
		value: {
			exitCode: after.value.exitCode,
			named: after.value.lines.filter((line) => line.includes(name)).length,
			others: after.value.lines.filter((line) => !line.includes(name)),
		},
	}
}

describe('inbox: a store list line that is no store', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a line naming a file -> one line naming it, every other line and the exit code as without it', () => {
		const workspaces = createInboxWorkspaces()
		const before = textInbox(workspaces)
		const file = join(realpathSync(temporaryFolder('dialecte-inbox-list-')), 'not-a-store')
		writeFileSync(file, 'a file, not a store\n')
		writeStoreListFile({ stores: [...goodStores(workspaces), file] })

		const after = textInbox(workspaces)

		expect(skippedAs({ before, after, name: 'not-a-store' })).toEqual({
			value: {
				exitCode: 'value' in before ? before.value.exitCode : undefined,
				named: 1,
				others: 'value' in before ? before.value.lines : undefined,
			},
		})
	})

	it.skipIf(RUNS_AS_ROOT)(
		'a line naming a folder that cannot be read -> one line naming it, every other line and the exit code as without it',
		() => {
			const workspaces = createInboxWorkspaces()
			const before = textInbox(workspaces)
			const folder = join(realpathSync(temporaryFolder('dialecte-inbox-list-')), 'locked-store')
			mkdirSync(folder)
			chmodSync(folder, 0o000)
			writeStoreListFile({ stores: [...goodStores(workspaces), folder] })

			try {
				const after = textInbox(workspaces)

				expect(skippedAs({ before, after, name: 'locked-store' })).toEqual({
					value: {
						exitCode: 'value' in before ? before.value.exitCode : undefined,
						named: 1,
						others: 'value' in before ? before.value.lines : undefined,
					},
				})
			} finally {
				chmodSync(folder, 0o755)
			}
		},
	)

	it('a line naming a file, asked with --json -> no crash: the exit code as without it, JSON output', () => {
		const workspaces = createInboxWorkspaces()
		const before = inboxIn({ cwd: workspaces.scl.repository, words: ['--json'] })
		const file = join(realpathSync(temporaryFolder('dialecte-inbox-list-')), 'not-a-store')
		writeFileSync(file, 'a file, not a store\n')
		writeStoreListFile({ stores: [...goodStores(workspaces), file] })

		const after = outcomeOf(function readInbox() {
			const result = inboxIn({ cwd: workspaces.scl.repository, words: ['--json'] })
			return { exitCode: result.exitCode, parses: Boolean(JSON.parse(result.output)) }
		})

		expect(after).toEqual({ value: { exitCode: before.exitCode, parses: true } })
	})
})
