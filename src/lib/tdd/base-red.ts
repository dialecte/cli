/**
 * The base as round 0: a revised case that passes now is run once more in a throwaway copy of the base's tree
 * with the lot's current test code laid over it; the lot's own tree is never touched.
 */
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'

import { copyBaseTree } from './base-tree.ts'
import { notARed } from './classify-failure.ts'
import { runTestCases } from './run-test-cases.ts'
import { readRunCases } from './select-cases.ts'
import {
	hashProduction,
	isPackageTestCode,
	listChangedSince,
	listDeletedSince,
} from './tdd-files.ts'
import {
	BASE_RED_FOLDER_PREFIX,
	DID_NOT_RUN_ON_BASE,
	FAILED_ON_BASE_WITHOUT_ERROR,
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
	const { root, base, packageJson, testCase } = params
	// in the temporary folder, never inside the lot's tree; removed whatever the run did
	const folder = mkdtempSync(join(tmpdir(), BASE_RED_FOLDER_PREFIX))
	try {
		const copied = await copyBaseTree({ root, base, folder })
		if (copied) return { kind: 'refused', reason: copied }
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
		const modules = await runTestCases({
			root: folder,
			files: [testCase.file],
			filter: { names: [testCase.name] },
			...(params.observer && { observer: params.observer }),
		})
		if ('failure' in modules) return { kind: 'refused', reason: modules.failure }
		const text = readFileSync(join(folder, testCase.file), 'utf8')
		const run = readRunCases({
			root: folder,
			packageJson,
			modules,
			files: [{ file: testCase.file, text, baseText: undefined }],
		})
		const [unlisted] = run.unlisted
		if (unlisted) return { kind: 'refused', reason: notARed(unlisted.failure) }
		const onBase = run.cases.find(
			(candidate) => candidate.name === testCase.name && candidate.project === testCase.project,
		)
		return verdictOf({ onBase, productionHash })
	} finally {
		rmSync(folder, { recursive: true, force: true })
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
