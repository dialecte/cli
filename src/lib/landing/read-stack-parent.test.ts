/**
 * The one reader of a stacked lot's parent, shared by the tdd base and the pull request's version facts: a lot not
 * stacked has none, a damaged stack record or an unreadable parent is refused, never read as a lot not stacked.
 */
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createBriefWorkspace, writeStoreLot } from '../../../test/brief-workspace.ts'
import { git } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { STACK_FILE, STACK_SCHEMA } from '../store/stack.constants.ts'
import { writeLanded } from './landed-record.ts'
import { STACK_RECORD_DAMAGED } from './lot-landing.constants.ts'
import { readStackParent } from './read-stack-parent.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const PARENT = '0005-repo-parent'
const PARENT_BRANCH = 'feat/parent'
const CHILD = '0006-repo-child'

/** A parent lot on its branch and a child lot, both in the store; `stack` the child's stack.json text, if any. */
function stackedLots(params: { stack?: string }) {
	const workspace = createBriefWorkspace()
	const { repository } = workspace
	const tip = git({ root: repository, args: ['rev-parse', 'HEAD'] }).trim()
	const parentFolder = writeStoreLot({
		workspace,
		name: PARENT,
		scope: ['src/parent.ts'],
		branch: PARENT_BRANCH,
		repository,
	})
	const lotFolder = writeStoreLot({
		workspace,
		name: CHILD,
		scope: ['src/child.ts'],
		branch: 'feat/child',
		repository,
	})
	if (params.stack !== undefined) writeFileSync(join(lotFolder, STACK_FILE), params.stack)
	return { repository, tip, parentFolder, lotFolder }
}

describe('readStackParent', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a lot with no stack.json → not stacked', () => {
		const { repository, lotFolder } = stackedLots({})

		expect(readStackParent({ lotFolder, root: repository })).toBeUndefined()
	})

	it.each([
		{ label: 'torn JSON', stack: '{ torn' },
		{ label: 'no parent', stack: JSON.stringify({ schema: STACK_SCHEMA }) },
		{ label: 'another schema', stack: JSON.stringify({ schema: 99, parent: PARENT }) },
	])(
		'a stack.json holding $label → refused naming the record, never read as not stacked',
		({ stack }) => {
			const { repository, lotFolder } = stackedLots({ stack })

			expect(readStackParent({ lotFolder, root: repository })).toEqual({
				refusal: STACK_RECORD_DAMAGED.replace(
					'{reason}',
					'stack.json does not read as a stack record',
				),
			})
		},
	)

	it('a parent whose identity is gone → refused naming the parent', () => {
		const { repository, parentFolder, lotFolder } = stackedLots({
			stack: JSON.stringify({ schema: STACK_SCHEMA, parent: PARENT }),
		})
		rmSync(join(parentFolder, 'identity.json'), { force: true })

		expect(readStackParent({ lotFolder, root: repository })).toEqual({
			refusal: expect.stringContaining(`the stack parent ${PARENT} cannot be read`),
		})
	})

	it('a parent recorded landed → its branch, merged', () => {
		const { repository, tip, parentFolder, lotFolder } = stackedLots({
			stack: JSON.stringify({ schema: STACK_SCHEMA, parent: PARENT }),
		})
		writeLanded({
			lotFolder: parentFolder,
			fact: { schema: 1, how: 'host', tip, base: 'main', at: '2026-11-17T21:00:00.000Z' },
		})

		expect(readStackParent({ lotFolder, root: repository })).toMatchObject({
			branch: PARENT_BRANCH,
			landing: { kind: 'merged' },
		})
	})
})
