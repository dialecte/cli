/**
 * The cli floor of `dialecte lot`, `tdd` and `handover`: a running cli older than the version a repository asks for
 * (its own version in the cli repository, else its `@dialecte/cli` pin) runs no verb. The floor of a folder is read from its working
 * tree; only when that would refuse is the base branch's tip read, and the cli is refused only below both. The
 * folders that ask are the cwd and the repositories of the lots and briefs the words name, and for `handover` the
 * repositories of the hand-overs and lots files its words name (the hand-over store found once: one git lookup). The happy path runs no
 * git process but a brief's, whose repository resolves as `lot start` resolves it.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

import { isAtOrInside, isFolder, realPathOf } from '../file-system.ts'
import { findBaseBranchRef } from '../gate/gate-base.ts'
import { GIT_FOLDER_NAME } from '../git-hooks.constants.ts'
import { mainCheckoutOf, readFilesAtRevision } from '../git.ts'
import { resolveHandoverArgument } from '../handover/handover-store.ts'
import { storeOfFolder } from '../handover/named-handover.ts'
import { readHandoverFolder } from '../handover/read-handover-folder.ts'
import { readLotsFile } from '../handover/read-lots-file.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { PACKAGE_MANIFEST_FILE } from '../package-json.constants.ts'
import { declaredSpecOf } from '../package-json.ts'
import { packageRootOf } from '../package-root.ts'
import { asksJson } from '../parse-invocation.ts'
import { readCliVersion } from '../read-cli-version.ts'
import { workTreeTopOf } from '../review-rounds/worktree-state.ts'
import { compareSemVer, parseSemVer, rangeLowerBoundOf } from '../semver.ts'
import { CLI_PACKAGE } from '../skills/cli-invocations.constants.ts'
import { findInstalledPackage } from '../skills/sync-skills.ts'
import { briefRepositoryOf } from '../store/brief.ts'
import { readIdentity } from '../store/identity.ts'
import { lotRefusalExit } from '../store/lot-exits.ts'
import { resolveLot } from '../store/resolve-lot.ts'
import { workTreeHolding } from '../store/store-folder.ts'
import {
	AT_BRANCH_SUFFIX,
	CHECKOUT_UPDATE_HINT,
	FLOOR_REFUSAL_LINE,
	FLOOR_SOURCE_TEXTS,
	MISSING_VERSION,
	OPTION_PREFIX,
	OWN_CLI_HINT,
	PACKAGE_CLI_HINT,
	PACKAGE_INSTALL_HINT,
	STALE_INSTALL_HINT,
	STARTED_AS_LINKED,
	UNREADABLE_VERSION_LINE,
} from './cli-floor.constants.ts'

import type { CommandResult } from '../command-result.types.ts'
import type { PackageJson } from '../package-json.types.ts'
import type { SemVer } from '../semver.types.ts'
import type { CliFloor, FloorCommand, RunningCli } from './cli-floor.types.ts'

/** The floor a package folder asks for; undefined when it asks for none. */
export function cliFloorOf(params: { folder: string }): CliFloor | undefined {
	return workingFloorOf(params)?.floor
}

/** The folders whose floor counts for a `lot` invocation: the cwd, the repositories of the lots and briefs its words name. */
export function floorFoldersOf(params: {
	cwd: string
	argv: string[]
	command?: FloorCommand
}): string[] {
	// every word, those after `--` too: the verbs read their positional words there; `handover <lots.json>` has no verb
	const words = (params.command === 'handover' ? params.argv : params.argv.slice(1)).filter(
		function isWord(word) {
			return !word.startsWith(OPTION_PREFIX)
		},
	)
	const store = params.command === 'handover' ? storeOfFolder(params.cwd) : undefined
	const named = words.flatMap(function foldersOfWord(word) {
		return [
			...foldersNamedBy({ word, cwd: params.cwd }),
			...(params.command === 'handover'
				? handoverRepositoriesOf({ word, cwd: params.cwd, store })
				: []),
		]
	})
	return [...new Set([params.cwd, ...named])]
}

/**
 * The repositories a `handover` word names: a lots file's (`handover <lots.json>`), and the hand-over's a name or a
 * folder resolves to. Files are only read, never written; nothing for a word that names neither.
 */
function handoverRepositoriesOf(params: {
	word: string
	cwd: string
	store: string | undefined
}): string[] {
	const path = resolve(params.cwd, params.word)
	const lotsFile = isRegularFile({ path }) ? readLotsFile(path) : undefined
	const folder = resolveHandoverArgument({
		argument: params.word,
		store: params.store,
		cwd: params.cwd,
	})
	const handover = isFolder(folder) ? readHandoverFolderOrNone({ folder }) : undefined
	return [
		...(lotsFile === undefined || typeof lotsFile === 'string' ? [] : [lotsFile.repository]),
		...(handover === undefined || typeof handover === 'string'
			? []
			: [handover.lotsFile.repository]),
	]
}

/** The refusal lines of a running cli older than the highest floor of the invocation's folders; undefined when allowed. */
export function floorRefusalOf(params: {
	cwd: string
	argv: string[]
	running: RunningCli
	/** The command guarded, named by the refusal and its hints. */
	command: FloorCommand
}): string[] | undefined {
	const { command } = params
	const folders = floorFoldersOf({ cwd: params.cwd, argv: params.argv, command })
	const running =
		params.running.version === undefined ? undefined : parseSemVer(params.running.version)
	const floors = folders.flatMap((folder) => {
		const floor = effectiveFloorOf({ folder, running })
		return floor === undefined ? [] : [floor]
	})
	const highest = highestFloorOf({ floors })
	if (highest === undefined) return undefined
	const highestVersion = parseSemVer(highest.version)
	if (running !== undefined && highestVersion !== undefined)
		return compareSemVer(running, highestVersion) < 0
			? refusalLinesOf({ floor: highest, running: params.running, readable: true, command })
			: undefined
	return refusalLinesOf({ floor: highest, running: params.running, readable: false, command })
}

/**
 * The refusal result of a running cli older than the floor of the invocation's folders, for `command`: exit 2, the
 * lines (or `{ error, next: null }` when the words ask for JSON) on standard error through the one writer; undefined
 * when allowed.
 *
 * @intent refuse every verb of a guarded command the same way when the cli is too old
 * @internal
 */
export function floorRefusalResultOf(params: {
	cwd: string
	argv: string[]
	command: FloorCommand
	/** The path the running cli was started by (`process.argv[1]`). */
	invokedPath: string
}): CommandResult | undefined {
	const lines = floorRefusalOf({
		cwd: params.cwd,
		argv: params.argv,
		command: params.command,
		running: runningCliOf({
			invokedPath: params.invokedPath,
			realPath: realPathOf(params.invokedPath),
		}),
	})
	return lines === undefined ? undefined : lotRefusalExit({ lines, json: asksJson(params.argv) })
}

/** The cli that runs this process, started by `invokedPath`: its own version (undefined when unreadable). */
export function runningCliOf(params: { invokedPath: string; realPath: string }): RunningCli {
	return { version: readableCliVersion(), ...params }
}

/** The running cli's own version; undefined when it cannot be read. */
function readableCliVersion(): string | undefined {
	try {
		return readCliVersion()
	} catch {
		return undefined
	}
}

/**
 * The folders a word names: a lot's worktree (when it exists) and repository, or the repository of a brief (a
 * regular file); nothing for any other word.
 */
function foldersNamedBy(params: { word: string; cwd: string }): string[] {
	const resolution = resolveLot({ argument: params.word, cwd: params.cwd, mode: 'write' })
	if ('lot' in resolution) {
		const identity = readIdentity({ lotFolder: resolution.lot })
		if (identity === undefined) return []
		const worktree =
			identity.worktree !== null && isFolder(identity.worktree) ? [identity.worktree] : []
		return [...worktree, identity.repository]
	}
	const path = resolve(params.cwd, params.word)
	// only a regular file is read as a brief: a folder, a fifo or a device is never opened
	if (!isRegularFile({ path })) return []
	const repository = briefRepositoryOf({ briefFile: path })
	return repository === undefined ? [] : [repository]
}

/** The hand-over folder read; undefined when it throws (a damaged record): the floor never fails on it, the verb names it. */
function readHandoverFolderOrNone(params: {
	folder: string
}): ReturnType<typeof readHandoverFolder> | undefined {
	try {
		return readHandoverFolder(params.folder)
	} catch {
		return undefined
	}
}

/** Whether a regular file is at the path (links followed); false when nothing is, or it cannot be read. */
function isRegularFile(params: { path: string }): boolean {
	try {
		return statSync(params.path, { throwIfNoEntry: false })?.isFile() === true
	} catch {
		return false
	}
}

/**
 * The floor that decides for a folder: its working floor, unless that would refuse (or the running version is
 * unknown) and its base branch's tip asks for one, then that one: refused only below both.
 */
function effectiveFloorOf(params: {
	folder: string
	running: SemVer | undefined
}): CliFloor | undefined {
	const working = workingFloorOf({ folder: params.folder })
	if (working === undefined) return undefined
	const version = parseSemVer(working.floor.version)
	if (params.running === undefined || version === undefined) return working.floor
	if (compareSemVer(params.running, version) >= 0) return working.floor
	return baseFloorOf({ root: working.floor.root, manifest: working.manifest }) ?? working.floor
}

/** The floor of a folder's working tree, with the manifest it was read from. */
function workingFloorOf(params: {
	folder: string
}): { floor: CliFloor; manifest: PackageJson } | undefined {
	const root = packageRootOf(params.folder)
	if (root === undefined) return undefined
	const manifest = manifestOf({ text: textOf({ path: join(root, PACKAGE_MANIFEST_FILE) }) })
	if (manifest === undefined) return undefined
	if (!asksForCli({ manifest })) return enclosingFloorOf({ root })
	const floor = manifestFloorOf({ manifest, root }) ?? installedFloorOf({ manifest, root })
	return floor === undefined ? undefined : { floor, manifest }
}

/**
 * The floor of the package above `root` in its repository, up to the repository's top (found without git), for a
 * package in a subfolder that does not ask for the cli itself; undefined outside a repository or at its top.
 */
function enclosingFloorOf(params: {
	root: string
}): { floor: CliFloor; manifest: PackageJson } | undefined {
	const top = workTreeHolding({ from: params.root })
	const parent = dirname(params.root)
	if (top === undefined || parent === params.root || !isAtOrInside({ path: parent, folder: top }))
		return undefined
	const above = packageRootOf(parent)
	return above === undefined || !isAtOrInside({ path: above, folder: top })
		? undefined
		: workingFloorOf({ folder: above })
}

/** Whether a manifest asks for the cli: it is the cli's own, or it declares it. */
function asksForCli(params: { manifest: PackageJson }): boolean {
	return (
		params.manifest.name === CLI_PACKAGE ||
		declaredSpecOf({ manifest: params.manifest, name: CLI_PACKAGE }) !== undefined
	)
}

/**
 * The floor the package.json at the base branch's tip asks for (the installed step skipped: no node_modules
 * there); undefined outside git, with no base branch found, or no package.json at the base.
 */
function baseFloorOf(params: { root: string; manifest: PackageJson }): CliFloor | undefined {
	try {
		const base = findBaseBranchRef({ root: params.root, packageJson: params.manifest })
		if ('refusal' in base) return undefined
		const texts = readFilesAtRevision({
			root: params.root,
			revision: base.ref,
			files: [PACKAGE_MANIFEST_FILE],
		})
		const manifest = manifestOf({ text: texts.get(PACKAGE_MANIFEST_FILE) })
		const floor =
			manifest === undefined ? undefined : manifestFloorOf({ manifest, root: params.root })
		return floor === undefined ? undefined : { ...floor, branch: base.branch }
	} catch {
		return undefined
	}
}

/** The floor a manifest states: the cli repository's own version, else the lowest version its pin admits. */
function manifestFloorOf(params: { manifest: PackageJson; root: string }): CliFloor | undefined {
	const { manifest, root } = params
	if (manifest.name === CLI_PACKAGE)
		return typeof manifest.version === 'string' && parseSemVer(manifest.version) !== undefined
			? { version: manifest.version, source: 'own', root }
			: undefined
	const declared = declaredSpecOf({ manifest, name: CLI_PACKAGE })
	if (declared === undefined) return undefined
	const bound = rangeLowerBoundOf({ spec: declared.spec })
	return bound.kind === 'version'
		? { version: bound.version, source: 'pin', root, field: declared.field, spec: declared.spec }
		: undefined
}

/**
 * The installed cli's version, for a pin with no lower bound (`*`, `<2.0.0`) or no semver range (a path, a link, a
 * url, a dist-tag): fail closed, the cli the package installs is its floor.
 */
function installedFloorOf(params: { manifest: PackageJson; root: string }): CliFloor | undefined {
	const { manifest, root } = params
	if (manifest.name === CLI_PACKAGE) return undefined
	const declared = declaredSpecOf({ manifest, name: CLI_PACKAGE })
	if (declared === undefined || rangeLowerBoundOf({ spec: declared.spec }).kind === 'version')
		return undefined
	const installed = findInstalledPackage({ cwd: root, name: CLI_PACKAGE })
	if (installed === undefined) return undefined
	const version = manifestOf({
		text: textOf({ path: join(installed, PACKAGE_MANIFEST_FILE) }),
	})?.version
	return typeof version === 'string' && parseSemVer(version) !== undefined
		? { version, source: 'installed', root, field: declared.field, spec: declared.spec }
		: undefined
}

/** A file's text; undefined when it cannot be read. */
function textOf(params: { path: string }): string | undefined {
	try {
		return readFileSync(params.path, 'utf8')
	} catch {
		return undefined
	}
}

/** A package.json text parsed; undefined when it is absent, no JSON or no object. */
function manifestOf(params: { text: string | undefined }): PackageJson | undefined {
	if (params.text === undefined) return undefined
	try {
		const parsed: unknown = JSON.parse(params.text)
		return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
			? (parsed as PackageJson)
			: undefined
	} catch {
		return undefined
	}
}

/** The highest of floors by their version; undefined for none. */
function highestFloorOf(params: { floors: readonly CliFloor[] }): CliFloor | undefined {
	return params.floors.reduce<CliFloor | undefined>(
		(highest, floor) =>
			highest === undefined || compareFloors({ first: floor, second: highest }) > 0
				? floor
				: highest,
		undefined,
	)
}

/** Semver precedence of two floors' versions. */
function compareFloors(params: { first: CliFloor; second: CliFloor }): number {
	const first = parseSemVer(params.first.version)
	const second = parseSemVer(params.second.version)
	return first === undefined || second === undefined ? 0 : compareSemVer(first, second)
}

/** The refusal's lines: what runs, what the floor asks and where from, then how to run a cli new enough. */
function refusalLinesOf(params: {
	floor: CliFloor
	running: RunningCli
	readable: boolean
	command: FloorCommand
}): string[] {
	const { floor, running } = params
	const main = mainCheckoutPackageOf({ root: floor.root })
	const values = {
		command: params.command,
		main: main ?? '',
		package: CLI_PACKAGE,
		running: running.version ?? MISSING_VERSION,
		version: running.version ?? MISSING_VERSION,
		started: startedAsOf({ running }),
		floor: floor.version,
		root: realPathOf(floor.root),
		source: sourceTextOf({ floor }),
	}
	const first = fillMessage({
		template: params.readable ? FLOOR_REFUSAL_LINE : UNREADABLE_VERSION_LINE,
		values,
	})
	const checkout = cliCheckoutOf({ running })
	return [
		first,
		fillMessage({ template: hintOf({ floor, running, main }), values }),
		...(checkout === undefined
			? []
			: [fillMessage({ template: CHECKOUT_UPDATE_HINT, values: { root: checkout } })]),
	]
}

/** The running cli as the refusal names it: its invoked path, and its real path when that differs. */
function startedAsOf(params: { running: RunningCli }): string {
	const { invokedPath, realPath } = params.running
	return invokedPath === realPath
		? invokedPath
		: fillMessage({ template: STARTED_AS_LINKED, values: { invoked: invokedPath, real: realPath } })
}

/** Where a floor came from, in words; `at <branch>` when it was read at the base branch. */
function sourceTextOf(params: { floor: CliFloor }): string {
	const { floor } = params
	const source = fillMessage({
		template: FLOOR_SOURCE_TEXTS[floor.source],
		values: { field: floor.field ?? '', package: CLI_PACKAGE, spec: floor.spec ?? '' },
	})
	return floor.branch === undefined
		? source
		: `${source}${fillMessage({ template: AT_BRANCH_SUFFIX, values: { branch: floor.branch } })}`
}

/**
 * The hint's template: the cli repository's sources, a stale install's `npm install`, or for a package `npm install`
 * there and, from a linked worktree, the main checkout's own cli.
 */
function hintOf(params: {
	floor: CliFloor
	running: RunningCli
	main: string | undefined
}): string {
	if (params.floor.source === 'own') return OWN_CLI_HINT
	if (runsInstalledCli(params)) return STALE_INSTALL_HINT
	return params.main === undefined ? PACKAGE_INSTALL_HINT : PACKAGE_CLI_HINT
}

/**
 * The same package in the repository's main checkout (the package's path below its work tree's top kept); undefined
 * when the package is in the main checkout itself or outside git.
 */
function mainCheckoutPackageOf(params: { root: string }): string | undefined {
	const root = realPathOf(params.root)
	const top = workTreeTopOf(root)
	if (top === undefined) return undefined
	let main: string
	try {
		main = mainCheckoutOf(top)
	} catch {
		return undefined
	}
	const inMain = join(realPathOf(main), relative(realPathOf(top), root))
	return realPathOf(inMain) === root ? undefined : inMain
}

/**
 * Whether the running cli is the one the floor's package installs: inside the package Node resolves from its root,
 * given or real (each taken at its real path too): a flat, hoisted or pnpm store install.
 */
function runsInstalledCli(params: { floor: CliFloor; running: RunningCli }): boolean {
	const installs = [params.floor.root, realPathOf(params.floor.root)]
		.map((cwd) => findInstalledPackage({ cwd, name: CLI_PACKAGE }))
		.flatMap((installed) => (installed === undefined ? [] : [installed, realPathOf(installed)]))
	const paths = [params.running.realPath, realPathOf(params.running.realPath)]
	return installs.some((folder) => paths.some((path) => isAtOrInside({ path, folder })))
}

/** The root of the git checkout of the cli the running cli was started from; undefined when it is none. */
function cliCheckoutOf(params: { running: RunningCli }): string | undefined {
	const root = packageRootOf(dirname(params.running.realPath))
	if (root === undefined || !existsSync(join(root, GIT_FOLDER_NAME))) return undefined
	const manifest = manifestOf({ text: textOf({ path: join(root, PACKAGE_MANIFEST_FILE) }) })
	return manifest?.name === CLI_PACKAGE ? root : undefined
}
