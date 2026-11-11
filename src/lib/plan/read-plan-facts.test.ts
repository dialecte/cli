import { chmodSync, existsSync, mkdirSync, realpathSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import {
	commonOf,
	createPlanWorkspace,
	marksFileOf,
	planEntryOf,
	writeMainCheckout,
	writePlanStoreLot,
	writeRegistryEntry,
	writeWorktreeRecord,
} from '../../../test/plan-facts.ts'
import { transitionOf, writeRecordFile } from '../../../test/store-records.ts'
import { readPlanFacts, specStatusOf } from './read-plan-facts.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Transition } from '../store/store.types.ts'
import type { PlanBlock, PlanEntry } from './plan-block.types.ts'
import type { PlanFacts, PlanMark, WorktreeFact } from './plan.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

type SpecRow = { name: string; text: string | undefined; status: string; line: string | undefined }

const SPEC_ROWS: SpecRow[] = [
	{ name: 'no file', text: undefined, status: 'missing', line: undefined },
	{ name: 'an empty file', text: '', status: 'DRAFT', line: undefined },
	{ name: 'no Status: line', text: '# Title\n\nSome text.\n', status: 'DRAFT', line: undefined },
	{
		name: 'Status: DRAFT rev 2',
		text: '# Title\n\nStatus: DRAFT rev 2\n',
		status: 'DRAFT',
		line: 'Status: DRAFT rev 2',
	},
	{
		name: 'Status: READY rev 3',
		text: '# Title\n\nStatus: READY rev 3, 2026-11-10: Q1-Q11 decided.\n',
		status: 'written',
		line: 'Status: READY rev 3, 2026-11-10: Q1-Q11 decided.',
	},
	{
		name: 'Status: rev 5, ...',
		text: 'Status: rev 5, 2026-11-10, approved\n',
		status: 'written',
		line: 'Status: rev 5, 2026-11-10, approved',
	},
	{
		name: 'Status: APPROVED',
		text: '# T\n\nStatus: APPROVED\n',
		status: 'written',
		line: 'Status: APPROVED',
	},
	{
		name: 'Status: in the middle of a line is no status line',
		text: '# T\n\nSee the Status: line below.\n',
		status: 'DRAFT',
		line: undefined,
	},
	{
		name: 'Status: **DRAFT, waiting on the orchestrator** (emphasis stripped)',
		text: '# T\n\nStatus: **DRAFT, waiting on the orchestrator**\n',
		status: 'DRAFT',
		line: 'Status: **DRAFT, waiting on the orchestrator**',
	},
	{
		name: 'two Status: lines: the first counts',
		text: 'Status: DRAFT rev 1\n\nStatus: READY rev 2\n',
		status: 'DRAFT',
		line: 'Status: DRAFT rev 1',
	},
]

describe('specStatusOf: the loose Status: rule', () => {
	it.each(SPEC_ROWS)('$name -> $status', ({ text, status, line }) => {
		expect(specStatusOf({ text })).toEqual({ status, line })
	})
})

function blockOf(repositories: Record<string, string>, lots: PlanEntry[] = []): PlanBlock {
	return { schema: 1, repositories, shared: {}, lots }
}

/** The names of each repository's store lots; null for one that could not be read. */
function lotNamesOf(facts: PlanFacts): Record<string, string[] | null> {
	return Object.fromEntries(
		Object.entries(facts.repositories).map(([name, repository]) => [
			name,
			repository.readable ? repository.storeLots.map((lot) => lot.name) : null,
		]),
	)
}

type OpenRow = { name: string; later: Transition[]; open: boolean }

const OPEN_ROWS: OpenRow[] = [
	{
		name: 'failed by overlap',
		later: [transitionOf({ seq: 2, state: 'failed', kind: 'overlap' })],
		open: false,
	},
	{
		name: 'canceled',
		later: [transitionOf({ seq: 2, state: 'canceled', kind: 'stop' })],
		open: false,
	},
	{
		name: 'failed for another cause',
		later: [transitionOf({ seq: 2, state: 'failed', kind: 'fail' })],
		open: true,
	},
]

/** The `open` of each store lot of the repository `cli`. */
function openOf(facts: PlanFacts): boolean[] {
	const read = facts.repositories.cli
	return read.readable ? read.storeLots.map((lot) => lot.open) : []
}

/** The worktrees of one repository; none for one that could not be read. */
function worktreesOf(facts: PlanFacts, repository: string): WorktreeFact[] {
	const read = facts.repositories[repository]
	return read.readable ? read.worktrees : []
}

describe('readPlanFacts: a repository read from its common folder', () => {
	it('a repository with nothing in it -> readable, empty lists', () => {
		const workspace = createPlanWorkspace()
		const cli = writeMainCheckout({ root: workspace.root, name: 'cli' })
		expect(readPlanFacts({ block: blockOf({ cli }) }).repositories.cli).toMatchObject({
			readable: true,
			path: cli,
			common: realpathSync(commonOf(cli)),
			caseInsensitive: expect.any(Boolean),
			storeLots: [],
			registry: [],
			worktrees: [],
		})
	})

	it('store lots from dialecte-lots/<name>/: branch, feature, state, open, scope, worktree', () => {
		const workspace = createPlanWorkspace()
		const cli = writeMainCheckout({ root: workspace.root, name: 'cli' })
		const common = commonOf(cli)
		const worktree = join(workspace.root, 'wt', '0001-cli-a')
		writePlanStoreLot({
			root: workspace.root,
			common,
			name: '0001-cli-a',
			scope: ['./src//a/'],
			branch: 'feat/a',
			worktree,
		})
		writePlanStoreLot({
			root: workspace.root,
			common,
			name: '0002-cli-b',
			scope: ['src/b/'],
			registry: 'committed',
		})
		writePlanStoreLot({
			root: workspace.root,
			common,
			name: '0003-cli-sim',
			scope: ['src/c/'],
			simulated: true,
		})
		expect(readPlanFacts({ block: blockOf({ cli }) }).repositories.cli).toMatchObject({
			readable: true,
			storeLots: [
				{
					name: '0001-cli-a',
					branch: 'feat/a',
					feature: 'branch',
					state: 'working',
					open: true,
					scope: ['src/a'],
					worktree,
				},
				{ name: '0002-cli-b', state: 'committed', open: false, scope: ['src/b'] },
				{ name: '0003-cli-sim', open: false, worktree: null },
			],
		})
	})

	it.each(OPEN_ROWS)('a lot $name -> open: $open', ({ later, open }) => {
		const workspace = createPlanWorkspace()
		const cli = writeMainCheckout({ root: workspace.root, name: 'cli' })
		writePlanStoreLot({
			root: workspace.root,
			common: commonOf(cli),
			name: '0001-cli-a',
			scope: ['src/a/'],
			later,
		})
		expect(openOf(readPlanFacts({ block: blockOf({ cli }) }))).toEqual([open])
	})

	it('registry entries from dialecte-handover/*.json, by name', () => {
		const workspace = createPlanWorkspace()
		const cli = writeMainCheckout({ root: workspace.root, name: 'cli' })
		const common = commonOf(cli)
		writeRegistryEntry({
			common,
			name: '2026-11-09-feat-events',
			folder: join(workspace.root, 'h', 'events'),
			branch: 'feat/events',
			state: 'committed',
			written: '2026-11-09T10:00:00.000Z',
			worktree: join(workspace.root, 'wt', '0016'),
		})
		writeRegistryEntry({
			common,
			name: '2026-11-04-feat-handover-show',
			folder: join(workspace.root, 'h', 'show'),
			branch: 'feat/handover-show',
			state: 'pending',
		})
		expect(readPlanFacts({ block: blockOf({ cli }) }).repositories.cli).toMatchObject({
			registry: [
				{
					name: '2026-11-04-feat-handover-show',
					folder: join(workspace.root, 'h', 'show'),
					branch: 'feat/handover-show',
					worktree: '',
					written: '2026-11-04T09:00:00.000Z',
					state: 'pending',
				},
				{
					name: '2026-11-09-feat-events',
					folder: join(workspace.root, 'h', 'events'),
					branch: 'feat/events',
					worktree: join(workspace.root, 'wt', '0016'),
					written: '2026-11-09T10:00:00.000Z',
					state: 'committed',
				},
			],
		})
	})

	it('a registry entry whose folder moved to _trash/ -> its folder as a path string, no throw', () => {
		const workspace = createPlanWorkspace()
		const cli = writeMainCheckout({ root: workspace.root, name: 'cli' })
		const trashed = join(workspace.root, '_trash', 'h', 'L0a1')
		writeRegistryEntry({
			common: commonOf(cli),
			name: '2026-11-09-feat-events',
			folder: trashed,
			branch: 'feat/events',
			state: 'pending',
		})
		expect(readPlanFacts({ block: blockOf({ cli }) }).repositories.cli).toMatchObject({
			registry: [{ folder: trashed, state: 'pending' }],
		})
	})

	it('worktrees from worktrees/<name>/HEAD and gitdir; a detached HEAD has no branch', () => {
		const workspace = createPlanWorkspace()
		const cli = writeMainCheckout({ root: workspace.root, name: 'cli' })
		const common = commonOf(cli)
		const events = join(workspace.root, 'wt', '0016-cli-events')
		const detached = join(workspace.root, 'wt', '0017-cli-detached')
		writeWorktreeRecord({
			common,
			name: '0016-cli-events',
			head: 'ref: refs/heads/feat/events-report-l0',
			worktreeFolder: events,
		})
		writeWorktreeRecord({
			common,
			name: '0017-cli-detached',
			head: 'a'.repeat(40),
			worktreeFolder: detached,
		})
		expect(worktreesOf(readPlanFacts({ block: blockOf({ cli }) }), 'cli')).toEqual([
			{ name: '0016-cli-events', path: events, branch: 'feat/events-report-l0' },
			{ name: '0017-cli-detached', path: detached, branch: undefined },
		])
	})
})

/** Replaces a record file the store wrote read-only (or writes a new one) with `text`. */
function overwriteRecord(params: { folder: string; name: string; text: string }): void {
	const path = join(params.folder, params.name)
	if (existsSync(path)) chmodSync(path, 0o644)
	writeRecordFile(params)
}

describe('readPlanFacts: what does not read is listed damaged, never dropped', () => {
	it('a torn registry entry, a lot with a damaged identity, state or brief, a worktree without gitdir or HEAD', () => {
		const workspace = createPlanWorkspace()
		const cli = writeMainCheckout({ root: workspace.root, name: 'cli' })
		const common = commonOf(cli)
		const realCommon = realpathSync(common)
		function lotFolderOf(name: string): string {
			return join(realCommon, 'dialecte-lots', name)
		}
		writePlanStoreLot({ root: workspace.root, common, name: '0001-cli-sound', scope: ['src/a/'] })
		for (const name of ['0002-cli-identity', '0003-cli-state', '0004-cli-brief'])
			writePlanStoreLot({ root: workspace.root, common, name, scope: ['src/b/'] })
		overwriteRecord({ folder: lotFolderOf('0002-cli-identity'), name: 'identity.json', text: '{' })
		overwriteRecord({
			folder: join(lotFolderOf('0003-cli-state'), 'transitions'),
			name: '000099.json',
			text: '{}',
		})
		overwriteRecord({ folder: lotFolderOf('0004-cli-brief'), name: 'brief.json', text: 'torn' })
		writeRecordFile({ folder: join(common, 'dialecte-handover'), name: 'torn.json', text: '{' })
		const worktrees = join(realCommon, 'worktrees')
		writeRecordFile({ folder: join(worktrees, '0005-cli-no-gitdir'), name: 'HEAD', text: 'x\n' })
		writeRecordFile({
			folder: join(worktrees, '0006-cli-no-head'),
			name: 'gitdir',
			text: `${join(workspace.root, 'wt', '0006', '.git')}\n`,
		})
		const read = readPlanFacts({ block: blockOf({ cli }) }).repositories.cli
		const damaged = read.readable ? (read.damaged ?? []) : []
		expect([...damaged].sort((first, second) => first.name.localeCompare(second.name))).toEqual([
			{
				kind: 'store',
				name: '0002-cli-identity',
				file: join(lotFolderOf('0002-cli-identity'), 'identity.json'),
			},
			{ kind: 'store', name: '0003-cli-state', file: lotFolderOf('0003-cli-state') },
			{
				kind: 'store',
				name: '0004-cli-brief',
				file: join(lotFolderOf('0004-cli-brief'), 'brief.json'),
			},
			{
				kind: 'worktree',
				name: '0005-cli-no-gitdir',
				file: join(worktrees, '0005-cli-no-gitdir', 'gitdir'),
			},
			{
				kind: 'worktree',
				name: '0006-cli-no-head',
				file: join(worktrees, '0006-cli-no-head', 'HEAD'),
			},
			{
				kind: 'registry',
				name: 'torn',
				file: join(realCommon, 'dialecte-handover', 'torn.json'),
			},
		])
	})
})

describe('readPlanFacts: a repository that cannot be read', () => {
	it('a repository whose folder is gone -> readable false with a reason, no throw', () => {
		const workspace = createPlanWorkspace()
		const gone = join(workspace.root, 'gone')
		expect(readPlanFacts({ block: blockOf({ cli: gone }) }).repositories.cli).toEqual({
			readable: false,
			path: gone,
			reason: expect.any(String),
		})
	})

	it('a folder that is no repository -> readable false', () => {
		const workspace = createPlanWorkspace()
		const plain = join(workspace.root, 'plain')
		mkdirSync(plain)
		expect(readPlanFacts({ block: blockOf({ cli: plain }) }).repositories.cli).toEqual({
			readable: false,
			path: plain,
			reason: expect.any(String),
		})
	})

	it('one repository gone does not stop the others from being read', () => {
		const workspace = createPlanWorkspace()
		const core = writeMainCheckout({ root: workspace.root, name: 'core' })
		const gone = join(workspace.root, 'gone')
		expect(readPlanFacts({ block: blockOf({ cli: gone, core }) }).repositories).toMatchObject({
			cli: { readable: false },
			core: { readable: true },
		})
	})
})

describe('readPlanFacts: a nested checkout is read by its own common folder', () => {
	it('a lot of the inner repository is the inner one, never the outer one', () => {
		const workspace = createPlanWorkspace()
		const outer = writeMainCheckout({ root: workspace.root, name: 'outer' })
		const inner = writeMainCheckout({ root: outer, name: 'inner' })
		writePlanStoreLot({
			root: workspace.root,
			common: commonOf(inner),
			name: '0001-inner-x',
			scope: ['src/x/'],
		})
		expect(lotNamesOf(readPlanFacts({ block: blockOf({ outer, inner }) }))).toEqual({
			outer: [],
			inner: ['0001-inner-x'],
		})
	})
})

describe('readPlanFacts: the specs of the entries', () => {
	it('each entry spec by its absolute path: written, missing, DRAFT', () => {
		const workspace = createPlanWorkspace()
		const cli = writeMainCheckout({ root: workspace.root, name: 'cli' })
		const written = writeRecordFile({
			folder: workspace.planFolder,
			name: 'a.md',
			text: '# A\n\nStatus: READY rev 3\n',
		})
		const draft = writeRecordFile({
			folder: workspace.planFolder,
			name: 'c.md',
			text: '# C\n\nStatus: DRAFT\n',
		})
		const missing = join(workspace.planFolder, 'b.md')
		const block = blockOf({ cli }, [
			planEntryOf({ id: 'A', spec: written }),
			planEntryOf({ id: 'B', spec: missing }),
			planEntryOf({ id: 'C', spec: draft }),
			planEntryOf({ id: 'D' }),
		])
		expect(readPlanFacts({ block }).specs).toEqual({
			[written]: { status: 'written', line: 'Status: READY rev 3' },
			[missing]: { status: 'missing', line: undefined },
			[draft]: { status: 'DRAFT', line: 'Status: DRAFT' },
		})
	})
})

describe('readPlanFacts: the briefs of the entries', () => {
	it('each entry brief by its absolute path: whether the file exists', () => {
		const workspace = createPlanWorkspace()
		const cli = writeMainCheckout({ root: workspace.root, name: 'cli' })
		const existing = writeRecordFile({
			folder: workspace.planFolder,
			name: 'brief-a.md',
			text: '# Brief A\n',
		})
		const missing = join(workspace.planFolder, 'brief-b.md')
		const block = blockOf({ cli }, [
			planEntryOf({ id: 'A', brief: existing }),
			planEntryOf({ id: 'B', brief: missing }),
			planEntryOf({ id: 'C' }),
		])
		expect(readPlanFacts({ block }).briefs).toEqual({ [existing]: true, [missing]: false })
	})
})

describe('readPlanFacts: the marks of the plan', () => {
	const MARK: PlanMark = {
		plan: '',
		id: 'K0',
		state: 'done',
		by: 'person-a',
		reason: null,
		at: '2026-11-10T08:00:00.000Z',
	}

	it('the marks of the plan named by planPath, read from the state folder', () => {
		const workspace = createPlanWorkspace()
		const cli = writeMainCheckout({ root: workspace.root, name: 'cli' })
		writeRecordFile({ folder: workspace.planFolder, name: 'plan.md', text: '# plan\n' })
		const mark = { ...MARK, plan: realpathSync(workspace.planPath) }
		const file = marksFileOf({ state: workspace.state, planPath: workspace.planPath })
		writeRecordFile({
			folder: dirname(file),
			name: basename(file),
			text: `${JSON.stringify(mark)}\n`,
		})
		expect(readPlanFacts({ block: blockOf({ cli }), planPath: workspace.planPath }).marks).toEqual([
			mark,
		])
	})

	it('a stateLocation names the state folder the marks are read from', () => {
		const workspace = createPlanWorkspace()
		const cli = writeMainCheckout({ root: workspace.root, name: 'cli' })
		writeRecordFile({ folder: workspace.planFolder, name: 'plan.md', text: '# plan\n' })
		const elsewhere = join(workspace.root, 'elsewhere')
		const mark = { ...MARK, plan: realpathSync(workspace.planPath) }
		const file = marksFileOf({ state: elsewhere, planPath: workspace.planPath })
		writeRecordFile({
			folder: dirname(file),
			name: basename(file),
			text: `${JSON.stringify(mark)}\n`,
		})
		expect(
			readPlanFacts({
				block: blockOf({ cli }),
				planPath: workspace.planPath,
				stateLocation: { environment: { XDG_STATE_HOME: elsewhere } },
			}).marks,
		).toEqual([mark])
	})

	it('no planPath -> no marks', () => {
		const workspace = createPlanWorkspace()
		const cli = writeMainCheckout({ root: workspace.root, name: 'cli' })
		expect(readPlanFacts({ block: blockOf({ cli }) }).marks).toEqual([])
	})
})
