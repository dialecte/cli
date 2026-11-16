/** `dialecte inbox` exit code: only a red finding counts as something waiting; an amber one is printed and does not. */
import {
	addIdleWorktree,
	addStalledLot,
	createHealthInboxWorkspace,
	healthSummaryOf,
	inboxHealthIn,
} from '../../test/inbox-health.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

const AMBER_MARK = '! health'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe('inbox exit code and health findings', () => {
	it('a store whose only finding is an amber idle worktree, no waiting lot → its health line is listed, exit 1', () => {
		const target = createHealthInboxWorkspace()
		addIdleWorktree(target)

		const summary = healthSummaryOf(inboxHealthIn({ workspace: target }))

		expect({
			exitCode: summary.exitCode,
			marks: summary.lines.map((line) => line.slice(0, AMBER_MARK.length)),
		}).toEqual({ exitCode: 1, marks: [AMBER_MARK] })
	})

	it('a red finding (a stalled run), no waiting lot → exit 0', () => {
		const target = createHealthInboxWorkspace()
		addStalledLot(target)

		expect(healthSummaryOf(inboxHealthIn({ workspace: target })).exitCode).toBe(0)
	})
})
