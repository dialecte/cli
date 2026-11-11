import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import {
	createPlanWorkspace,
	linkFolder,
	writeGitFolder,
	writeMainCheckout,
} from '../../../test/plan-facts.ts'
import { writeRecordFile } from '../../../test/store-records.ts'
import { checkPlanRepositories } from './check-plan-block.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PlanBlock, PlanFault } from './plan-block.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

function blockOf(repositories: Record<string, string>): PlanBlock {
	return { schema: 1, repositories, shared: {}, lots: [] }
}

function atsOf(faults: readonly PlanFault[]): string[] {
	return faults.map((fault) => fault.at).sort()
}

function detailsOf(faults: readonly PlanFault[]): string {
	return faults.map((fault) => fault.detail).join('\n')
}

type RepositoryRow = {
	name: string
	/** Makes what the row needs below `root` and gives the block's repositories. */
	setup: (root: string) => Record<string, string>
	at: string[]
}

const REPOSITORY_ROWS: RepositoryRow[] = [
	{
		name: 'a main checkout',
		setup: (root) => ({ cli: writeMainCheckout({ root, name: 'cli' }) }),
		at: [],
	},
	{
		name: 'two main checkouts',
		setup: (root) => ({
			cli: writeMainCheckout({ root, name: 'cli' }),
			core: writeMainCheckout({ root, name: 'core' }),
		}),
		at: [],
	},
	{
		name: 'a folder with no .git',
		setup: (root) => {
			mkdirSync(join(root, 'plain'))
			return { cli: join(root, 'plain') }
		},
		at: ['repositories.cli'],
	},
	{
		name: 'a folder that does not exist',
		setup: (root) => ({ cli: join(root, 'gone') }),
		at: ['repositories.cli'],
	},
	{
		name: 'a linked worktree: .git is a file',
		setup: (root) => {
			writeRecordFile({
				folder: join(root, 'linked'),
				name: '.git',
				text: 'gitdir: /somewhere/.git/worktrees/linked\n',
			})
			return { cli: join(root, 'linked') }
		},
		at: ['repositories.cli'],
	},
	{
		name: 'a .git folder without HEAD',
		setup: (root) => {
			writeGitFolder({ path: join(root, 'half'), head: false })
			return { cli: join(root, 'half') }
		},
		at: ['repositories.cli'],
	},
	{
		name: 'a .git folder without objects/',
		setup: (root) => {
			writeGitFolder({ path: join(root, 'half'), objects: false })
			return { cli: join(root, 'half') }
		},
		at: ['repositories.cli'],
	},
	{
		name: 'a .git folder without refs/',
		setup: (root) => {
			writeGitFolder({ path: join(root, 'half'), refs: false })
			return { cli: join(root, 'half') }
		},
		at: ['repositories.cli'],
	},
	{
		name: 'a missing folder and a plain folder -> both faults',
		setup: (root) => {
			mkdirSync(join(root, 'plain'))
			return { cli: join(root, 'gone'), core: join(root, 'plain') }
		},
		at: ['repositories.cli', 'repositories.core'],
	},
	{
		name: 'a nested checkout with its own .git -> both read on their own',
		setup: (root) => {
			const outer = writeMainCheckout({ root, name: 'outer' })
			return { outer, inner: writeMainCheckout({ root: outer, name: 'inner' }) }
		},
		at: [],
	},
	{
		name: 'a nested folder whose own .git lacks refs/ -> its own fault, not the outer one',
		setup: (root) => {
			const outer = writeMainCheckout({ root, name: 'outer' })
			writeGitFolder({ path: join(outer, 'inner'), refs: false })
			return { outer, inner: join(outer, 'inner') }
		},
		at: ['repositories.inner'],
	},
	{
		name: 'a nested folder with no .git of its own -> a fault (the outer .git is not its)',
		setup: (root) => {
			const outer = writeMainCheckout({ root, name: 'outer' })
			mkdirSync(join(outer, 'inner'))
			return { outer, inner: join(outer, 'inner') }
		},
		at: ['repositories.inner'],
	},
]

describe('checkPlanRepositories: each repository is a git main checkout', () => {
	it.each(REPOSITORY_ROWS)('$name', ({ setup, at }) => {
		const workspace = createPlanWorkspace()
		const repositories = setup(workspace.root)
		expect(atsOf(checkPlanRepositories({ block: blockOf(repositories) }))).toEqual(at)
	})
})

describe('checkPlanRepositories: two names, one common folder', () => {
	it('the same path under two names -> one fault, at the later name', () => {
		const workspace = createPlanWorkspace()
		const cli = writeMainCheckout({ root: workspace.root, name: 'cli' })
		expect(atsOf(checkPlanRepositories({ block: blockOf({ cli, core: cli }) }))).toEqual([
			'repositories.core',
		])
	})

	it('the fault names the first of the two names', () => {
		const workspace = createPlanWorkspace()
		const cli = writeMainCheckout({ root: workspace.root, name: 'cli' })
		expect(detailsOf(checkPlanRepositories({ block: blockOf({ cli, core: cli }) }))).toMatch(/cli/)
	})

	it('a link and its target under two names -> one fault', () => {
		const workspace = createPlanWorkspace()
		const cli = writeMainCheckout({ root: workspace.root, name: 'cli' })
		const link = linkFolder({ target: cli, link: join(workspace.root, 'cli-link') })
		expect(atsOf(checkPlanRepositories({ block: blockOf({ cli, mirror: link }) }))).toEqual([
			'repositories.mirror',
		])
	})
})
