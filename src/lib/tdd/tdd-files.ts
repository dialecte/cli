/**
 * The files `dialecte tdd` reasons about: the hashes a receipt records (a test file by its tokens, so a
 * formatter pass changes nothing; the production files, everything not test code and not generated, by
 * their bytes), the test code of the change since its base (test files, helpers, fixtures, snapshots;
 * a file moved with its bytes is no change) and the ledger in the worktree's git folder.
 */
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { gitFolderOf, listRepositoryFiles, readGit } from '../git.ts'
import { gitBlobIds } from '../handover/committed-bytes.ts'
import { readHygieneBaseline } from '../worktree/hygiene.ts'
import { DEFAULT_BASE_BRANCH, LOT_FILE_PATTERN } from '../worktree/worktree.constants.ts'
import {
	DELETED_PRODUCTION_FILE,
	FIXTURE_FOLDER_PATTERN,
	GENERATED_FILE_PATTERN,
	LEDGER_VERSION,
	SCRIPT_FILE_PATTERN,
	SNAPSHOT_FILE_PATTERN,
	SOURCE_FILE_PATTERN,
	TDD_LEDGER_FILE,
	TEST_CODE_KIND,
	TEST_FILE_KIND,
	TEST_FILE_PATTERN,
	TEST_FOLDER_PATTERN,
} from './tdd.constants.ts'
import { testCodeTokens } from './test-code-tokens.ts'

import type { PackageJson } from '../package-json.types.ts'
import type { ChangedTestFile, ProductionState, TddEntry, TddLedger } from './tdd.types.ts'

export function hashFile(path: string): string {
	return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export function hashText(text: string): string {
	return createHash('sha256').update(text).digest('hex')
}

/** sha256 of a test-code file: of its tokens for a source file, of its bytes for any other. */
export function hashTestCode(params: { root: string; file: string }): string {
	const text = readFileSync(join(params.root, params.file), 'utf8')
	return hashText(
		SOURCE_FILE_PATTERN.test(params.file) ? testCodeTokens({ text, file: params.file }) : text,
	)
}

/** sha256 over the production files of the package: each path with the hash of its content, sorted. */
export function hashProduction(params: { root: string; packageJson: PackageJson }): string {
	const hash = createHash('sha256')
	for (const file of listRepositoryFiles({ root: params.root, folder: '.' })) {
		if (!isProductionPath({ file, packageJson: params.packageJson })) continue
		const path = join(params.root, file)
		hash.update(`${file}\0${existsSync(path) ? hashFile(path) : DELETED_PRODUCTION_FILE}\n`)
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

/**
 * Test code of the package: as `isTestCode`, except under a folder the package declares production
 * (`"dialecte": { "tdd": { "production": ["src/test"] } }`), where only the test files, fixtures,
 * snapshots and `*.script.ts` are.
 */
export function isPackageTestCode(params: { file: string; packageJson: PackageJson }): boolean {
	const { file } = params
	// `./src/test`, `src/test/` and `src/test` name the same folder
	const declared = (params.packageJson.dialecte?.tdd?.production ?? [])
		.map((folder) => folder.replace(/^(\.\/)+/, '').replace(/\/+$/, ''))
		.find((folder) => folder !== '' && file.startsWith(`${folder}/`))
	if (declared !== undefined)
		return (
			TEST_FILE_PATTERN.test(file) ||
			FIXTURE_FOLDER_PATTERN.test(file.slice(declared.length)) ||
			SNAPSHOT_FILE_PATTERN.test(file) ||
			SCRIPT_FILE_PATTERN.test(file)
		)
	return isTestCode(file)
}

/** A file of the package that is production: not test code, not generated, not the lot declaration. */
export function isProductionPath(params: { file: string; packageJson: PackageJson }): boolean {
	const { file } = params
	const generated = params.packageJson.dialecte?.generatedDocs ?? []
	return (
		!isPackageTestCode(params) &&
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

/**
 * Adds the entries to the ledger, with the production state they were taken at (`production`: kept under
 * its base beside the states already recorded); nothing written when there is no entry.
 */
export function appendEntries(params: {
	root: string
	entries: readonly TddEntry[]
	production?: ProductionState
}): void {
	if (params.entries.length === 0) return
	const ledger = readLedger(params.root)
	const known: TddLedger = 'failure' in ledger ? { version: LEDGER_VERSION, entries: [] } : ledger
	const { production } = params
	const states = {
		...known.production,
		...(production && {
			[production.base]: {
				...known.production?.[production.base],
				[production.hash]: production.files,
			},
		}),
	}
	const next: TddLedger = {
		version: LEDGER_VERSION,
		entries: [...known.entries, ...params.entries],
		...(Object.keys(states).length && { production: states }),
	}
	writeFileSync(ledgerPath(params.root), `${JSON.stringify(next, null, '\t')}\n`)
}

function ledgerPath(root: string): string {
	return join(gitFolderOf(root), TDD_LEDGER_FILE)
}

/**
 * The commit the change is measured from. By default HEAD: the lot is the uncommitted work, whatever
 * earlier lots the branch holds. `ref` (`--base <ref>`): where HEAD left that ref, the whole-branch view.
 * `wholeBranch` (the gate's `--full`, before a merge): the HEAD `worktree add` recorded, else where HEAD
 * left the package's base branch, else HEAD. Why there is none: a repository without a commit, an
 * unknown ref.
 */
export function resolveBase(params: {
	root: string
	packageJson: PackageJson
	ref?: string
	wholeBranch?: boolean
}): string | { failure: string } {
	const { root } = params
	const head = tryGit({ root, args: ['rev-parse', '--verify', '--quiet', 'HEAD'] })?.trim()
	if (!head)
		return {
			failure: `the repository at ${root} has no commit yet: the lot is measured from HEAD, commit a base first`,
		}
	if (params.ref !== undefined) {
		const base =
			tryGit({ root, args: ['merge-base', 'HEAD', params.ref] }) ??
			tryGit({ root, args: ['rev-parse', '--verify', '--quiet', params.ref] })
		return base ? base.trim() : { failure: `--base ${params.ref}: no such commit` }
	}
	if (!params.wholeBranch) return head
	const recorded = readHygieneBaseline(root)?.head
	if (recorded) return recorded
	const baseBranch = params.packageJson.dialecte?.baseBranch ?? DEFAULT_BASE_BRANCH
	return tryGit({ root, args: ['merge-base', 'HEAD', baseBranch] })?.trim() ?? head
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

/**
 * Every test-code file changed since the base (test files, helpers, fixtures, snapshots) with its hash
 * (a source file's by its tokens).
 */
export function hashChangedTestCode(params: {
	root: string
	base: string
	packageJson: PackageJson
}): Map<string, string> {
	const moved = listMovedFiles({
		...params,
		kindOf: function testCodeKind(file) {
			if (!isPackageTestCode({ file, packageJson: params.packageJson })) return undefined
			return TEST_FILE_PATTERN.test(file) ? TEST_FILE_KIND : TEST_CODE_KIND
		},
	})
	return new Map(
		listChangedSince(params)
			.filter(
				(file) => !moved.has(file) && isPackageTestCode({ file, packageJson: params.packageJson }),
			)
			.map((file) => [file, hashTestCode({ root: params.root, file })]),
	)
}

/** A test file's kind for a move: a test file moves only to a test file. */
function testFileKind(file: string): string | undefined {
	return TEST_FILE_PATTERN.test(file) ? TEST_FILE_KIND : undefined
}

/**
 * The test files changed since the base (new ones included, deleted ones left out), with both texts; a test
 * file moved with its bytes as at the base is no change (`listMovedTestFiles`).
 */
export function listChangedTestFiles(params: { root: string; base: string }): ChangedTestFile[] {
	const { root, base } = params
	const moved = listMovedFiles({ ...params, kindOf: testFileKind })
	return listChangedSince(params)
		.filter((file) => TEST_FILE_PATTERN.test(file) && !moved.has(file))
		.map((file) => ({
			file,
			text: readFileSync(join(root, file), 'utf8'),
			baseText: readAtBase({ root, base, file }),
		}))
}

/** The test files moved since the base with their bytes (R100): their text is the base text of the old path. */
export function listMovedTestFiles(params: { root: string; base: string }): ChangedTestFile[] {
	return [...listMovedFiles({ ...params, kindOf: testFileKind }).keys()]
		.sort()
		.map(function movedTestFile(file) {
			const text = readFileSync(join(params.root, file), 'utf8')
			return { file, text, baseText: text }
		})
}

/** The test files of the base that the change deletes (a test file moved with its bytes is not deleted). */
export function listDeletedTestFiles(params: { root: string; base: string }): string[] {
	const sources = new Set(listMovedFiles({ ...params, kindOf: testFileKind }).values())
	return listDeletedSince(params).filter(
		(file) => TEST_FILE_PATTERN.test(file) && !sources.has(file),
	)
}

/**
 * The files moved since the base with their bytes (git's R100), new path → old path: each new file (added or
 * untracked) holding the very bytes a file the change deletes held at the base, each deleted file paired once,
 * and only within one kind (`kindOf`: undefined leaves a file out), so a rename that turns a test file on or
 * off is no move. An empty file holds nothing to move: never paired.
 */
export function listMovedFiles(params: {
	root: string
	base: string
	kindOf: (file: string) => string | undefined
}): Map<string, string> {
	const { root, base, kindOf } = params
	const deleted = listDeletedSince(params).filter((file) => kindOf(file) !== undefined)
	if (deleted.length === 0) return new Map()
	const committed = readGit({
		root,
		args: ['diff', '--name-only', '--relative', '--no-renames', '--diff-filter=A', base],
	})
	const untracked = readGit({ root, args: ['ls-files', '--others', '--exclude-standard'] })
	const added = [
		...new Set(
			`${committed}\n${untracked}`
				.split('\n')
				.filter(
					(file) =>
						file &&
						kindOf(file) !== undefined &&
						existsSync(join(root, file)) &&
						lstatSync(join(root, file)).size > 0,
				),
		),
	].sort()
	if (added.length === 0) return new Map()
	const baseBlobs = readGit({
		root,
		args: ['rev-parse', ...deleted.map((file) => `${base}:./${file}`)],
	}).split('\n')
	const addedBlobs = gitBlobIds({ root, files: added })
	const sourcesByKey = new Map<string, string[]>()
	deleted.forEach(function index(file, position) {
		const key = `${kindOf(file)}:${baseBlobs[position]}`
		sourcesByKey.set(key, [...(sourcesByKey.get(key) ?? []), file])
	})
	const moves = new Map<string, string>()
	added.forEach(function pair(file, position) {
		const source = sourcesByKey.get(`${kindOf(file)}:${addedBlobs[position]}`)?.shift()
		if (source !== undefined) moves.set(file, source)
	})
	return moves
}

/** The files of the base the change deletes, relative to the root. */
function listDeletedSince(params: { root: string; base: string }): string[] {
	return readGit({
		root: params.root,
		args: ['diff', '--name-only', '--relative', '--no-renames', '--diff-filter=D', params.base],
	})
		.split('\n')
		.filter(Boolean)
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
	const test = files.filter((file) =>
		isPackageTestCode({ file, packageJson: params.packageJson }),
	).length
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
