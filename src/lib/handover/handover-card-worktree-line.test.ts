/** The card's worktree line compares real paths: a worktree reads the same reached through a symbolic link or directly. */
import { mkdirSync, realpathSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { handoverCardSections } from './handover-card.ts'
import { HANDOVER_CARD_SECTIONS, WORKTREE_LINE_LABEL } from './handover.constants.ts'

import { describe, expect, it } from 'vitest'

import type { HandoverCard } from './handover.types.ts'

/** The worktree folder's name inside the workspace's worktrees folder. */
const WORKTREE_NAME = '0001-cli-x'

/** A workspace with the main checkout `cli` and a worktree `.worktrees/<name>`, and a link to the workspace beside it. */
function createWorkspace(): { real: string; viaLink: string } {
	const real = realpathSync(temporaryFolder('dialecte-card-workspace-'))
	mkdirSync(join(real, 'cli'))
	mkdirSync(join(real, '.worktrees', WORKTREE_NAME), { recursive: true })
	const viaLink = join(temporaryFolder('dialecte-card-link-'), 'workspace')
	symlinkSync(real, viaLink)
	return { real, viaLink }
}

/** A READY card of the repository `repository` whose worktree is `worktree`. */
function cardOf(params: { repository: string; worktree: string }): HandoverCard {
	return {
		repository: params.repository,
		worktree: params.worktree,
		branch: 'main',
		head: '2d1cce9a4b7e0f3c5d6e7f8091a2b3c4d5e6f708',
		verdict: 'READY',
		failedGates: [],
		otherTreeGates: [],
		declarations: 0,
		profile: 'consumer',
		gates: [{ name: 'check', status: 'passed', detail: '12 passed' }],
		lots: [
			{ index: 1, fileCount: 1, insertions: 3, deletions: 1, subject: 'fix: one', pending: true },
		],
		command: "cd '/work/handover' && bash commit.sh",
	}
}

/** What the card's worktree line says after its label. */
function worktreeLineOf(card: HandoverCard): string | undefined {
	const commit = handoverCardSections(card).sections.find(
		(section) => section.name === HANDOVER_CARD_SECTIONS.commit,
	)
	return commit?.lines
		.map((line) => line.text)
		.find((text) => text.startsWith(WORKTREE_LINE_LABEL))
		?.slice(WORKTREE_LINE_LABEL.length)
}

describe('the worktree line of the card', { timeout: STORE_CASE_TIMEOUT }, () => {
	const RELATIVE = join('.worktrees', WORKTREE_NAME)

	it('the worktree reached through a symbolic link to the workspace, the repository directly → its relative path, as reached directly', () => {
		const { real, viaLink } = createWorkspace()

		const direct = cardOf({ repository: join(real, 'cli'), worktree: join(real, RELATIVE) })
		const linked = cardOf({ repository: join(real, 'cli'), worktree: join(viaLink, RELATIVE) })

		expect([worktreeLineOf(direct), worktreeLineOf(linked)]).toEqual([RELATIVE, RELATIVE])
	})

	it('the repository reached through a symbolic link to the workspace, the worktree directly → its relative path, as reached directly', () => {
		const { real, viaLink } = createWorkspace()

		const direct = cardOf({ repository: join(real, 'cli'), worktree: join(real, RELATIVE) })
		const linked = cardOf({ repository: join(viaLink, 'cli'), worktree: join(real, RELATIVE) })

		expect([worktreeLineOf(direct), worktreeLineOf(linked)]).toEqual([RELATIVE, RELATIVE])
	})
})
