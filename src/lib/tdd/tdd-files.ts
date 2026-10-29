/**
 * The files `dialecte tdd` reasons about: the hashes a receipt records (a test file; the production files,
 * everything not test code and not generated), the test code of the change since the worktree's base
 * (test files, helpers, fixtures, snapshots) and the ledger in the worktree's git folder.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { gitFolderOf, listRepositoryFiles, readGit } from '../git.ts'
import { readHygieneBaseline } from '../worktree/hygiene.ts'
import { DEFAULT_BASE_BRANCH, LOT_FILE_PATTERN } from '../worktree/worktree.constants.ts'
import {
	GENERATED_FILE_PATTERN,
	LEDGER_VERSION,
	SNAPSHOT_FILE_PATTERN,
	TDD_LEDGER_FILE,
	TEST_FILE_PATTERN,
	TEST_FOLDER_PATTERN,
} from './tdd.constants.ts'

import type { PackageJson } from '../package-json.types.ts'
import type { ChangedTestFile, TddEntry, TddLedger } from './tdd.types.ts'

export function hashFile(path: string): string {
	return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export function hashText(text: string): string {
	return createHash('sha256').update(text).digest('hex')
}

/** sha256 over the production files of the package: each path with the hash of its content, sorted. */
export function hashProduction(params: { root: string; packageJson: PackageJson }): string {
	const hash = createHash('sha256')
	for (const file of listRepositoryFiles({ root: params.root, folder: '.' })) {
		if (!isProductionPath({ file, packageJson: params.packageJson })) continue
		const path = join(params.root, file)
		hash.update(`${file}\0${existsSync(path) ? hashFile(path) : 'deleted'}\n`)
	}
	return hash.digest('hex')
}

/** A test file, a helper or fixture in a test or fixture folder, a snapshot. */
export function isTestCode(file: string): boolean {
	return (
		TEST_FILE_PATTERN.test(file) ||
		TEST_FOLDER_PATTERN.test(file) ||
		SNAPSHOT_FILE_PATTERN.test(file)
	)
}

/** A file of the package that is production: not test code, not generated, not the lot declaration. */
export function isProductionPath(params: { file: string; packageJson: PackageJson }): boolean {
	const { file } = params
	const generated = params.packageJson.dialecte?.generatedDocs ?? []
	return (
		!isTestCode(file) &&
		!GENERATED_FILE_PATTERN.test(file) &&
		!generated.includes(file) &&
		!LOT_FILE_PATTERN.test(file) &&
		!file.startsWith('node_modules/')
	)
}

/** The ledger of the worktree, or why it cannot be read (never a stack trace). */
export function readLedger(root: string): TddLedger | { failure: string } {
	const path = ledgerPath(root)
	if (!existsSync(path)) return { version: LEDGER_VERSION, entries: [] }
	let ledger: TddLedger
	try {
		ledger = JSON.parse(readFileSync(path, 'utf8')) as TddLedger
	} catch {
		return {
			failure: `the receipts in ${path} cannot be read (not JSON); move it aside to start again`,
		}
	}
	if (ledger?.version !== LEDGER_VERSION || !Array.isArray(ledger.entries))
		return {
			failure: `the receipts in ${path} are not of this cli (version ${LEDGER_VERSION} expected); move it aside to start again`,
		}
	return ledger
}

export function appendEntries(params: { root: string; entries: readonly TddEntry[] }): void {
	if (params.entries.length === 0) return
	const ledger = readLedger(params.root)
	const known = 'failure' in ledger ? [] : ledger.entries
	const next: TddLedger = { version: LEDGER_VERSION, entries: [...known, ...params.entries] }
	writeFileSync(ledgerPath(params.root), `${JSON.stringify(next, null, '\t')}\n`)
}

function ledgerPath(root: string): string {
	return join(gitFolderOf(root), TDD_LEDGER_FILE)
}

/**
 * The commit the change is measured from: the HEAD `worktree add` recorded, else where HEAD left the
 * package's base branch, else HEAD.
 */
export function resolveBase(params: { root: string; packageJson: PackageJson }): string {
	const { root } = params
	const recorded = readHygieneBaseline(root)?.head
	if (recorded) return recorded
	const baseBranch = params.packageJson.dialecte?.baseBranch ?? DEFAULT_BASE_BRANCH
	return (
		tryGit({ root, args: ['merge-base', 'HEAD', baseBranch] }) ??
		readGit({ root, args: ['rev-parse', 'HEAD'] })
	).trim()
}

/** Files changed since the base that still exist (new ones included), relative to the root, sorted. */
export function listChangedSince(params: { root: string; base: string }): string[] {
	const { root, base } = params
	const changed = readGit({
		root,
		args: ['diff', '--name-only', '--relative', '--no-renames', '--diff-filter=d', base],
	})
	const untracked = readGit({ root, args: ['ls-files', '--others', '--exclude-standard'] })
	return [...new Set(`${changed}\n${untracked}`.split('\n').filter(Boolean))]
		.filter((file) => existsSync(join(root, file)))
		.sort()
}

/** Every test-code file changed since the base (test files, helpers, fixtures, snapshots) with its hash. */
export function hashChangedTestCode(params: { root: string; base: string }): Map<string, string> {
	return new Map(
		listChangedSince(params)
			.filter(isTestCode)
			.map((file) => [file, hashFile(join(params.root, file))]),
	)
}

/** The test files changed since the base (new ones included, deleted ones left out), with both texts. */
export function listChangedTestFiles(params: { root: string; base: string }): ChangedTestFile[] {
	const { root, base } = params
	return listChangedSince(params)
		.filter((file) => TEST_FILE_PATTERN.test(file))
		.map((file) => ({
			file,
			text: readFileSync(join(root, file), 'utf8'),
			baseText: readAtBase({ root, base, file }),
		}))
}

/** The test files of the base that the change deletes. */
export function listDeletedTestFiles(params: { root: string; base: string }): string[] {
	return readGit({
		root: params.root,
		args: ['diff', '--name-only', '--relative', '--no-renames', '--diff-filter=D', params.base],
	})
		.split('\n')
		.filter((file) => file && TEST_FILE_PATTERN.test(file))
}

/** The file as the base holds it; undefined when the base has no such file. */
export function readAtBase(params: {
	root: string
	base: string
	file: string
}): string | undefined {
	return tryGit({ root: params.root, args: ['show', `${params.base}:./${params.file}`] })
}

/** How many production and test-code files the change touches since the base (deleted ones included). */
export function countChangedFiles(params: {
	root: string
	base: string
	packageJson: PackageJson
}): { production: number; test: number } {
	const changed = readGit({
		root: params.root,
		args: ['diff', '--name-only', '--relative', '--no-renames', params.base],
	})
	const untracked = readGit({
		root: params.root,
		args: ['ls-files', '--others', '--exclude-standard'],
	})
	const files = [...new Set(`${changed}\n${untracked}`.split('\n').filter(Boolean))].filter(
		(file) => !LOT_FILE_PATTERN.test(file),
	)
	const test = files.filter(isTestCode).length
	const production = files.filter((file) =>
		isProductionPath({ file, packageJson: params.packageJson }),
	).length
	return { production, test }
}

/** git's output, or undefined when git fails (a path absent at a commit, no such branch). */
function tryGit(params: { root: string; args: string[] }): string | undefined {
	try {
		return readGit(params)
	} catch {
		return undefined
	}
}
