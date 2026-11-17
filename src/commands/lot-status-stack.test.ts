/**
 * The stack line of a lot started on another (33CI CI4): `lot status` and the hand-over card name the parent lot, its
 * pull request and its state, read from files only; a lot not stacked has no such line.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createBriefWorkspace, writeStoreLot } from '../../test/brief-workspace.ts'
import { withLines } from '../../test/lot-start-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { buildStackCardLine } from '../lib/handover/handover-card.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BriefWorkspace } from '../../test/brief-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const PARENT = '0005-repo-parent'
const CHILD = '0006-repo-child'

/** A parent lot (its pull request #5 recorded when `landed`) and a child lot whose stack.json names it. */
function stackedLots(params: { landed: boolean }): { workspace: BriefWorkspace; child: string } {
	const workspace = createBriefWorkspace()
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
				head: 'a1',
				replaced: [],
				at: '',
			}),
		)
	const child = writeStoreLot({ workspace, name: CHILD, scope: ['src/b/'], branch: 'feat/child' })
	writeFileSync(
		join(child, 'stack.json'),
		JSON.stringify({ schema: 1, parent: PARENT, parentHead: 'a1', at: '2026-11-17T23:00:00.000Z' }),
	)
	return { workspace, child }
}

describe('the stack line', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('lot status of a stacked lot whose parent has a pull request → a stack line naming the parent, #5 and its state', () => {
		const { workspace } = stackedLots({ landed: true })

		const status = withLines(runLot({ cwd: workspace.repository, argv: ['status', CHILD] }))

		expect(status.lines).toContain(`stack: on ${PARENT} (#5, working)`)
	})

	it('lot status of a stacked lot whose parent has no pull request yet → the line says so', () => {
		const { workspace } = stackedLots({ landed: false })

		const status = withLines(runLot({ cwd: workspace.repository, argv: ['status', CHILD] }))

		expect(status.lines).toContain(`stack: on ${PARENT} (no pull request yet, working)`)
	})

	it('lot status of a lot not stacked → no stack line', () => {
		const { workspace } = stackedLots({ landed: true })

		const status = withLines(runLot({ cwd: workspace.repository, argv: ['status', PARENT] }))

		expect(status.lines.some((line) => line.startsWith('stack:'))).toBe(false)
	})

	it('the hand-over card of a stacked lot → a passed stack line with the same text; none for a lot not stacked', () => {
		const { workspace, child } = stackedLots({ landed: true })

		expect({
			child: buildStackCardLine({ folder: child }),
			parent: buildStackCardLine({ folder: join(workspace.store, PARENT) }),
		}).toEqual({
			child: { name: 'stack', status: 'passed', detail: `on ${PARENT} (#5, working)` },
			parent: undefined,
		})
	})

	it('lot status of a lot whose stack.json is torn → the stack line says it is damaged', () => {
		const { workspace, child } = stackedLots({ landed: true })
		writeFileSync(join(child, 'stack.json'), '{"schema":1,"parent":')

		const status = withLines(runLot({ cwd: workspace.repository, argv: ['status', CHILD] }))

		expect(status.lines).toContain('stack: damaged (stack.json does not read as a stack record)')
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
