/**
 * The files `dialecte tdd` reasons about: the hashes a receipt records (a test file by its tokens, so a
 * formatter pass changes nothing; the production files, everything not test code and not generated, by
 * their bytes), the test code of the change since its base (test files, helpers, fixtures, snapshots;
 * a file moved with its bytes is no change) and the ledger in the worktree's git folder.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { gitFolderOf, listRepositoryFiles, readGit, tryReadGit } from '../git.ts'
import { gitBlobIds } from '../handover/committed-bytes.ts'
import { LOT_FILE_PATTERN } from '../worktree/worktree.constants.ts'
import { isPytestTestFile } from './pytest-test-file.ts'
import { listSuiteInfrastructure } from './suite-infrastructure.ts'
import { resolveTddBase } from './tdd-base.ts'
import {
	CONFTEST_FILE_PATTERN,
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
import { changedTestCodeOf, presentTextOf } from './test-code-presence.ts'
import { testCodeTokens } from './test-code-tokens.ts'

import type { PackageJson } from '../package-json.types.ts'
import type { ChangedTestFile, ProductionState, TddEntry, TddLedger } from './tdd.types.ts'
import type { ChangeQuery, TestCodePresence } from './test-code-presence.types.ts'

export function hashFile(path: string): string {
	return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export function hashText(text: string): string {
	return createHash('sha256').update(text).digest('hex')
}

/** sha256 of the test-code file `file` as it is on disk (`hashTestCodeText`): what a receipt of it records. */
export function hashTestCode(params: { root: string; file: string }): string {
	return hashTestCodeText({
		file: params.file,
		text: readFileSync(join(params.root, params.file), 'utf8'),
	})
}

/** sha256 of a test-code file's text: of its tokens for a source file, of its bytes for any other. */
export function hashTestCodeText(params: { file: string; text: string }): string {
	const { text } = params
	return hashText(
		SOURCE_FILE_PATTERN.test(params.file) ? testCodeTokens({ text, file: params.file }) : text,
	)
}

/**
 * sha256 over the production files of the package: each path with the hash of its content, sorted. `files`: the
 * files of the tree, sorted (default: the repository's, tracked and untracked; a tree outside git names its own).
 */
export function hashProduction(params: {
	root: string
	packageJson: PackageJson
	files?: readonly string[]
}): string {
	const hash = createHash('sha256')
	for (const file of params.files ?? listRepositoryFiles({ root: params.root, folder: '.' })) {
		if (!isProductionPath({ root: params.root, file, packageJson: params.packageJson })) continue
		const path = join(params.root, file)
		hash.update(`${file}\0${existsSync(path) ? hashFile(path) : DELETED_PRODUCTION_FILE}\n`)
	}
	return hash.digest('hex')
}

/**
 * A test file of a language tdd runs: a JS/TS test or spec file; a Python file pytest collects from the package
 * (`isPytestTestFile`: its pytest folder's `python_files`, `testpaths` and `norecursedirs`).
 */
export function isTestFile(params: { root: string; file: string }): boolean {
	return TEST_FILE_PATTERN.test(params.file) || isPytestTestFile(params)
}

/**
 * Test code by its path alone: a JS/TS test file, a pytest `conftest.py`, a helper or fixture in a test or fixture
 * folder, a snapshot. A Python file is a test file by its pytest configuration only, which `isPackageTestCode`
 * reads; the rules' unit context asks about JS/TS files alone.
 */
export function isTestCode(file: string): boolean {
	return TEST_FILE_PATTERN.test(file) || isTestSupport(file)
}

/** A pytest `conftest.py`, a file in a test or fixture folder, a snapshot. */
function isTestSupport(file: string): boolean {
	return (
		CONFTEST_FILE_PATTERN.test(file) ||
		TEST_FOLDER_PATTERN.test(file) ||
		SNAPSHOT_FILE_PATTERN.test(file)
	)
}

/**
 * Test code of the package: a test file (`isTestFile`) or test support (`isTestCode`), except under a folder the
 * package declares production (`"dialecte": { "tdd": { "production": ["src/test"] } }`), where only the test
 * files, conftests, fixtures, snapshots and `*.script.ts` are; and except the suite infrastructure (the vitest
 * setup and global setup files and the helpers they import, `listSuiteInfrastructure`): production of the lot that
 * fixes it.
 */
export function isPackageTestCode(params: {
	root: string
	file: string
	packageJson: PackageJson
}): boolean {
	const { file } = params
	if (
		!TEST_FILE_PATTERN.test(file) &&
		isTestSupport(file) &&
		listSuiteInfrastructure({ root: params.root, isTestSupport }).has(file)
	)
		return false
	const declared = productionFolderOf(params)
	if (declared !== undefined)
		return (
			isTestFile(params) ||
			CONFTEST_FILE_PATTERN.test(file) ||
			FIXTURE_FOLDER_PATTERN.test(file.slice(declared.length)) ||
			SNAPSHOT_FILE_PATTERN.test(file) ||
			SCRIPT_FILE_PATTERN.test(file)
		)
	return isTestFile(params) || isTestSupport(file)
}

/** The folder the package declares production (`dialecte.tdd.production`) that holds the file; undefined when none. */
export function productionFolderOf(params: {
	file: string
	packageJson: PackageJson
}): string | undefined {
	// `./src/test`, `src/test/` and `src/test` name the same folder
	return (params.packageJson.dialecte?.tdd?.production ?? [])
		.map((folder) => folder.replace(/^(\.\/)+/, '').replace(/\/+$/, ''))
		.find((folder) => folder !== '' && params.file.startsWith(`${folder}/`))
}

/** A file of the package that is production: not test code, not generated, not the lot declaration. */
export function isProductionPath(params: {
	root: string
	file: string
	packageJson: PackageJson
}): boolean {
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
 * The commit the change is measured from, without where it came from: `resolveTddBase`'s commit (the lot base, or
 * `--base`), or why there is none.
 */
export function resolveBase(params: {
	root: string
	packageJson: PackageJson
	ref?: string
}): string | { failure: string } {
	const base = resolveTddBase(params)
	return 'failure' in base ? base : base.commit
}

/** The presence map of the query: the one given, else one read now. */
function presenceOf(params: ChangeQuery): TestCodePresence {
	return params.presence ?? changedTestCodeOf(params)
}

/** Files changed since the base that still exist (new ones included), relative to the root, sorted. */
export function listChangedSince(params: ChangeQuery): string[] {
	return [...presenceOf(params).paths]
		.filter(([, path]) => path.state !== 'deleted')
		.map(([file]) => file)
}

/**
 * Every test-code file changed since the base (test files, helpers, fixtures, snapshots) with its hash
 * (a source file's by its tokens).
 */
export function hashChangedTestCode(
	params: ChangeQuery & { packageJson: PackageJson },
): Map<string, string> {
	const { root, packageJson } = params
	const presence = presenceOf(params)
	const moved = listMovedFiles({
		...params,
		presence,
		kindOf: function testCodeKind(file) {
			if (!isPackageTestCode({ root, file, packageJson })) return undefined
			return isTestFile({ root, file }) ? TEST_FILE_KIND : TEST_CODE_KIND
		},
	})
	return new Map(
		listChangedSince({ ...params, presence })
			.filter((file) => !moved.has(file) && isPackageTestCode({ root, file, packageJson }))
			.map((file) => [
				file,
				hashTestCodeText({ file, text: presentTextOf({ root, presence, file }) ?? '' }),
			]),
	)
}

/** A test file's kind for a move, in the package at `root`: a test file moves only to a test file. */
function testFileKindIn(root: string): (file: string) => string | undefined {
	return function testFileKind(file) {
		return isTestFile({ root, file }) ? TEST_FILE_KIND : undefined
	}
}

/**
 * The test files changed since the base (new ones included, deleted ones left out), with both texts; a test
 * file moved with its bytes as at the base is no change (`listMovedTestFiles`).
 */
export function listChangedTestFiles(params: ChangeQuery): ChangedTestFile[] {
	const { root, base } = params
	const presence = presenceOf(params)
	const moved = listMovedFiles({ ...params, presence, kindOf: testFileKindIn(root) })
	return listChangedSince({ ...params, presence })
		.filter((file) => isTestFile({ root, file }) && !moved.has(file))
		.map((file) => ({
			file,
			text: presentTextOf({ root, presence, file }) ?? '',
			baseText: readAtBase({ root, base, file }),
		}))
}

/** The test files moved since the base with their bytes (R100): their text is the base text of the old path. */
export function listMovedTestFiles(params: ChangeQuery): ChangedTestFile[] {
	const presence = presenceOf(params)
	return [...listMovedFiles({ ...params, presence, kindOf: testFileKindIn(params.root) }).keys()]
		.sort()
		.map(function movedTestFile(file) {
			const text = presentTextOf({ root: params.root, presence, file }) ?? ''
			return { file, text, baseText: text }
		})
}

/**
 * The test files of the base that the change deletes (a test file moved with its bytes is not deleted), each
 * judged by the package's pytest configuration as it is now.
 */
export function listDeletedTestFiles(params: ChangeQuery): string[] {
	const { root } = params
	const presence = presenceOf(params)
	const sources = new Set(
		listMovedFiles({ ...params, presence, kindOf: testFileKindIn(root) }).values(),
	)
	return listDeletedSince({ ...params, presence }).filter(
		(file) => isTestFile({ root, file }) && !sources.has(file),
	)
}

/**
 * The files moved since the base with their bytes (git's R100), new path → old path: each new file (added or
 * untracked) holding the very bytes a file the change deletes held at the base, each deleted file paired once,
 * and only within one kind (`kindOf`: undefined leaves a file out), so a rename that turns a test file on or
 * off is no move. An empty file holds nothing to move: never paired.
 */
export function listMovedFiles(
	params: ChangeQuery & { kindOf: (file: string) => string | undefined },
): Map<string, string> {
	const { root, base, kindOf } = params
	const presence = presenceOf(params)
	const deleted = listDeletedSince({ ...params, presence }).filter(
		(file) => kindOf(file) !== undefined,
	)
	if (deleted.length === 0) return new Map()
	// a new file, or a rename's new side (git pairs it; a move is judged by its bytes here)
	const added = [...presence.paths]
		.filter(
			([file, path]) =>
				(path.state === 'added' || path.state === 'renamed') &&
				path.text !== '' &&
				kindOf(file) !== undefined,
		)
		.map(([file]) => file)
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

/** The files of the base the change deletes (a rename's old side included), relative to the root, sorted. */
export function listDeletedSince(params: ChangeQuery): string[] {
	return [...presenceOf(params).paths]
		.flatMap(([file, path]) => {
			if (path.state === 'renamed') return [path.from]
			return path.state === 'deleted' && path.atBase ? [file] : []
		})
		.sort()
}

/** The file as the base holds it; undefined when the base has no such file. */
export function readAtBase(params: {
	root: string
	base: string
	file: string
}): string | undefined {
	return tryReadGit({ root: params.root, args: ['show', `${params.base}:./${params.file}`] })
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
	const { root, packageJson } = params
	const test = files.filter((file) => isPackageTestCode({ root, file, packageJson })).length
	const production = files.filter((file) => isProductionPath({ root, file, packageJson })).length
	return { production, test }
}
