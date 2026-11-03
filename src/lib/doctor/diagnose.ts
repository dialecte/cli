/**
 * `dialecte doctor`: what an agent checks before trusting what it reads - the installed `@dialecte/*`
 * versions, which core API generation they are, whether the agent skills were synced after the packages that
 * ship them were installed, the local checkouts, the cli itself. Each finding is a line, ✅ or ⚠️ with the one
 * command that fixes it.
 */
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { TEXT_COLLATOR } from '../skills/api-index.constants.ts'
import { AGENT_SKILL_FOLDERS, MANIFEST_FILE } from '../skills/sync-skills.constants.ts'
import {
	dependencyNames,
	discoverSkillSources,
	findInstalledPackage,
	readSyncManifest,
	selectAudience,
} from '../skills/sync-skills.ts'
import {
	CHECKOUT_LIST_LIMIT,
	CORE_API_GENERATIONS,
	CORE_PACKAGE,
	ALIGN_CORE_FIX,
	DIALECTE_SCOPE,
	INSTALL_COMMAND,
	SYNC_COMMAND,
} from './doctor.constants.ts'
import { stationAgentLines } from './station-agent-lines.ts'

import type { DoctorContext, DoctorLine } from './doctor.types.ts'

export function diagnose(context: DoctorContext): DoctorLine[] {
	return [
		{ status: 'ok', subject: 'dialecte', detail: `cli ${context.cliVersion} running` },
		...installedPackages(context.cwd),
		...coreGenerations(context.cwd),
		...skills(context.cwd),
		...stationAgentLines(context.cwd),
		...(context.brief ? [] : localCheckouts(context)),
	]
}

function installedPackages(cwd: string): DoctorLine[] {
	const declared = declaredVersions(cwd)
	return Object.keys(declared)
		.filter((name) => name.startsWith(DIALECTE_SCOPE))
		.sort(TEXT_COLLATOR.compare)
		.map(function packageLine(name: string): DoctorLine {
			const version = installedVersion({ cwd, name })
			if (version === undefined)
				return { status: 'warning', subject: name, detail: 'not installed', fix: INSTALL_COMMAND }
			const pinned = declared[name]
			if (/^\d/.test(pinned) && pinned !== version)
				return {
					status: 'warning',
					subject: name,
					detail: `${version} installed, ${pinned} declared`,
					fix: INSTALL_COMMAND,
				}
			return { status: 'ok', subject: name, detail: version }
		})
}

/**
 * The core API generation each installed dialecte runs on, its core resolved from its own folder (a dialecte
 * may hold a nested core of another version than the app's). Without a dialecte, the app's own core.
 */
function coreGenerations(cwd: string): DoctorLine[] {
	const dialectes = dependencyNames(cwd)
		.sort(TEXT_COLLATOR.compare)
		.flatMap(function dialecteOnCore(name: string): { name: string; folder: string }[] {
			const folder = findInstalledPackage({ cwd, name })
			return folder && dependsOnCore(folder) ? [{ name, folder }] : []
		})
	const appCore = installedVersion({ cwd, name: CORE_PACKAGE })
	const owners = dialectes.length ? dialectes : [{ name: undefined, folder: cwd }]
	return owners.flatMap(function generationLine({ name, folder }): DoctorLine[] {
		const version = installedVersion({ cwd: folder, name: CORE_PACKAGE })
		if (version === undefined) return []
		const [major = 0, minor = 0] = version.split('.').map(Number)
		const generation = CORE_API_GENERATIONS.find(
			({ from }) => major > from[0] || (major === from[0] && minor >= from[1]),
		)
		if (!generation) return []
		const says = `${generation.name}: ${generation.says}`
		// a dialecte on another core than the app's: two engines, two type sets - act on it
		if (name && appCore !== undefined && appCore !== version)
			return [
				{
					status: 'warning',
					subject: 'core API',
					detail: `${name} on core ${version}, your app on core ${appCore}: two cores side by side (${says})`,
					fix: ALIGN_CORE_FIX,
				},
			]
		const owner = name ? `${name} on core ${version}` : `core ${version}`
		return [{ status: 'ok', subject: 'core API', detail: `${owner} - ${says}` }]
	})
}

/**
 * The skills a sync installed, against what node_modules ships now: a shipped skill missing from the sync, or a
 * copied skill taken from another version than the installed one, is stale. A linked skill follows
 * node_modules, so only a missing one counts.
 */
function skills(cwd: string): DoctorLine[] {
	const { sources } = discoverSkillSources({ cwd })
	if (sources.length === 0)
		return [{ status: 'ok', subject: 'skills', detail: 'no dependency ships skills' }]
	const synced = Object.values(AGENT_SKILL_FOLDERS).filter((folder) =>
		existsSync(join(cwd, folder, MANIFEST_FILE)),
	)
	if (synced.length === 0)
		return [
			{
				status: 'warning',
				subject: 'skills',
				detail: `not installed for your agents (${sources.map((source) => source.name).join(', ')} shipped)`,
				fix: SYNC_COMMAND,
			},
		]

	return synced.map(function syncLine(folder: string): DoctorLine {
		const manifest = readSyncManifest(join(cwd, folder))
		const expected = selectAudience({
			sources,
			contributing: manifest.contributing === true,
		}).selected
		const missing = expected
			.map((source) => source.name)
			.filter((name) => !manifest.installed.includes(name))
		if (missing.length)
			return {
				status: 'warning',
				subject: 'skills',
				detail: `${folder} lacks ${missing.join(', ')}`,
				fix: SYNC_COMMAND,
			}
		const stale = expected.flatMap(function staleCopy(source): string[] {
			const recorded = manifest.versions[source.name]
			if (isLink(join(cwd, folder, source.name)) || source.version === undefined) return []
			if (recorded?.version === source.version) return []
			return [
				`${source.name} of ${source.origin} ${recorded?.version ?? 'an unknown version'}, ${source.version} installed`,
			]
		})
		if (stale.length)
			return {
				status: 'warning',
				subject: 'skills',
				detail: `${folder} holds ${stale.join('; ')}`,
				fix: SYNC_COMMAND,
			}
		return { status: 'ok', subject: 'skills', detail: `${folder} in sync with node_modules` }
	})
}

function isLink(path: string): boolean {
	try {
		return lstatSync(path).isSymbolicLink()
	} catch {
		return false
	}
}

function dependsOnCore(folder: string): boolean {
	const manifest: {
		name?: unknown
		dependencies?: Record<string, string>
		peerDependencies?: Record<string, string>
	} = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8'))
	return (
		manifest.name !== CORE_PACKAGE &&
		(manifest.dependencies?.[CORE_PACKAGE] !== undefined ||
			manifest.peerDependencies?.[CORE_PACKAGE] !== undefined)
	)
}

/** Dialecte repositories next to the project or under `$DIALECTE_ROOT`: the source an agent may read. */
function localCheckouts(context: DoctorContext): DoctorLine[] {
	const roots = [
		...new Set([context.dialecteRoot, dirname(resolve(context.cwd))].filter(isDefined)),
	]
	return roots.map(function checkoutLine(root: string): DoctorLine {
		const names = existsSync(root)
			? readdirSync(root, { withFileTypes: true })
					.filter((entry) => entry.isDirectory() && join(root, entry.name) !== resolve(context.cwd))
					.filter((entry) => packageName(join(root, entry.name))?.startsWith(DIALECTE_SCOPE))
					.map((entry) => entry.name)
					.sort(TEXT_COLLATOR.compare)
			: []
		return {
			status: 'ok',
			subject: 'checkouts',
			detail: names.length
				? `${root}: ${names.slice(0, CHECKOUT_LIST_LIMIT).join(', ')}${names.length > CHECKOUT_LIST_LIMIT ? ` and ${names.length - CHECKOUT_LIST_LIMIT} more` : ''}`
				: `none in ${root} (the installed packages are the source)`,
		}
	})
}

function declaredVersions(cwd: string): Record<string, string> {
	const manifest = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'))
	const names = dependencyNames(cwd)
	return Object.fromEntries(
		names.map((name) => [
			name,
			String(
				manifest.dependencies?.[name] ??
					manifest.devDependencies?.[name] ??
					manifest.peerDependencies?.[name],
			),
		]),
	)
}

function installedVersion(params: { cwd: string; name: string }): string | undefined {
	const folder = findInstalledPackage(params)
	if (!folder || !existsSync(join(folder, 'package.json'))) return undefined
	const version: unknown = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')).version
	return typeof version === 'string' ? version : undefined
}

function packageName(folder: string): string | undefined {
	const path = join(folder, 'package.json')
	if (!existsSync(path)) return undefined
	const name: unknown = JSON.parse(readFileSync(path, 'utf8')).name
	return typeof name === 'string' ? name : undefined
}

function isDefined<GenericValue>(value: GenericValue | undefined): value is GenericValue {
	return value !== undefined
}
