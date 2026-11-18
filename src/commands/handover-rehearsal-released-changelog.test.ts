/**
 * `handover run --rehearse` and released `CHANGELOG.md` sections: the clone's `origin/HEAD` names the lot branch, so
 * the rehearsal hands its contrib run and the hooks of its commits the repository's base branch to judge against.
 */
import { REPOSITORY_CLI_PATH } from '../../test/gate-hook.constants.ts'
import { BRANCH_NAME, SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import {
	createCounter,
	createHookedPackage,
	runFolder,
	writeMergeHandover,
} from '../../test/scratch-checks.ts'
import { createContribPackage } from '../../test/scratch-contrib.ts'
import { git, writeFiles } from '../../test/scratch-repository.ts'
import { SHORT_SHA_LENGTH } from '../lib/gate-records/gate-records.constants.ts'
import { shellQuote } from '../lib/shell-quote.ts'

import { describe, expect, it } from 'vitest'

const BEFORE_RELEASE = `# Changelog

## [Unreleased]

### Added

- main entry.

## [0.9.0] - 2026-01-01

- old.
`

const STACK = `# Changelog

## [Unreleased]

### Added

- main entry.
- stack entry.

## [0.9.0] - 2026-01-01

- old.
`

const MAIN_RELEASE = `# Changelog

## [Unreleased]

## [0.13.2] - 2026-11-10

### Added

- main entry.

## [0.9.0] - 2026-01-01

- old.
`

/**
 * In `root` (on main, holding `BEFORE_RELEASE`): the base branch (origin's default branch, the merged one) releasing 0.13.2
 * from its Unreleased part; main, the hand-over's branch, holding an entry under Unreleased; a hand-over whose one lot
 * merges it (no conflict: the entries fold under 0.13.2). Answers the hand-over folder and the release commit.
 */
function stackMergingTheRelease(root: string): { out: string; release: string } {
	git({ root, args: ['checkout', '-q', '-b', BRANCH_NAME] })
	writeFiles({ root, files: { 'CHANGELOG.md': MAIN_RELEASE } })
	git({ root, args: ['commit', '-q', '-am', 'chore(release): 0.13.2'] })
	const release = git({ root, args: ['rev-parse', 'HEAD'] }).trim()
	git({ root, args: ['checkout', '-q', 'main'] })
	writeFiles({ root, files: { 'CHANGELOG.md': STACK } })
	git({ root, args: ['commit', '-q', '-am', 'feat: a stack entry'] })
	git({ root, args: ['update-ref', `refs/remotes/origin/${BRANCH_NAME}`, release] })
	git({
		root,
		args: ['symbolic-ref', 'refs/remotes/origin/HEAD', `refs/remotes/origin/${BRANCH_NAME}`],
	})
	return { out: writeMergeHandover({ root, tip: release }).out, release }
}

describe(
	'handover run --rehearse: released changelog sections judged against the base branch',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a rehearsal whose merge lot folds entries under a released section → the contrib row fails in the clone with equal expected and actual keys', async () => {
			const root = createContribPackage({ steps: [], files: { 'CHANGELOG.md': BEFORE_RELEASE } })
			const { out } = stackMergingTheRelease(root)

			const run = await runFolder({ out, argv: ['--rehearse'] })

			expect({
				row: run.text.split('\n').filter((line) => /^[!✓✗] rehearsal contrib\b/.test(line)),
				named: run.text.includes(`[0.13.2] differs from ${BRANCH_NAME}: 1 line added`),
			}).toEqual({ row: [expect.stringMatching(/^✗ rehearsal contrib\b/)], named: true })
		})

		it('a lot in the rehearsal changing a released section → its hook in the clone refuses it', async () => {
			const root = createHookedPackage({
				hookCounter: createCounter(),
				gateCounter: createCounter(),
				hookExtra: `node ${shellQuote(REPOSITORY_CLI_PATH)} gate --hook`,
			})
			writeFiles({
				root,
				files: {
					'CHANGELOG.md': BEFORE_RELEASE,
					// the hook's gate runs the scoped rules step alone: what reaches it is what the clone's hook was handed
					'package.json': `${JSON.stringify({
						name: 'demo',
						scripts: {},
						dialecte: { gate: { hook: [{ name: 'rules', run: 'dialecte rules', scoped: true }] } },
					})}\n`,
				},
			})
			git({ root, args: ['commit', '-q', '-am', 'docs: the changelog'] })
			const { out, release } = stackMergingTheRelease(root)

			const run = await runFolder({ out, argv: ['--rehearse'] })

			expect({
				refused: run.exitCode !== 0,
				named: run.text.includes(
					`[0.13.2] differs from ${release.slice(0, SHORT_SHA_LENGTH)}: 1 line added`,
				),
			}).toEqual({ refused: true, named: true })
		})
	},
)
