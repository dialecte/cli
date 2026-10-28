/**
 * `dialecte skills sync`: gather the skills shipped in `skills/<name>/SKILL.md` by the app's dependencies
 * (or by every repository of a local workspace with `--from`) and install them into the agents' skill
 * folders.
 *
 * Sync only ever replaces or removes what it installed itself: a link listed in its manifest (or, not in
 * the manifest, one resolving to the very skill folder it is installing), or a copy carrying its marker
 * file. A folder without the marker is never touched, whatever the manifest says; a link not in the
 * manifest that points elsewhere is never touched either. Both are reported as conflicts. Links are
 * unlinked, never followed.
 */
import {
	cpSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs'
import { dirname, join, parse, relative, resolve } from 'node:path'

import { SKILL_NAME_PATTERN, SKILLS_FOLDER } from './skill-file.constants.ts'
import { COPY_EXCLUDED_FOLDERS, COPY_MARKER_FILE, MANIFEST_FILE } from './sync-skills.constants.ts'

import type {
	DiscoveredSkillSources,
	SkillSource,
	SyncedVersions,
	SyncManifest,
	SyncMode,
	SyncReport,
} from './sync-skills.types.ts'

export function discoverSkillSources(params: {
	cwd: string
	from?: string
}): DiscoveredSkillSources {
	const missingDependencies: string[] = []
	const { from } = params
	const origins = from
		? readdirSync(from, { withFileTypes: true })
				.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
				.map((entry) => ({ origin: entry.name, folder: join(from, entry.name) }))
		: dependencyNames(params.cwd).flatMap((name) => {
				const folder = findInstalledPackage({ cwd: params.cwd, name })
				if (folder) return [{ origin: name, folder }]
				missingDependencies.push(name)
				return []
			})

	const sources = origins.flatMap(skillsOf)
	const originByName = new Map<string, string>()
	for (const source of sources) {
		const previous = originByName.get(source.name)
		if (previous)
			throw new Error(`skill "${source.name}" is shipped by both ${previous} and ${source.origin}`)
		originByName.set(source.name, source.origin)
	}
	return { sources, missingDependencies }
}

/** The packages `cwd`'s package.json depends on (dependencies, dev and peer), each once. */
export function dependencyNames(cwd: string): string[] {
	const manifest = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'))
	return [
		...new Set([
			...Object.keys(manifest.dependencies ?? {}),
			...Object.keys(manifest.devDependencies ?? {}),
			...Object.keys(manifest.peerDependencies ?? {}),
		]),
	]
}

/** Node's lookup: `node_modules/<name>` in the folder or any parent (hoisted by workspaces). */
export function findInstalledPackage(params: { cwd: string; name: string }): string | undefined {
	let folder = params.cwd
	const { root } = parse(folder)
	for (;;) {
		const candidate = join(folder, 'node_modules', params.name)
		if (existsSync(candidate)) return candidate
		if (folder === root) return undefined
		folder = dirname(folder)
	}
}

function skillsOf(params: { origin: string; folder: string }): SkillSource[] {
	const skillsFolder = join(params.folder, SKILLS_FOLDER)
	if (!existsSync(skillsFolder)) return []
	const version = packageVersion(params.folder)
	return readdirSync(skillsFolder, { withFileTypes: true })
		.filter(
			(entry) => entry.isDirectory() && existsSync(join(skillsFolder, entry.name, 'SKILL.md')),
		)
		.map((entry) => ({
			name: entry.name,
			path: join(skillsFolder, entry.name),
			origin: params.origin,
			...(version === undefined ? {} : { version }),
		}))
}

function packageVersion(folder: string): string | undefined {
	const path = join(folder, 'package.json')
	if (!existsSync(path)) return undefined
	const version: unknown = JSON.parse(readFileSync(path, 'utf8')).version
	return typeof version === 'string' ? version : undefined
}

export function syncSkills(params: {
	sources: readonly SkillSource[]
	targetFolders: readonly string[]
	mode: SyncMode
	/** Keep previously installed skills no source ships now (some dependency could not be found). */
	keepUnshipped?: boolean
}): SyncReport {
	const report: SyncReport = { installed: [], removed: [], conflicts: [] }
	const shipped = new Set(params.sources.map((source) => source.name))

	for (const targetFolder of params.targetFolders) {
		mkdirSync(targetFolder, { recursive: true })
		const previous = readSyncManifest(targetFolder)
		const previouslyInstalled = previous.installed
		const installed: string[] = []
		const versions: SyncedVersions = {}
		try {
			for (const name of previouslyInstalled.filter((name) => !shipped.has(name))) {
				const entry = join(targetFolder, name)
				if (!isOwnedEntry({ path: entry, name, listedInManifest: true, sourcePath: undefined }))
					continue
				if (params.keepUnshipped) {
					installed.push(name)
					if (previous.versions[name]) versions[name] = previous.versions[name]
					continue
				}
				removeEntry(entry)
				addOnce({ list: report.removed, value: name })
			}

			for (const source of params.sources) {
				const destination = join(targetFolder, source.name)
				if (existsOrIsLink(destination)) {
					const listedInManifest = previouslyInstalled.includes(source.name)
					if (
						!isOwnedEntry({
							path: destination,
							name: source.name,
							listedInManifest,
							sourcePath: source.path,
						})
					) {
						report.conflicts.push(destination)
						continue
					}
					removeEntry(destination)
				}
				install({ source, destination, mode: params.mode })
				installed.push(source.name)
				if (source.version !== undefined)
					versions[source.name] = { package: source.origin, version: source.version }
				addOnce({ list: report.installed, value: source.name })
			}
		} finally {
			writeFileSync(
				join(targetFolder, MANIFEST_FILE),
				`${JSON.stringify(Object.keys(versions).length ? { installed, versions } : { installed }, null, '\t')}\n`,
			)
		}
	}
	return report
}

/**
 * Ours: a link listed in the manifest, or one resolving to the exact skill folder being installed (a
 * sync interrupted before writing its manifest); or a copy carrying the marker. Never a plain folder,
 * never a link the user pointed elsewhere.
 */
function isOwnedEntry(params: {
	path: string
	name: string
	listedInManifest: boolean
	/** The skill folder being installed at `path`; undefined when removing an unshipped skill. */
	sourcePath: string | undefined
}): boolean {
	if (!SKILL_NAME_PATTERN.test(params.name) || !existsOrIsLink(params.path)) return false
	if (lstatSync(params.path).isSymbolicLink())
		return (
			params.listedInManifest ||
			resolve(dirname(params.path), readlinkSync(params.path)) === params.sourcePath
		)
	return existsSync(join(params.path, COPY_MARKER_FILE))
}

function install(params: { source: SkillSource; destination: string; mode: SyncMode }): void {
	if (params.mode === 'link') {
		try {
			symlinkSync(
				relative(dirname(params.destination), params.source.path),
				params.destination,
				'dir',
			)
			return
		} catch (error) {
			// Windows without Developer Mode refuses symlinks: fall back to a copy.
			if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error
		}
	}
	cpSync(params.source.path, params.destination, {
		recursive: true,
		filter: function keepOutsideExcludedFolders(path: string): boolean {
			return !COPY_EXCLUDED_FOLDERS.includes(relative(params.source.path, path).split(/[\\/]/)[0])
		},
	})
	writeFileSync(join(params.destination, COPY_MARKER_FILE), `${params.source.origin}\n`)
}

/** The manifest a sync wrote in a target folder; empty when there is none. */
export function readSyncManifest(targetFolder: string): SyncManifest {
	const path = join(targetFolder, MANIFEST_FILE)
	if (!existsSync(path)) return { installed: [], versions: {} }
	const manifest: { installed?: unknown; versions?: unknown } = JSON.parse(
		readFileSync(path, 'utf8'),
	)
	const installed = Array.isArray(manifest.installed)
		? manifest.installed.filter(
				(name): name is string => typeof name === 'string' && SKILL_NAME_PATTERN.test(name),
			)
		: []
	const versions: SyncedVersions = {}
	if (typeof manifest.versions === 'object' && manifest.versions !== null)
		for (const [name, entry] of Object.entries(manifest.versions))
			if (isSyncedVersion(entry)) versions[name] = entry
	return { installed, versions }
}

function isSyncedVersion(value: unknown): value is { package: string; version: string } {
	return (
		typeof value === 'object' &&
		value !== null &&
		'package' in value &&
		typeof value.package === 'string' &&
		'version' in value &&
		typeof value.version === 'string'
	)
}

function existsOrIsLink(path: string): boolean {
	try {
		lstatSync(path)
		return true
	} catch {
		return false
	}
}

/** A symlink is unlinked, never followed: the source folder must survive. */
function removeEntry(path: string): void {
	if (lstatSync(path).isSymbolicLink()) unlinkSync(path)
	else rmSync(path, { recursive: true })
}

function addOnce(params: { list: string[]; value: string }): void {
	if (!params.list.includes(params.value)) params.list.push(params.value)
}
