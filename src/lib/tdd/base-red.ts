/**
 * The base as round 0: a revised case that passes now is run once more in a throwaway copy of the base's tree
 * with the lot's current test code laid over it; the lot's own tree is never touched.
 */
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'

import { copyBaseTree } from './base-tree.ts'
import { notARed } from './classify-failure.ts'
import { runTestCases } from './run-test-cases.ts'
import { caseLabel, readRunCases } from './select-cases.ts'
import {
	hashProduction,
	isPackageTestCode,
	listChangedSince,
	listDeletedSince,
} from './tdd-files.ts'
import {
	BASE_LACKS_IGNORED_INPUT,
	BASE_RED_FOLDER_PREFIX,
	BASE_RED_OWNER_FILE,
	BASE_RED_TREE_FOLDER,
	DID_NOT_RUN_ON_BASE,
	FAILED_ON_BASE_WITHOUT_ERROR,
	MISSING_INPUT_KINDS,
	NODE_MODULES_FOLDER,
	RED_KINDS,
} from './tdd.constants.ts'

import type { PackageJson } from '../package-json.types.ts'
import type { BaseOverlay, BaseRedVerdict } from './base-red.types.ts'
import type { RunCase, RunnerObserver } from './tdd.types.ts'

/** Which files of the change go over the base's tree: every test-code file, as it is now or gone. */
export function selectBaseOverlay(params: {
	root: string
	packageJson: PackageJson
	changed: readonly string[]
	deleted: readonly string[]
}): BaseOverlay {
	const { root, packageJson } = params
	return {
		write: params.changed.filter((file) => isPackageTestCode({ root, file, packageJson })),
		remove: params.deleted.filter((file) => isPackageTestCode({ root, file, packageJson })),
	}
}

/** Runs the case on the base's production with the lot's current test code, and says what it did there. */
export async function runCaseOnBase(params: {
	root: string
	base: string
	packageJson: PackageJson
	testCase: RunCase
	/** Told of the runner's start and end (a progress step). Default: nobody. */
	observer?: RunnerObserver
}): Promise<BaseRedVerdict> {
	const verdicts = await runCasesOnBase({ ...params, testCases: [params.testCase] })
	return (
		verdicts.get(caseLabel(params.testCase)) ?? { kind: 'refused', reason: DID_NOT_RUN_ON_BASE }
	)
}

/**
 * Runs the cases on the base's production with the lot's current test code, in one copy of the base and one run of
 * their files, and says what each did there, by its label (`caseLabel`).
 */
export async function runCasesOnBase(params: {
	root: string
	base: string
	packageJson: PackageJson
	testCases: readonly RunCase[]
	/** Told of the runner's start and end (a progress step). Default: nobody. */
	observer?: RunnerObserver
}): Promise<Map<string, BaseRedVerdict>> {
	const { root, base, packageJson, testCases } = params
	const verdicts = new Map<string, BaseRedVerdict>()
	if (testCases.length === 0) return verdicts
	/** Every case refused for the same reason. */
	function refuseAll(reason: string): Map<string, BaseRedVerdict> {
		for (const testCase of testCases) verdicts.set(caseLabel(testCase), { kind: 'refused', reason })
		return verdicts
	}
	// in the temporary folder, never inside the lot's tree; owned by this process (a later run trashes it only once
	// that process is gone), removed whatever the run did
	const throwaway = mkdtempSync(join(tmpdir(), BASE_RED_FOLDER_PREFIX))
	writeFileSync(join(throwaway, BASE_RED_OWNER_FILE), String(process.pid))
	const folder = join(throwaway, BASE_RED_TREE_FOLDER)
	mkdirSync(folder)
	try {
		const copied = await copyBaseTree({ root, base, folder })
		if (copied) return refuseAll(copied)
		// the base's production as the base holds it, before any test code is laid over
		const productionHash = hashProduction({
			root: folder,
			packageJson,
			files: listTreeFiles(folder),
		})
		layOverlay({
			root,
			folder,
			overlay: selectBaseOverlay({
				root,
				packageJson,
				changed: listChangedSince({ root, base }),
				deleted: listDeletedSince({ root, base }),
			}),
		})
		const files = [...new Set(testCases.map((testCase) => testCase.file))]
		const modules = await runTestCases({
			root: folder,
			files,
			filter: { names: [...new Set(testCases.map((testCase) => testCase.name))] },
			interpreterRoot: root,
			...(params.observer && { observer: params.observer }),
		})
		if ('failure' in modules) return refuseAll(modules.failure)
		const run = readRunCases({
			root: folder,
			packageJson,
			modules,
			files: files.map((file) => ({
				file,
				text: readFileSync(join(folder, file), 'utf8'),
				baseText: undefined,
			})),
		})
		const unlisted = new Map(run.unlisted.map((file) => [file.file, file.failure]))
		for (const testCase of testCases) {
			const failure = unlisted.get(testCase.file)
			const onBase = run.cases.find(
				(candidate) =>
					candidate.file === testCase.file &&
					candidate.name === testCase.name &&
					candidate.project === testCase.project,
			)
			verdicts.set(
				caseLabel(testCase),
				failure
					? { kind: 'refused', reason: notARed(failure) }
					: verdictOf({ onBase, productionHash }),
			)
		}
		return verdicts
	} finally {
		rmSync(throwaway, { recursive: true, force: true })
	}
}

/**
 * Trashes the base-run folders a killed run left in the temporary folder: those of the prefix older than the
 * running process whose owner (the process id in their owner file) is gone, or that name none. A folder a live
 * process owns is kept, as is every other folder.
 */
export function trashBaseRunLeftovers(): void {
	const temporary = tmpdir()
	const startedAt = Date.now() - process.uptime() * 1000
	for (const name of readdirSync(temporary)) {
		if (!name.startsWith(BASE_RED_FOLDER_PREFIX)) continue
		const folder = join(temporary, name)
		try {
			if (statSync(folder).mtimeMs >= startedAt || isOwnerAlive(folder)) continue
			rmSync(folder, { recursive: true, force: true })
		} catch {
			// gone meanwhile, or not ours to read: left as it is
		}
	}
}

/** The process id the folder's owner file names is a live process. */
function isOwnerAlive(folder: string): boolean {
	const owner = join(folder, BASE_RED_OWNER_FILE)
	if (!existsSync(owner)) return false
	const pid = Number(readFileSync(owner, 'utf8').trim())
	if (!Number.isInteger(pid) || pid <= 0) return false
	try {
		process.kill(pid, 0)
		return true
	} catch (error) {
		// EPERM: the process lives, under another user
		return error instanceof Error && 'code' in error && error.code === 'EPERM'
	}
}

/** What the case did on the base: red for a real reason, passing, or a run that proves nothing. */
function verdictOf(params: {
	onBase: RunCase | undefined
	productionHash: string
}): BaseRedVerdict {
	const { onBase } = params
	if (onBase?.state === 'passed') return { kind: 'passes' }
	if (onBase?.state !== 'failed') return { kind: 'refused', reason: DID_NOT_RUN_ON_BASE }
	if (!onBase.failure) return { kind: 'refused', reason: FAILED_ON_BASE_WITHOUT_ERROR }
	// the copy holds what git tracks: a file it misses is an input git ignores, the environment, not production
	// a thrown error only (never an assertion or a stub's red, whatever its message says), told by its code or name
	if (onBase.failure.missingInput && MISSING_INPUT_KINDS.includes(onBase.failure.kind))
		return { kind: 'refused', reason: BASE_LACKS_IGNORED_INPUT }
	if (!RED_KINDS.includes(onBase.failure.kind))
		return { kind: 'refused', reason: notARed(onBase.failure) }
	return { kind: 'red', failure: onBase.failure, productionHash: params.productionHash }
}

/** Writes the overlay's files into the base copy at their bytes in the lot's tree, and removes those it deletes. */
function layOverlay(params: { root: string; folder: string; overlay: BaseOverlay }): void {
	for (const file of params.overlay.write) {
		const target = join(params.folder, file)
		mkdirSync(dirname(target), { recursive: true })
		copyFileSync(join(params.root, file), target)
	}
	for (const file of params.overlay.remove) rmSync(join(params.folder, file), { force: true })
}

/** The files of the base copy, relative to it and sorted; the `node_modules` link is none of the base's. */
function listTreeFiles(folder: string): string[] {
	return readdirSync(folder, { recursive: true, withFileTypes: true })
		.filter((entry) => !entry.isDirectory())
		.map((entry) => relative(folder, join(entry.parentPath, entry.name)))
		.filter((file) => file !== NODE_MODULES_FOLDER && !file.startsWith(`${NODE_MODULES_FOLDER}/`))
		.sort()
}
