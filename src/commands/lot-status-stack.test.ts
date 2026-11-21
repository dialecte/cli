/**
 * The stack line of a lot started on another (33CI CI4, FIX-ci-loop item 3): `lot status` names the parent lot, its
 * pull request and that pull request's state as the host holds it (open, draft, queued, merged, or the host's silence);
 * the hand-over card names the parent and its pull request from files only; a lot not stacked has no such line.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createBriefWorkspace, writeStoreLot } from '../../test/brief-workspace.ts'
import { landingHostOf, changeRequestOf } from '../../test/landing-repository.ts'
import { withLines } from '../../test/lot-start-workspace.ts'
import { git, writeFiles } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { buildStackCardLine } from '../lib/handover/handover-card.ts'
import { writeLanded } from '../lib/landing/landed-record.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BriefWorkspace } from '../../test/brief-workspace.types.ts'
import type { LandingHostAnswers } from '../../test/landing-repository.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const PARENT = '0005-repo-parent'
const CHILD = '0006-repo-child'

/**
 * A parent lot on its own branch `feat/parent` (one commit main does not hold; its pull request #5 recorded when
 * `landed`) and a child lot whose stack.json names it.
 */
function stackedLots(params: { landed: boolean }): {
	workspace: BriefWorkspace
	child: string
	parent: string
	parentTip: string
} {
	const workspace = createBriefWorkspace()
	const root = workspace.repository
	git({ root, args: ['checkout', '-q', '-b', 'feat/parent'] })
	writeFiles({ root, files: { 'src/a/parent.ts': 'export const parent = 1\n' } })
	git({ root, args: ['add', '-A'] })
	git({ root, args: ['commit', '-qm', 'feat(parent): the parent'] })
	const parentTip = git({ root, args: ['rev-parse', 'HEAD'] }).trim()
	git({ root, args: ['checkout', '-q', 'main'] })
	const parent = writeStoreLot({
		workspace,
		name: PARENT,
		scope: ['src/a/'],
		branch: 'feat/parent',
	})
	if (params.landed)
		writeFileSync(
			join(parent, 'landing.json'),
			JSON.stringify({
				schema: 1,
				number: 5,
				url: 'https://host.test/pull/5',
				branch: 'feat/parent',
				head: parentTip,
				at: '',
			}),
		)
	const child = writeStoreLot({ workspace, name: CHILD, scope: ['src/b/'], branch: 'feat/child' })
	writeFileSync(join(child, 'stack.json'), JSON.stringify({ schema: 1, parent: PARENT }))
	return { workspace, child, parent, parentTip }
}

/** `lot status <lot>` with a host answering `answers`: its lines. */
function statusArgumentsOf(params: {
	workspace: BriefWorkspace
	lot: string
	answers: LandingHostAnswers
}) {
	return {
		cwd: params.workspace.repository,
		argv: ['status', params.lot],
		host: landingHostOf(params.answers).host,
	}
}

/** The parent's pull request #5 as the host holds it. */
function parentChangeRequest(params: {
	state: 'open' | 'merged'
	draft?: boolean
	queued?: boolean
}) {
	return { byNumber: { 5: changeRequestOf({ number: 5, head: 'a1', ...params }) } }
}

describe('the stack line', { timeout: STORE_CASE_TIMEOUT }, () => {
	const STATE_ROWS: { title: string; answers: LandingHostAnswers; line: string }[] = [
		{
			title: 'its pull request open',
			answers: parentChangeRequest({ state: 'open' }),
			line: `stack: on ${PARENT} (#5, open)`,
		},
		{
			title: 'its pull request a draft',
			answers: parentChangeRequest({ state: 'open', draft: true }),
			line: `stack: on ${PARENT} (#5, draft)`,
		},
		{
			title: 'its pull request queued',
			answers: parentChangeRequest({ state: 'open', queued: true }),
			line: `stack: on ${PARENT} (#5, queued)`,
		},
		{
			title: 'its pull request merged',
			answers: parentChangeRequest({ state: 'merged' }),
			line: `stack: on ${PARENT} (#5, merged)`,
		},
		{
			title: 'a host that cannot say',
			answers: { refusal: 'gh: offline' },
			line: `stack: on ${PARENT} (#5, the host cannot say: gh: offline)`,
		},
	]
	for (const row of STATE_ROWS)
		it(`lot status of a stacked lot, the parent's pull request: ${row.title} → the stack line names it`, () => {
			const { workspace } = stackedLots({ landed: true })

			expect(
				withLines(runLot(statusArgumentsOf({ workspace, lot: CHILD, answers: row.answers }))).lines,
			).toContain(row.line)
		})

	it('lot status of a stacked lot whose parent holds its landed fact, the host still saying open → the line names it merged (the one landing reader)', () => {
		const { workspace, parent, parentTip } = stackedLots({ landed: true })
		writeLanded({
			lotFolder: parent,
			fact: {
				schema: 1,
				how: 'tree',
				tip: parentTip,
				base: 'main',
				at: '2026-11-17T23:00:00.000Z',
			},
		})

		expect(
			withLines(
				runLot(
					statusArgumentsOf({
						workspace,
						lot: CHILD,
						answers: parentChangeRequest({ state: 'open' }),
					}),
				),
			).lines,
		).toContain(`stack: on ${PARENT} (#5, merged)`)
	})

	it('lot status of a stacked lot whose parent has no pull request yet → the line says so', () => {
		const { workspace } = stackedLots({ landed: false })

		expect(
			withLines(runLot(statusArgumentsOf({ workspace, lot: CHILD, answers: {} }))).lines,
		).toContain(`stack: on ${PARENT} (no pull request yet)`)
	})

	it('lot status of a lot not stacked → no stack line', () => {
		const { workspace } = stackedLots({ landed: true })

		expect(
			withLines(
				runLot(
					statusArgumentsOf({
						workspace,
						lot: PARENT,
						answers: parentChangeRequest({ state: 'open' }),
					}),
				),
			).lines.some((line) => line.startsWith('stack:')),
		).toBe(false)
	})

	it('the hand-over card of a stacked lot → a passed stack line naming the parent and its pull request; none for a lot not stacked', () => {
		const { workspace, child } = stackedLots({ landed: true })

		expect({
			child: buildStackCardLine({ folder: child }),
			parent: buildStackCardLine({ folder: join(workspace.store, PARENT) }),
		}).toEqual({
			child: { name: 'stack', status: 'passed', detail: `on ${PARENT} (#5)` },
			parent: undefined,
		})
	})

	it('lot status of a lot whose stack.json is torn → the stack line says it is damaged', () => {
		const { workspace, child } = stackedLots({ landed: true })
		writeFileSync(join(child, 'stack.json'), '{"schema":1,"parent":')

		expect(
			withLines(runLot(statusArgumentsOf({ workspace, lot: CHILD, answers: {} }))).lines,
		).toContain('stack: damaged (stack.json does not read as a stack record)')
	})

	it('the hand-over card of a lot whose stack.json is torn → a warning stack line naming the damage', () => {
		const { child } = stackedLots({ landed: true })
		writeFileSync(join(child, 'stack.json'), '{"schema":1,"parent":')

		expect(buildStackCardLine({ folder: child })).toEqual({
			name: 'stack',
			status: 'warning',
			detail: 'damaged (stack.json does not read as a stack record)',
		})
	})
})
