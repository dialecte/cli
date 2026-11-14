/**
 * Before a commit that stages a change of `package-lock.json`: `node_modules` must hold every package at
 * the version of the staged lock, or the commit's hook tests the wrong dependencies. When they differ the
 * staged lock and `package.json` are written over the working copies, the installer runs (`npm ci`, stdin
 * closed, watched), and the working copies are put back byte for byte; the installer must leave the
 * staged files as they were, and `node_modules` must then match (dev, peer and optional packages an
 * install leaves out aside).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { firstLineOf } from '../error-reason.ts'
import { readGit, readStagedFile } from '../git.ts'
import { formatDuration } from '../progress/format-duration.ts'
import { onSignalExit } from '../progress/interrupt-forwarding.ts'
import { runChild } from '../progress/run-child.ts'
import {
	ABSENT_SUFFIX,
	INSTALL_BACKUP_FOLDER,
	INSTALL_COMMAND,
	OPTIONAL_LOCK_FLAGS,
	PACKAGE_LOCK_FILE,
	NODE_MODULES_SEGMENT,
	PACKAGE_MANIFEST_FILE,
	SKIPPED_INSTALL_SCRIPTS_NOTE,
	SKIPPED_SCRIPTS_NAMED,
	STAGED_SUFFIX,
} from './handover.constants.ts'
import {
	INDEX_FILE_PARSE_REFUSAL,
	INDEX_FILE_UNREADABLE_REFUSAL,
	INSTALL_REFUSAL_EXIT_CODE,
} from './install-guard.constants.ts'

import type { Clock } from '../progress/clock.types.ts'
import type { InstallFile, Installer, StagedLockEntry } from './handover.types.ts'

/**
 * Nothing to do, done (with a note), or why the commit must not go on; a staged lock or manifest git cannot read, or
 * a staged lock that does not parse, carries the install guard's exit code (2).
 */
export async function syncNodeModules(params: {
	root: string
	clock: Clock
	install?: Installer
}): Promise<{ note?: string } | { refusal: string; exitCode?: number }> {
	const { root, clock } = params
	const lockChanged =
		spawnSync('git', ['diff', '--cached', '--quiet', '--', PACKAGE_LOCK_FILE], { cwd: root })
			.status === 1
	if (!lockChanged) return {}
	let packages: Array<[string, StagedLockEntry]>
	try {
		packages = readStagedLockPackages(root)
	} catch (error) {
		// never a throw after `git add`: the lot is refused and undone
		return { refusal: messageOf(error), exitCode: INSTALL_REFUSAL_EXIT_CODE }
	}
	const before = nodeModulesAgainstStagedLock({ root, packages })
	if (before.length === 0) return {}
	const startedAt = clock.now()
	// the install sees the staged lock and manifest, not a later lot's working copies
	let files: InstallFile[]
	try {
		files = readInstallFiles(root)
	} catch (error) {
		// a file the index holds but git cannot read: never installed as if it were absent
		return { refusal: messageOf(error), exitCode: INSTALL_REFUSAL_EXIT_CODE }
	}
	const refusal = await installStagedFiles({ root, files, install: params.install })
	if (refusal !== undefined) return { refusal }
	const after = nodeModulesAgainstStagedLock({ root, packages })
	if (after.length)
		return { refusal: `node_modules still differ from the staged lock: ${shortList(after)}` }
	return {
		note: `node_modules brought to the staged lock (${shortList(before)}) in ${formatDuration(clock.now() - startedAt)}${skippedScriptsNote({ root, packages })}`,
	}
}

/**
 * The staged lock and manifest written over the working copies (the working bytes saved first in the git folder),
 * the installer run, the working copies put back byte for byte, on an interrupt too. The refusal when the install
 * failed or changed the staged files; undefined when it ran clean.
 */
async function installStagedFiles(params: {
	root: string
	files: readonly InstallFile[]
	install?: Installer
}): Promise<string | undefined> {
	const { root } = params
	const overwritten = params.files.filter((entry) => entry.staged !== undefined)
	// the working bytes saved first: a signal or a crash during the install cannot lose them
	const backup = installBackupPath(root)
	mkdirSync(backup, { recursive: true })
	for (const { file, working, staged } of overwritten) {
		if (working === undefined) writeFileSync(join(backup, `${file}${ABSENT_SUFFIX}`), '')
		else writeFileSync(join(backup, file), working)
		writeFileSync(join(backup, `${file}${STAGED_SUFFIX}`), staged ?? '')
	}
	function restore(): void {
		for (const { path, working } of overwritten)
			if (working === undefined) rmSync(path, { force: true })
			else writeFileSync(path, working)
		rmSync(backup, { recursive: true, force: true })
	}
	const removeSignalHook = onSignalExit(restore)
	let changed: string | undefined
	try {
		for (const { path, staged } of overwritten) if (staged) writeFileSync(path, staged)
		const install = params.install ?? installWithNpm
		const installed = await install({ root })
		if (installed.exitCode !== 0)
			return `${INSTALL_COMMAND.join(' ')} failed (exit ${installed.exitCode ?? 'stalled'}): ${installed.output.trim().split('\n').slice(-3).join(' / ')}; node_modules is now incomplete (npm ci removes it first): the same command installs it again`
		changed = overwritten.find(
			({ path, staged }) =>
				!existsSync(path) || !readFileSync(path).equals(staged ?? Buffer.alloc(0)),
		)?.file
	} finally {
		restore()
		removeSignalHook()
	}
	if (changed)
		return `the install changed the staged ${changed}: it must install the staged lock as it is (the working copy is restored)`
	return undefined
}

/**
 * A backup an install left (a signal, a crash): restored when the working files still hold the staged bytes
 * written over them, else refused naming it (nothing touched). Undefined when there is none.
 */
export function restoreLeftoverBackup(root: string): { ok: boolean; detail: string } | undefined {
	const backup = installBackupPath(root)
	if (!existsSync(backup)) return undefined
	const names = readdirSync(backup)
		.filter((name) => name.endsWith(STAGED_SUFFIX))
		.map((name) => name.slice(0, -STAGED_SUFFIX.length))
	const stillStaged = names.every((name) => {
		const path = join(root, name)
		return (
			existsSync(path) &&
			readFileSync(path).equals(readFileSync(join(backup, `${name}${STAGED_SUFFIX}`)))
		)
	})
	if (!stillStaged)
		return {
			ok: false,
			detail: `${backup} holds the working ${names.join(', ')} an interrupted install saved, and the working files changed since: compare them by hand, keep what is right, then delete ${backup}`,
		}
	for (const name of names)
		if (existsSync(join(backup, `${name}${ABSENT_SUFFIX}`)))
			rmSync(join(root, name), { force: true })
		else writeFileSync(join(root, name), readFileSync(join(backup, name)))
	rmSync(backup, { recursive: true, force: true })
	return {
		ok: true,
		detail: `${names.join(', ')} restored from ${backup}, which an interrupted install left`,
	}
}

function installBackupPath(root: string): string {
	return readGit({
		root,
		args: ['rev-parse', '--path-format=absolute', '--git-path', INSTALL_BACKUP_FOLDER],
	}).trim()
}

/**
 * The lock and the manifest, working and staged bytes (undefined when absent); throws the refusal naming a file the
 * index holds but git cannot read.
 */
function readInstallFiles(root: string): InstallFile[] {
	return [PACKAGE_LOCK_FILE, PACKAGE_MANIFEST_FILE].map(function readInstallFile(file) {
		const path = join(root, file)
		let staged: Buffer | undefined
		try {
			staged = readStagedFile({ root, file })
		} catch (error) {
			const reason = firstLineOf(error)
			throw new Error(
				INDEX_FILE_UNREADABLE_REFUSAL.replace('{file}', () => file).replace(
					'{reason}',
					() => reason,
				),
			)
		}
		return { file, path, working: existsSync(path) ? readFileSync(path) : undefined, staged }
	})
}

/**
 * The staged lock's packages under `node_modules/`, in lock order; none when the index holds no lock. Throws the
 * refusal for a staged lock git cannot read or that does not parse.
 */
function readStagedLockPackages(root: string): Array<[string, StagedLockEntry]> {
	let staged: Buffer | undefined
	try {
		staged = readStagedFile({ root, file: PACKAGE_LOCK_FILE })
	} catch (error) {
		throw new Error(
			INDEX_FILE_UNREADABLE_REFUSAL.replace('{file}', PACKAGE_LOCK_FILE).replace('{reason}', () =>
				firstLineOf(error),
			),
		)
	}
	if (staged === undefined) return []
	let lock: unknown
	try {
		lock = JSON.parse(staged.toString('utf8'))
	} catch (error) {
		throw new Error(
			INDEX_FILE_PARSE_REFUSAL.replace('{file}', PACKAGE_LOCK_FILE).replace('{reason}', () =>
				firstLineOf(error),
			),
		)
	}
	const packages =
		typeof lock === 'object' && lock !== null
			? (lock as { packages?: Record<string, StagedLockEntry> }).packages
			: undefined
	return Object.entries(packages ?? {}).filter(([path]) => path.startsWith('node_modules/'))
}

/** An error's message, as a refusal shows it. */
function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

/** The version a package's installed manifest says; undefined when it is not installed. */
function installedVersion(params: { root: string; path: string }): string | undefined {
	const manifest = join(params.root, params.path, 'package.json')
	return existsSync(manifest)
		? (JSON.parse(readFileSync(manifest, 'utf8')) as { version?: string }).version
		: undefined
}

/** Each package of the staged lock `node_modules` does not hold at its version: `name installed (lock v)`. */
function nodeModulesAgainstStagedLock(params: {
	root: string
	packages: ReadonlyArray<[string, StagedLockEntry]>
}): string[] {
	const { root } = params
	return params.packages.flatMap(function differs([path, entry]) {
		if (entry.link) return []
		const installed = installedVersion({ root, path })
		// an install may leave dev, peer and optional packages out
		if (installed === undefined && OPTIONAL_LOCK_FLAGS.some((flag) => entry[flag] === true))
			return []
		return installed === entry.version
			? []
			: [`${path.slice('node_modules/'.length)} ${installed ?? 'missing'} (lock ${entry.version})`]
	})
}

/**
 * The note's end naming each installed package of the staged lock with an install script, if any: `npm ci`
 * reinstalls every package, and none of their scripts ran. A package is named once, by its name (a nested
 * copy, `vite/node_modules/fsevents`, is `fsevents`), in lock order, the first few named and the others
 * counted.
 */
function skippedScriptsNote(params: {
	root: string
	packages: ReadonlyArray<[string, StagedLockEntry]>
}): string {
	const { root } = params
	const names = params.packages.flatMap(function withScript([path, entry]) {
		if (entry.link || entry.hasInstallScript !== true) return []
		if (installedVersion({ root, path }) === undefined) return []
		return [path.slice(path.lastIndexOf(NODE_MODULES_SEGMENT) + NODE_MODULES_SEGMENT.length)]
	})
	const unique = [...new Set(names)]
	if (unique.length === 0) return ''
	const named = unique.slice(0, SKIPPED_SCRIPTS_NAMED)
	const others = unique.length - named.length
	return `${SKIPPED_INSTALL_SCRIPTS_NOTE}${named.join(', ')}${others > 0 ? ` and ${others} more` : ''}`
}

function installWithNpm(params: { root: string }): ReturnType<Installer> {
	const [command, ...args] = INSTALL_COMMAND
	return runChild({ command, args, cwd: params.root })
}

function shortList(entries: readonly string[]): string {
	return `${entries.slice(0, 5).join('; ')}${entries.length > 5 ? `; and ${entries.length - 5} more` : ''}`
}
