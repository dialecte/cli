/**
 * `dialecte inbox` and the health findings: one line per finding of the last 24 hours before every lot line,
 * `--repository` filters them, `--json` holds them, the exit code keeps its contract.
 */

import { REAL_FINDINGS_NEWEST_FIRST } from '../../test/health-verb.constants.ts'
import { findingKeysOf } from '../../test/health-verb.ts'
import {
	FIXTURE_LINES,
	FRESH_DUPLICATE_LINE,
	FRESH_TIMES,
	IDLE_LINE,
	INBOX_HEALTH_NOW,
	INBOX_HEALTH_WINDOW_SPEC_MS,
	OLD_TIMES,
	STALLED_LINE,
} from '../../test/inbox-health.constants.ts'
import {
	addDuplicateWork,
	addFixture0105,
	addIdleWorktree,
	addReadyLot,
	addStalledLot,
	createHealthInboxWorkspace,
	healthLinesOf,
	healthSummaryOf,
	inboxHealthIn,
	leakedScratchFolder,
	scratchLineOf,
} from '../../test/inbox-health.ts'
import { storePathOf } from '../../test/inbox-workspace.ts'
import { writeStoreListFile } from '../../test/lot-stores.ts'
import { collectFindings } from '../lib/health/collect-findings.ts'
import { readHealthRepository } from '../lib/health/read-health-context.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { HealthFinding } from '../lib/health/health.types.ts'
import type { InboxJson } from './inbox.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe('inbox health lines', () => {
	it('a store holding the real 0105 records and a READY lot, listed in the store list as well as the current folder → each store read once: the three red health lines first (2 duplicate work, 1 landing time), then the lot line; exit 0', () => {
		const target = createHealthInboxWorkspace()
		addFixture0105(target)
		addReadyLot(target)
		writeStoreListFile({ stores: [storePathOf(target.workspace)] })

		const result = inboxHealthIn({ workspace: target })
		const lines = result.output.split('\n')

		expect({ exitCode: result.exitCode, first: lines.slice(0, 3), fourth: lines[3] }).toEqual({
			exitCode: 0,
			first: FIXTURE_LINES,
			fourth: expect.stringMatching(/^0201\s+cli\s/),
		})
	})

	it('a duplicate-work finding of the last 24 hours → its health line', () => {
		const target = createHealthInboxWorkspace()
		addDuplicateWork({ target, times: FRESH_TIMES })

		expect(healthLinesOf(inboxHealthIn({ workspace: target }).output)).toEqual([
			FRESH_DUPLICATE_LINE,
		])
	})

	it('a duplicate-work finding of 2026-11-13 and a lot stalled since 2026-11-14 → only the stalled line', () => {
		const target = createHealthInboxWorkspace()
		addDuplicateWork({ target, times: OLD_TIMES })
		addStalledLot(target)

		expect(healthLinesOf(inboxHealthIn({ workspace: target }).output)).toEqual([STALLED_LINE])
	})

	it('a lot whose gate-full run started and its process is gone → a red stalled run line ending with its resume command; exit 0', () => {
		const target = createHealthInboxWorkspace()
		addStalledLot(target)

		expect(healthSummaryOf(inboxHealthIn({ workspace: target }))).toEqual({
			exitCode: 0,
			lines: [STALLED_LINE],
		})
	})

	it('an idle worktree repository (amber), no lot waiting → a ! health line; exit 1 (amber does not wait)', () => {
		const target = createHealthInboxWorkspace()
		addIdleWorktree(target)

		expect(healthSummaryOf(inboxHealthIn({ workspace: target }))).toEqual({
			exitCode: 1,
			lines: [IDLE_LINE],
		})
	})

	it('a leaked scratch folder in the temporary folder → a ! health line of repository scratch whose next is dialecte health', () => {
		const target = createHealthInboxWorkspace()
		const { tmp, leaked } = leakedScratchFolder()

		expect(healthLinesOf(inboxHealthIn({ workspace: target, tmp }).output)).toEqual([
			scratchLineOf(leaked),
		])
	})

	it('no finding and no lot waiting → no health line and exit 1 (unchanged), in text and in --json (health empty)', () => {
		const target = createHealthInboxWorkspace()
		const json = inboxHealthIn({ workspace: target, words: ['--json'] })

		expect([
			healthSummaryOf(inboxHealthIn({ workspace: target })),
			{ exitCode: json.exitCode, health: JSON.parse(json.output).health },
		]).toEqual([
			{ exitCode: 1, lines: [] },
			{ exitCode: 1, health: [] },
		])
	})

	it('--repository cli → the findings of repository cli stay; --repository other → they are left out and nothing waits (exit 1)', () => {
		const target = createHealthInboxWorkspace()
		addFixture0105(target)
		const { tmp } = leakedScratchFolder()

		expect([
			healthSummaryOf(inboxHealthIn({ workspace: target, words: ['--repository', 'cli'], tmp })),
			healthSummaryOf(inboxHealthIn({ workspace: target, words: ['--repository', 'other'], tmp })),
		]).toEqual([
			{ exitCode: 0, lines: FIXTURE_LINES },
			{ exitCode: 1, lines: [] },
		])
	})
})

describe('inbox --json health', () => {
	it('the real 0105 records → health is the findings the rules give, red first, newest first', () => {
		const target = createHealthInboxWorkspace()
		addFixture0105(target)
		const json: InboxJson = JSON.parse(
			inboxHealthIn({ workspace: target, words: ['--json'] }).output,
		)

		function findingsOfRules(): HealthFinding[] {
			return collectFindings({
				repositories: [readHealthRepository({ common: target.common })],
				scratch: [],
				window: {
					since: new Date(INBOX_HEALTH_NOW.getTime() - INBOX_HEALTH_WINDOW_SPEC_MS),
					now: INBOX_HEALTH_NOW,
				},
				isAlive: () => false,
			})
		}

		expect({
			rules: JSON.parse(JSON.stringify(findingsOfRules())),
			keys: findingKeysOf(findingsOfRules()),
		}).toEqual({ rules: json.health, keys: REAL_FINDINGS_NEWEST_FIRST })
	})

	it('no finding → health is an empty array', () => {
		const target = createHealthInboxWorkspace()

		const json: InboxJson = JSON.parse(
			inboxHealthIn({ workspace: target, words: ['--json'] }).output,
		)

		expect(json.health).toEqual([])
	})
})
