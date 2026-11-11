/**
 * Scratch folders holding fake editors, and the `PATH` built from them. A test builds its `PATH` from these folders
 * alone, never from the host's.
 */
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { shellQuote } from '../src/lib/shell-quote.ts'
import {
	BLOCKING_EDITOR_SCRIPT,
	EXECUTABLE_MODE,
	FAKE_EDITOR_SCRIPT,
	NOT_EXECUTABLE_MODE,
	PID_SUFFIX,
	RECORD_DONE_SUFFIX,
	RECORD_POLL_INTERVAL_MS,
	RECORD_SUFFIX,
	RELEASE_SUFFIX,
} from './editor-workspace.constants.ts'
import { temporaryFolder } from './scratch-repository.ts'

import { onTestFinished } from 'vitest'

import type { BlockingEditor, FakeEditorFolder } from './editor-workspace.types.ts'

/** A new folder holding one executable fake editor per word: started, it records its arguments beside itself. */
export function createFakeEditors(params: { words: readonly string[] }): FakeEditorFolder {
	const folder = temporaryFolder('dialecte-editors-')
	function recordOf(word: string): string {
		return join(folder, `${word}${RECORD_SUFFIX}`)
	}
	for (const word of params.words) {
		const record = recordOf(word)
		const script = FAKE_EDITOR_SCRIPT.replace('{record}', shellQuote(record)).replace(
			'{done}',
			shellQuote(`${record}${RECORD_DONE_SUFFIX}`),
		)
		writeFileSync(join(folder, word), script, { mode: EXECUTABLE_MODE })
		chmodSync(join(folder, word), EXECUTABLE_MODE)
	}
	return { folder, recordOf }
}

/**
 * A new folder holding one fake editor called `word` that records its arguments and its process id, then stays
 * running until `releaseFile` exists. The case releases it when it ends, so no editor outlives its test.
 */
export function createBlockingEditor(params: { word: string }): BlockingEditor {
	const folder = temporaryFolder('dialecte-editors-blocking-')
	const executable = join(folder, params.word)
	const record = join(folder, `${params.word}${RECORD_SUFFIX}`)
	const pidFile = join(folder, `${params.word}${PID_SUFFIX}`)
	const releaseFile = join(folder, `${params.word}${RELEASE_SUFFIX}`)
	const script = BLOCKING_EDITOR_SCRIPT.replace('{record}', shellQuote(record))
		.replace('{pid}', shellQuote(pidFile))
		.replace('{done}', shellQuote(`${record}${RECORD_DONE_SUFFIX}`))
		.replace('{release}', shellQuote(releaseFile))
	writeFileSync(executable, script, { mode: EXECUTABLE_MODE })
	chmodSync(executable, EXECUTABLE_MODE)
	onTestFinished(function releaseEditor() {
		writeFileSync(releaseFile, '')
	})
	return { folder, recordOf: () => record, pidFile, releaseFile, executable }
}

/** Whether the process `pid` is alive. */
export function isRunning(pid: number): boolean {
	try {
		process.kill(pid, 0)
		return true
	} catch {
		return false
	}
}

/** Waits until the process `pid` has ended, polling until `boundMs`, then throws. */
export async function waitForExit(params: { pid: number; boundMs: number }): Promise<void> {
	const deadline = Date.now() + params.boundMs
	while (isRunning(params.pid)) {
		if (Date.now() > deadline)
			throw new Error(`process ${params.pid} still running after ${params.boundMs} ms`)
		await delay(RECORD_POLL_INTERVAL_MS)
	}
}

/** The process id a blocking editor wrote (read once its record is complete). */
export function pidOf(editor: BlockingEditor): number {
	return Number(readFileSync(editor.pidFile, 'utf8'))
}

/** A new folder holding a file called `word` that is not executable. */
export function createNonExecutableFile(params: { word: string }): string {
	const folder = temporaryFolder('dialecte-editors-plain-')
	writeFileSync(join(folder, params.word), '#!/bin/sh\n', { mode: NOT_EXECUTABLE_MODE })
	chmodSync(join(folder, params.word), NOT_EXECUTABLE_MODE)
	return folder
}

/** A new folder holding a folder called `word`. */
export function createFolderNamed(params: { word: string }): string {
	const folder = temporaryFolder('dialecte-editors-folder-')
	mkdirSync(join(folder, params.word))
	return folder
}

/** A new folder holding a `git` that runs the machine's git, so a case can set `PATH` to scratch folders alone. */
export function createGitFolder(): string {
	const folder = temporaryFolder('dialecte-git-bin-')
	const found = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim()
	writeFileSync(join(folder, 'git'), `#!/bin/sh\nexec ${shellQuote(found)} "$@"\n`, {
		mode: EXECUTABLE_MODE,
	})
	chmodSync(join(folder, 'git'), EXECUTABLE_MODE)
	return folder
}

/** The folders joined as a `PATH` value, the first searched first. */
export function searchPathOf(folders: readonly string[]): string {
	return folders.join(delimiter)
}

/**
 * The arguments a started fake editor recorded: polls for the record to be complete until `boundMs`, then throws
 * (a guard against an editor that never started).
 */
export async function waitForRecord(params: {
	record: string
	boundMs: number
}): Promise<string[]> {
	const done = `${params.record}${RECORD_DONE_SUFFIX}`
	const deadline = Date.now() + params.boundMs
	while (!existsSync(done)) {
		if (Date.now() > deadline)
			throw new Error(`no editor recorded ${params.record} within ${params.boundMs} ms`)
		await delay(RECORD_POLL_INTERVAL_MS)
	}
	return readFileSync(params.record, 'utf8').split('\n').filter(Boolean)
}
