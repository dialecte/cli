/**
 * The temporary tree a `dialecte standard` test runs in: a root of standard folders written by the test, a cache
 * folder, a home folder and a package folder, all under one scratch folder removed when the test ends, and the
 * environment that points the command at them (never the real home, cache or standard). Reads of the cache are
 * here too, so a test pins what the index folder holds without restating where it lives.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

import { temporaryFolder } from './scratch-repository.ts'
import { CACHE_STANDARD_PATH, DECOY_WORD, INDEX_FORMAT } from './standard-workspace.constants.ts'
import { buildSyntheticStandard } from './synthetic-standard.ts'

import { expect, onTestFinished, vi } from 'vitest'

import type { CommandOutput } from '../src/lib/command-output.types.ts'
import type { StandardsDescription, StandardWorkspace } from './standard-workspace.types.ts'

/** A workspace whose root holds `standards`; the folders other than the root exist and are empty. */
export function createStandardWorkspace(
	params: { standards?: StandardsDescription } = {},
): StandardWorkspace {
	const base = temporaryFolder('dialecte-standard-')
	const workspace: StandardWorkspace = {
		base,
		root: join(base, 'standards'),
		cache: join(base, 'cache'),
		cwd: join(base, 'project'),
		home: join(base, 'home'),
		environment: {},
	}
	for (const folder of [workspace.root, workspace.cache, workspace.cwd, workspace.home])
		mkdirSync(folder, { recursive: true })
	writeFileSync(join(workspace.cwd, 'package.json'), JSON.stringify({ name: 'app' }))
	writeStandards({ root: workspace.root, standards: params.standards ?? {} })
	workspace.environment = environmentOf({ workspace })
	stubProcessEnvironment({ base })
	return workspace
}

/**
 * Points the process environment at decoy folders of the scratch tree for the test, so that a command reading
 * `process.env` instead of the `environment` it was given finds nothing and never reaches the real home, cache
 * or standard.
 */
export function stubProcessEnvironment(params: { base: string }): void {
	const decoyRoot = join(params.base, 'decoy-standard')
	writeStandards({
		root: decoyRoot,
		standards: { decoy: { 'one.md': sampleStandardText({ word: DECOY_WORD }) } },
	})
	vi.stubEnv('HOME', join(params.base, 'decoy-home'))
	vi.stubEnv('XDG_CACHE_HOME', join(params.base, 'decoy-cache'))
	vi.stubEnv('DIALECTE_STANDARD', decoyRoot)
	onTestFinished(function restoreEnvironment() {
		vi.unstubAllEnvs()
	})
}

/** The environment that points a command at the workspace's root and cache. */
export function environmentOf(params: {
	workspace: StandardWorkspace
	root?: string
	cache?: string
}): NodeJS.ProcessEnv {
	const { workspace } = params
	return {
		DIALECTE_STANDARD: params.root ?? workspace.root,
		XDG_CACHE_HOME: params.cache ?? workspace.cache,
		HOME: workspace.home,
	}
}

/** Writes each standard folder of `standards` under `root`, with its files. */
export function writeStandards(params: { root: string; standards: StandardsDescription }): void {
	for (const [folder, files] of Object.entries(params.standards)) {
		mkdirSync(join(params.root, folder), { recursive: true })
		for (const [name, text] of Object.entries(files))
			writeTextFile({ path: join(params.root, folder, name), text })
	}
}

/** Writes a file, its folders made first. */
export function writeTextFile(params: { path: string; text: string }): void {
	mkdirSync(dirname(params.path), { recursive: true })
	writeFileSync(params.path, params.text)
}

/** The sentence of the second clause of a sample file; its text is the quote a gold item expects. */
export function sampleValueSentence(word: string): string {
	return `The ${word} value applies.`
}

/** A file of 5 lines: two numbered clauses, `word` in the second one only. */
export function sampleStandardText(params: { word: string }): string {
	return buildSyntheticStandard({
		blocks: [
			{ kind: 'heading', number: '1', title: 'Overview' },
			{ kind: 'raw', lines: ['The base case is described here.'] },
			{ kind: 'blank' },
			{ kind: 'heading', number: '2', title: 'Values' },
			{ kind: 'raw', lines: [sampleValueSentence(params.word)] },
		],
	})
}

/** The number of original lines of a text, a final line break adding none. */
export function lineCountOf(text: string): number {
	return text.endsWith('\n') ? text.split('\n').length - 1 : text.split('\n').length
}

/**
 * Pins the exit code of a command that has not answered yet, inside an `expect`, and hands back its output: a
 * run that throws fails the case on this assertion.
 */
export async function answeredWith(params: {
	run: Promise<CommandOutput>
	exitCode: CommandOutput['exitCode']
}): Promise<CommandOutput> {
	await expect(params.run).resolves.toMatchObject({ exitCode: params.exitCode })
	return params.run
}

/** The folder the index folders of a standard live in, under the workspace's cache. */
export function standardCacheFolder(params: {
	workspace: StandardWorkspace
	standardId: string
}): string {
	return join(params.workspace.cache, ...CACHE_STANDARD_PATH, params.standardId)
}

/** The sorted names a folder holds, none when it does not exist. */
export function entriesOf(folder: string): string[] {
	try {
		return readdirSync(folder).sort()
	} catch {
		return []
	}
}

/** The files under a folder, at their path relative to it, sorted. */
export function filesUnder(folder: string): string[] {
	const found: string[] = []
	for (const entry of readdirSync(folder, { withFileTypes: true })) {
		const path = join(folder, entry.name)
		if (entry.isDirectory()) found.push(...filesUnder(path).map((file) => join(entry.name, file)))
		else found.push(relative(folder, path))
	}
	return found.sort()
}

export function sha256Of(text: string): string {
	return createHash('sha256').update(text).digest('hex')
}

/** The manifest hash of a standard: sha256 of the format number and the (id, sha256) pairs sorted by id. */
export function manifestHashOf(params: { files: Record<string, string> }): string {
	const pairs = Object.entries(params.files)
		.map(([id, text]) => [id, sha256Of(text)])
		.sort(([left], [right]) => (left < right ? -1 : 1))
	return sha256Of(JSON.stringify({ indexFormat: INDEX_FORMAT, files: pairs }))
}

/** The lines of a command's output, trimmed, the empty ones left out. */
export function trimmedLinesOf(output: string): string[] {
	return output
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line !== '')
}
