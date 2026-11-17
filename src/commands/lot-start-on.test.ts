/**
 * `lot start <brief> --on <parent lot>` (33CI CI4): a lot started on another open lot of the same repository. Its
 * branch starts at the parent's branch tip, `stack.json` records the parent only, and the parent's scope is the
 * child's base, never an overlap; every other open lot's still is. A parent that is not open, unknown, or of another
 * repository is refused before anything is written.
 */
import { realpathSync } from 'node:fs'
import { join } from 'node:path'

import { writeStoreLot } from '../../test/brief-workspace.ts'
import { refusalsOf } from '../../test/damaged-lot-workspace.ts'
import {
	addOtherRepository,
	createStartWorkspace,
	entriesOf,
	recordOf,
	withJson,
} from '../../test/lot-start-workspace.ts'
import { OTHER_REPOSITORY } from '../../test/lot-start.constants.ts'
import { git, writeFiles } from '../../test/scratch-repository.ts'
import { transitionOf } from '../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { appendStoreList } from '../lib/store/store-list.ts'
import { STORE_FOLDER } from '../lib/store/store.constants.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BriefWorkspace } from '../../test/brief-workspace.types.ts'
import type { StartWorkspace } from '../../test/lot-start-workspace.types.ts'
import type { Transition } from '../lib/store/store.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const NOW = new Date('2026-11-17T21:00:00.000Z')
/** The open parent lot, its branch, and its scope: it meets the brief's `src/dataflow/`. */
const PARENT = '0005-repo-parent'
const PARENT_BRANCH = 'feat/parent'
const PARENT_SCOPE = ['src/dataflow/subscribe.ts']
/** Another open lot whose scope meets the brief's too. */
const THIRD = '0006-repo-third'
/** The parent's own commit: a file the child's worktree holds once started on it. */
const PARENT_FILE = 'src/dataflow/parent.ts'

/** `lot start <brief> --on <id>` with the extra words, from the workspace; `--json` added. */
function startOn(params: { start: StartWorkspace; on: string; extra?: string[] }) {
	return withJson(
		runLot({
			cwd: params.start.cwd,
			argv: [
				'start',
				params.start.workspace.briefPath,
				'--on',
				params.on,
				...(params.extra ?? []),
				'--json',
			],
			now: NOW,
		}),
	)
}

/** The parent branch made in the repository with one commit of its own (main stays checked out); its tip. */
function parentBranchIn(repository: string): string {
	git({ root: repository, args: ['checkout', '-q', '-b', PARENT_BRANCH] })
	writeFiles({ root: repository, files: { [PARENT_FILE]: 'export const parent = 1\n' } })
	git({ root: repository, args: ['add', PARENT_FILE] })
	git({ root: repository, args: ['commit', '-qm', 'feat(parent): the parent'] })
	const tip = git({ root: repository, args: ['rev-parse', 'HEAD'] }).trim()
	git({ root: repository, args: ['checkout', '-q', 'main'] })
	return tip
}

/** A workspace whose store holds the open parent lot (its branch made, one commit ahead of main); the tip. */
function stackedWorkspace(params: { later?: Transition[]; registry?: 'committed' } = {}): {
	start: StartWorkspace
	tip: string
} {
	const start = createStartWorkspace()
	const tip = parentBranchIn(start.repository)
	writeStoreLot({
		workspace: start.workspace,
		name: PARENT,
		scope: PARENT_SCOPE,
		branch: PARENT_BRANCH,
		repository: start.repository,
		later: params.later,
		registry: params.registry,
	})
	return { start, tip }
}

/** The lot folder the start made: the store's entry that is none of `others`. */
function childFolderOf(params: { start: StartWorkspace; others: string[] }): string {
	const [name] = entriesOf(params.start.store).filter((entry) => !params.others.includes(entry))
	return join(params.start.store, name ?? 'no-started-lot')
}

describe('lot start --on', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('an open parent lot → the child starts at the parent branch tip, stack.json holds the parent only, no parentHead', () => {
		const { start, tip } = stackedWorkspace()

		const started = startOn({ start, on: PARENT })

		expect(started.exitCode).toBe(0)
		const child = childFolderOf({ start, others: [PARENT] })
		const identity = recordOf({ folder: child, name: 'identity.json' }) as {
			worktree: string
			base: { ref: string; commit: string }
		}
		expect({
			stack: recordOf({ folder: child, name: 'stack.json' }),
			base: identity.base,
			head: git({ root: identity.worktree, args: ['rev-parse', 'HEAD'] }).trim(),
		}).toEqual({
			stack: { schema: 1, parent: PARENT },
			base: { ref: PARENT_BRANCH, commit: tip },
			head: tip,
		})
	})

	it("the child's scope meets the parent's scope → not refused as an overlap, no overlap recorded", () => {
		const { start } = stackedWorkspace()

		const started = startOn({ start, on: PARENT })

		expect({
			exitCode: started.exitCode,
			overlaps: entriesOf(childFolderOf({ start, others: [PARENT] })).includes('overlaps.jsonl'),
		}).toEqual({ exitCode: 0, overlaps: false })
	})

	it("the child's scope meets the parent and another open lot → refused for the other lot only, no lot made", () => {
		const { start } = stackedWorkspace()
		writeStoreLot({ workspace: start.workspace, name: THIRD, scope: ['src/dataflow/'] })

		const started = startOn({ start, on: PARENT })

		expect({
			exitCode: started.exitCode,
			details: refusalsOf({ json: started.json }).map((refusal) => refusal.detail.split(':')[0]),
			lots: entriesOf(start.store),
		}).toEqual({
			exitCode: 2,
			details: [`overlap with ${THIRD}`],
			lots: [PARENT, THIRD],
		})
	})

	it.each([
		{
			state: 'committed',
			setup: { registry: 'committed' as const },
		},
		{
			state: 'canceled',
			setup: { later: [transitionOf({ seq: 2, state: 'canceled', kind: 'stop' })] },
		},
		{
			state: 'failed',
			setup: { later: [transitionOf({ seq: 2, state: 'failed', kind: 'fail' })] },
		},
	])('--on a $state parent → refused naming its state, nothing written', ({ state, setup }) => {
		const { start } = stackedWorkspace(setup)

		const started = runLot({
			cwd: start.cwd,
			argv: ['start', start.workspace.briefPath, '--on', PARENT],
			now: NOW,
		})

		expect({ exitCode: started.exitCode, lots: entriesOf(start.store) }).toEqual({
			exitCode: 2,
			lots: [PARENT],
		})
		expect(String(started.output)).toContain(
			`lot start: --on ${PARENT} is ${state}: only a working or ready lot takes a child, nothing written`,
		)
	})

	it('--on an id no store holds → refused as unknown, nothing written', () => {
		const { start } = stackedWorkspace()

		const started = runLot({
			cwd: start.cwd,
			argv: ['start', start.workspace.briefPath, '--on', '0042'],
			now: NOW,
		})

		expect({ exitCode: started.exitCode, lots: entriesOf(start.store) }).toEqual({
			exitCode: 2,
			lots: [PARENT],
		})
		expect(String(started.output)).toContain('lot start: --on 0042 names no lot: nothing written')
	})

	it("--on a lot of another repository's store → refused naming both repositories, nothing written", () => {
		const { start } = stackedWorkspace()
		addOtherRepository(start)
		const other = realpathSync(join(start.workspace.workspace, OTHER_REPOSITORY))
		const otherStore = join(realpathSync(join(other, '.git')), STORE_FOLDER)
		const otherWorkspace: BriefWorkspace = {
			...start.workspace,
			store: otherStore,
			registry: join(realpathSync(join(other, '.git')), 'dialecte-handover'),
		}
		writeStoreLot({
			workspace: otherWorkspace,
			name: '0007-other-elsewhere',
			scope: ['src/elsewhere/'],
			repository: other,
		})
		appendStoreList({ store: otherStore })

		const started = runLot({
			cwd: start.cwd,
			argv: ['start', start.workspace.briefPath, '--on', '0007'],
			now: NOW,
		})

		expect({ exitCode: started.exitCode, lots: entriesOf(start.store) }).toEqual({
			exitCode: 2,
			lots: [PARENT],
		})
		expect(String(started.output)).toContain(
			`lot start: --on 0007 is a lot of ${other}, the brief names ${start.repository}: a stack stays in one repository, nothing written`,
		)
	})
})
