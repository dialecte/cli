/** The install precondition: a check keyed on a tree's lock runs only on a node_modules that installs that lock. */
import { PACKAGES, PACKAGES_A_NEWER, ROOT_FIELDS_A } from '../../../test/lock-key.constants.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { createScratchRepository, git, writeFiles } from '../../../test/scratch-repository.ts'
import { shellQuote } from '../shell-quote.ts'
import { checkInstallMatchesTree } from './tree-install.ts'
import { PACKAGE_LOCK_FILE } from './worktree.constants.ts'

import { describe, expect, it } from 'vitest'

/** A lock of `packages`, as npm writes it. */
function lockOf(packages: object): string {
	return `${JSON.stringify({ ...ROOT_FIELDS_A, packages }, null, 2)}\n`
}

/** `node_modules` holding `a` and `b` at the versions `packages` names. */
function installed(packages: typeof PACKAGES): Record<string, string> {
	return Object.fromEntries(
		Object.entries(packages).map(([key, entry]) => [
			`${key}/package.json`,
			JSON.stringify({ version: entry.version }),
		]),
	)
}

/** A repository committing `lock`, `node_modules` ignored and holding `install`; its HEAD tree. */
function repositoryOf(params: { lock?: string; install: Record<string, string> }): {
	root: string
	tree: string
} {
	const root = createScratchRepository({
		'.gitignore': 'node_modules\n',
		...(params.lock !== undefined && { [PACKAGE_LOCK_FILE]: params.lock }),
	})
	writeFiles({ root, files: params.install })
	return { root, tree: git({ root, args: ['rev-parse', 'HEAD^{tree}'] }).trim() }
}

describe('checkInstallMatchesTree', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('node_modules installs the lock of the tree → no refusal', () => {
		const { root, tree } = repositoryOf({ lock: lockOf(PACKAGES), install: installed(PACKAGES) })

		expect(checkInstallMatchesTree({ root, tree })).toBeUndefined()
	})

	it('a tree with no lock → no refusal', () => {
		const { root, tree } = repositoryOf({ install: installed(PACKAGES) })

		expect(checkInstallMatchesTree({ root, tree })).toBeUndefined()
	})

	it('a package at another version than the tree locks → a refusal naming it and the npm ci to run', () => {
		const { root, tree } = repositoryOf({
			lock: lockOf(PACKAGES_A_NEWER),
			install: installed(PACKAGES),
		})

		const refusal = checkInstallMatchesTree({ root, tree })

		expect(refusal).toContain('a: 1.0.0 installed, lock 1.0.1')
		expect(refusal).toContain(`cd ${shellQuote(root)} && npm ci`)
	})

	it('node_modules installs the lock on disk, the tree holds another → a refusal', () => {
		const { root, tree } = repositoryOf({
			lock: lockOf(PACKAGES_A_NEWER),
			install: { ...installed(PACKAGES), [PACKAGE_LOCK_FILE]: lockOf(PACKAGES) },
		})

		const refusal = checkInstallMatchesTree({ root, tree })

		expect(refusal).toContain('a: 1.0.0 installed, lock 1.0.1')
		expect(refusal).toContain('differs from the one on disk')
		expect(refusal).toContain('put the checked lock on disk')
	})

	it('a tree whose lock is no JSON → a refusal saying it cannot be read', () => {
		const { root, tree } = repositoryOf({ lock: 'lock-1\n', install: installed(PACKAGES) })

		expect(checkInstallMatchesTree({ root, tree })).toContain(
			'the package-lock.json being checked unreadable',
		)
	})
})
