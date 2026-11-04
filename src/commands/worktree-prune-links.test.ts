import { spawnSync } from 'node:child_process'
import {
	existsSync,
	lstatSync,
	mkdirSync,
	readlinkSync,
	realpathSync,
	renameSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { noRepositoryCli } from '../../test/repository-cli-probe.ts'
import {
	git,
	initializeRepository,
	temporaryFolder,
	writeFiles,
} from '../../test/scratch-repository.ts'
import { runHandover, runHandoverList } from './handover.ts'
import { runWorktreeAdd, runWorktreePrune } from './worktree.ts'

import { describe, expect, it } from 'vitest'

/** Scratch repositories, worktrees, hand-overs: seconds on a loaded machine, never a measure of speed. */
const SCRATCH_WORKSPACE_TIMEOUT = 60_000

/** Why prune keeps a link. */
const LINK_REASON = 'a link: prune never removes a link nor what it points to'

/** A workspace holding the repositories `core` and `cli`, each on `main` with one commit. */
function createWorkspace(): { workspace: string; core: string; cli: string } {
	const workspace = temporaryFolder('dialecte-prune-links-')
	const files = { '.gitignore': 'node_modules\n', 'src/index.ts': 'export {}\n' }
	const core = initializeRepository({ root: join(workspace, 'core'), files })
	const cli = initializeRepository({ root: join(workspace, 'cli'), files })
	return { workspace, core, cli }
}

function commitIn(params: { root: string; file: string; message: string }): void {
	writeFiles({ root: params.root, files: { [params.file]: 'export {}\n' } })
	git({ root: params.root, args: ['add', params.file] })
	git({ root: params.root, args: ['commit', '-q', '-m', params.message] })
}

/** `.worktrees/<repository>-<name>` on `feat/<name>`, one commit of its own, merged into main. */
function makeMergedWorktree(params: {
	workspace: string
	repository: string
	name: string
}): string {
	const { workspace, repository, name } = params
	expect(
		runWorktreeAdd({
			argv: [repository, `feat/${name}`],
			cwd: workspace,
			now: new Date(),
			colour: false,
		}).exitCode,
	).toBe(0)
	const worktree = join(workspace, '.worktrees', `${repository.split('/').at(-1)}-${name}`)
	commitIn({ root: worktree, file: `src/${name}.ts`, message: `feat: ${name}` })
	git({ root: repository, args: ['merge', '-q', '--ff-only', `feat/${name}`] })
	return worktree
}

/** A hand-over written in `folder` for a lot of a worktree of `repository`, its lot then committed. */
function makeCommittedHandover(params: {
	workspace: string
	repository: string
	folder: string
	name: string
}): void {
	const { workspace, repository, name } = params
	expect(
		runWorktreeAdd({
			argv: [repository, `feat/${name}`],
			cwd: workspace,
			now: new Date(),
			colour: false,
		}).exitCode,
	).toBe(0)
	const worktree = join(workspace, '.worktrees', `${repository.split('/').at(-1)}-${name}`)
	writeFiles({ root: worktree, files: { 'CHANGELOG.md': '# Changelog\n' } })
	mkdirSync(params.folder, { recursive: true })
	writeFileSync(
		join(params.folder, 'lots.json'),
		JSON.stringify({
			repository: worktree,
			branch: `feat/${name}`,
			head: git({ root: worktree, args: ['rev-parse', 'HEAD'] }).trim(),
			lots: [{ paths: ['CHANGELOG.md'], message: `docs(changelog): ${name}` }],
		}),
	)
	expect(
		runHandover({
			argv: [join(params.folder, 'lots.json')],
			cliPath: '/opt/cli.js',
			probe: noRepositoryCli,
		}).exitCode,
	).toBe(0)
	git({ root: worktree, args: ['add', 'CHANGELOG.md'] })
	git({ root: worktree, args: ['commit', '-q', '-m', `docs(changelog): ${name}`] })
}

/** A pid no process holds any more: a child that already exited. */
function deadPid(): number {
	return spawnSync('true').pid
}

/** A rehearsal clone in `folder` whose marker names a process that is gone. */
function makeDeadRehearsalClone(folder: string): string {
	mkdirSync(join(folder, '.git'), { recursive: true })
	writeFileSync(
		join(folder, '.git', 'dialecte-rehearsal.json'),
		JSON.stringify({ pid: deadPid(), startedAt: '2026-10-29T10:00:00.000Z' }),
	)
	return folder
}

function prune(params: { workspace: string; scratchRoot: string }) {
	return runWorktreePrune({
		argv: ['--root', params.workspace],
		cwd: params.workspace,
		scratchRoot: params.scratchRoot,
		isTerminal: false,
		confirm: async () => true,
	})
}

/** A plan line keeping `name` (a worktree, a hand-over) whose reason ends with `reasonEnd`, whatever prefix it carries. */
function keptLinePattern(params: { kind: string; name: string; reasonEnd?: string }): RegExp {
	return new RegExp(
		`^  keep    ${params.kind}  ${escapeRegExp(params.name)}  \\(.*${escapeRegExp(params.reasonEnd ?? '')}\\)$`,
	)
}

describe(
	'worktree prune never touches a link nor what a link points to',
	{ timeout: SCRATCH_WORKSPACE_TIMEOUT },
	() => {
		it('a rehearsal clone entry that is a link to a dead clone → kept as a link, no removal command', async () => {
			const { workspace } = createWorkspace()
			const scratchRoot = temporaryFolder('dialecte-scratch-root-')
			const clone = makeDeadRehearsalClone(join(temporaryFolder('dialecte-elsewhere-'), 'clone'))
			const link = join(scratchRoot, 'dialecte-rehearse-linked')
			symlinkSync(clone, link)

			const result = await prune({ workspace, scratchRoot })

			expect(result.output.split('\n')).toContain(`  keep    ${link}  (${LINK_REASON})`)
			expect(result.output).not.toContain("rm -rf 'dialecte-rehearse-linked'")
		})

		it('a committed hand-over folder that is a link → kept as a link, no removal command', async () => {
			const { workspace, core } = createWorkspace()
			const real = join(temporaryFolder('dialecte-elsewhere-'), 'real-topic')
			makeCommittedHandover({ workspace, repository: core, folder: real, name: 'topic' })
			const link = join(workspace, '_commit-plan', 'linked-topic')
			mkdirSync(join(workspace, '_commit-plan'))
			symlinkSync(real, link)

			const result = await prune({
				workspace,
				scratchRoot: temporaryFolder('dialecte-scratch-root-'),
			})

			expect(result.output.split('\n')).toContain(`  keep    hand-over  ${link}  (${LINK_REASON})`)
			expect(result.output).not.toContain('rm -rf')
		})

		for (const place of ['workspace', '.worktrees', '_commit-plan', 'scratch folder'])
			it(`a merged clean worktree a link in the ${place} points to → kept, naming the link`, async () => {
				const { workspace, core } = createWorkspace()
				const scratchRoot = temporaryFolder('dialecte-scratch-root-')
				const merged = makeMergedWorktree({ workspace, repository: core, name: 'merged' })
				const folder = {
					workspace,
					'.worktrees': join(workspace, '.worktrees'),
					'_commit-plan': join(workspace, '_commit-plan'),
					'scratch folder': scratchRoot,
				}[place] as string
				mkdirSync(folder, { recursive: true })
				const link = join(folder, 'alias')
				symlinkSync(merged, link)

				const result = await prune({ workspace, scratchRoot })

				expect(result.output.split('\n')).toContainEqual(
					expect.stringMatching(
						keptLinePattern({
							kind: 'worktree',
							name: merged,
							reasonEnd: `the link ${link} points to it`,
						}),
					),
				)
				expect(result.output).not.toContain(`git worktree remove '${merged}'`)
			})

		it('a committed hand-over folder a link points to → kept, naming the link', async () => {
			const { workspace, core } = createWorkspace()
			const real = join(workspace, '_commit-plan', 'real-topic')
			makeCommittedHandover({ workspace, repository: core, folder: real, name: 'topic' })
			const link = join(workspace, 'topic-alias')
			symlinkSync(real, link)

			const result = await prune({
				workspace,
				scratchRoot: temporaryFolder('dialecte-scratch-root-'),
			})

			expect(result.output.split('\n')).toContain(
				`  keep    hand-over  ${real}  (the link ${link} points to it)`,
			)
			expect(result.output).not.toContain("rm -rf 'real-topic'")
		})

		it('a worktree whose path is now a dangling link → kept, never git worktree prune; a confirmed --yes leaves the link', async () => {
			const { workspace, core } = createWorkspace()
			expect(
				runWorktreeAdd({
					argv: [core, 'feat/gone'],
					cwd: workspace,
					now: new Date(),
					colour: false,
				}).exitCode,
			).toBe(0)
			const worktree = join(workspace, '.worktrees', 'core-gone')
			rmSync(worktree, { recursive: true, force: true })
			symlinkSync(join(workspace, 'nowhere'), worktree)

			const result = await prune({
				workspace,
				scratchRoot: temporaryFolder('dialecte-scratch-root-'),
			})

			expect(result.output.split('\n')).toContainEqual(
				expect.stringMatching(keptLinePattern({ kind: 'worktree', name: worktree })),
			)
			expect(result.output).not.toContain('git worktree prune')

			const confirmed = await runWorktreePrune({
				argv: ['--root', workspace, '--yes'],
				cwd: workspace,
				scratchRoot: temporaryFolder('dialecte-scratch-root-'),
				isTerminal: true,
				confirm: async () => true,
			})
			expect(confirmed.output).not.toContain('git worktree prune')
			expect(lstatSync(worktree).isSymbolicLink()).toBe(true)
		})

		it('--yes confirmed beside the sibling link .worktrees/core and a linked clone → the merged worktrees go; the links and their targets stay, in no item', async () => {
			const { workspace, core, cli } = createWorkspace()
			const scratchRoot = temporaryFolder('dialecte-scratch-root-')
			const mergedCore = makeMergedWorktree({ workspace, repository: core, name: 'merged' })
			const mergedCli = makeMergedWorktree({ workspace, repository: cli, name: 'merged' })
			const sibling = join(workspace, '.worktrees', 'core')
			symlinkSync('../core', sibling)
			const clone = makeDeadRehearsalClone(join(temporaryFolder('dialecte-elsewhere-'), 'clone'))
			const cloneLink = join(scratchRoot, 'dialecte-rehearse-linked')
			symlinkSync(clone, cloneLink)
			const questions: string[] = []

			const result = await runWorktreePrune({
				argv: ['--root', workspace, '--yes'],
				cwd: workspace,
				scratchRoot,
				isTerminal: true,
				confirm: async (question) => {
					questions.push(question)
					return true
				},
			})

			expect(result.exitCode).toBe(0)
			expect(questions).toEqual(['Remove these 4 item(s)? [y/N] '])
			expect(
				result.output
					.split('\n')
					.filter((line) => line.includes(`${sibling}  `) || line.endsWith(sibling)),
			).toEqual([])
			expect([existsSync(mergedCore), existsSync(mergedCli)]).toEqual([false, false])
			expect(readlinkSync(sibling)).toBe('../core')
			expect(existsSync(join(core, '.git'))).toBe(true)
			expect(lstatSync(cloneLink).isSymbolicLink()).toBe(true)
			expect(existsSync(join(clone, '.git', 'dialecte-rehearsal.json'))).toBe(true)
		})

		for (const linked of [
			{ name: 'dangling', target: (workspace: string) => join(workspace, 'nowhere') },
			{ name: 'to a folder', target: () => temporaryFolder('dialecte-elsewhere-') },
		])
			it(`a worktree whose path is a link (${linked.name}) beside a worktree deleted from disk → no git worktree prune offered, the deleted one kept naming the link; a confirmed --yes leaves the link registered`, async () => {
				const { workspace, core } = createWorkspace()
				for (const name of ['deleted', 'linked'])
					expect(
						runWorktreeAdd({
							argv: [core, `feat/${name}`],
							cwd: workspace,
							now: new Date(),
							colour: false,
						}).exitCode,
					).toBe(0)
				const deleted = join(workspace, '.worktrees', 'core-deleted')
				const linkedWorktree = join(workspace, '.worktrees', 'core-linked')
				rmSync(deleted, { recursive: true, force: true })
				rmSync(linkedWorktree, { recursive: true, force: true })
				symlinkSync(linked.target(workspace), linkedWorktree)
				const scratchRoot = temporaryFolder('dialecte-scratch-root-')

				const plan = await prune({ workspace, scratchRoot })
				const confirmed = await runWorktreePrune({
					argv: ['--root', workspace, '--yes'],
					cwd: workspace,
					scratchRoot,
					isTerminal: true,
					confirm: async () => true,
				})

				expect(plan.output).not.toContain('git worktree prune')
				expect(plan.output.split('\n')).toContainEqual(
					expect.stringMatching(
						new RegExp(
							`^  keep    worktree  ${escapeRegExp(deleted)}  \\(.*${escapeRegExp(linkedWorktree)}.*\\)$`,
						),
					),
				)
				expect(confirmed.output).not.toContain('git worktree prune')
				expect(git({ root: core, args: ['worktree', 'list', '--porcelain'] })).toMatch(
					/^worktree .*\/\.worktrees\/core-linked$/m,
				)
			})

		it('a worktree deleted from disk beside a registered worktree that is a link to its live checkout (holding .git) → git worktree prune offered for the deleted one', async () => {
			const { workspace, core } = createWorkspace()
			for (const name of ['deleted', 'moved'])
				expect(
					runWorktreeAdd({
						argv: [core, `feat/${name}`],
						cwd: workspace,
						now: new Date(),
						colour: false,
					}).exitCode,
				).toBe(0)
			const deleted = join(workspace, '.worktrees', 'core-deleted')
			const moved = join(workspace, '.worktrees', 'core-moved')
			const checkout = join(temporaryFolder('dialecte-elsewhere-'), 'core-moved')
			rmSync(deleted, { recursive: true, force: true })
			renameSync(moved, checkout)
			symlinkSync(checkout, moved)

			const result = await prune({
				workspace,
				scratchRoot: temporaryFolder('dialecte-scratch-root-'),
			})

			expect(result.output.split('\n')).toContain(`cd '${core}' && git worktree prune`)
			expect(
				result.output
					.split('\n')
					.filter((line) => line.startsWith(`  keep    worktree  ${deleted}  `)),
			).toEqual([])
		})

		it('a committed hand-over reached through a linked folder deeper under _commit-plan → kept as a link, never rm -rf', async () => {
			const { workspace, core } = createWorkspace()
			const group = join(temporaryFolder('dialecte-elsewhere-'), 'group')
			makeCommittedHandover({
				workspace,
				repository: core,
				folder: join(group, 'topic'),
				name: 'topic',
			})
			const plans = join(workspace, '_commit-plan')
			mkdirSync(plans)
			symlinkSync(group, join(plans, 'linked-group'))

			const result = await prune({
				workspace,
				scratchRoot: temporaryFolder('dialecte-scratch-root-'),
			})

			expect(result.output.split('\n')).toContain(
				`  keep    hand-over  ${join(plans, 'linked-group', 'topic')}  (${LINK_REASON})`,
			)
			expect(result.output).not.toContain('rm -rf')
		})

		it('handover list → a hand-over folder reached by its path and by a link listed once', () => {
			const { workspace, core } = createWorkspace()
			const plans = join(workspace, '_commit-plan')
			const real = join(plans, 'real-topic')
			makeCommittedHandover({ workspace, repository: core, folder: real, name: 'topic' })
			symlinkSync(real, join(plans, 'alias-topic'))

			const listings = JSON.parse(
				runHandoverList({ argv: ['--root', plans, '--json'], cwd: workspace, now: Date.now() })
					.output,
			) as { folder: string }[]

			expect(listings.map((listing) => realpathSync(listing.folder))).toEqual([realpathSync(real)])
		})
	},
)

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
