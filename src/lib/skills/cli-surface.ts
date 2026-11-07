/** Where the command map of the cli a package uses comes from. */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

import { commandSurfaceOf } from '../command-map/command-surface.ts'
import { allRenamedWords } from '../command-map/renamed-answer.ts'
import { listedCommands } from '../command-map/render-help.ts'
import { readPackageJson } from '../package-json.ts'
import { HELP_FLAG, JSON_FLAG } from '../parse-invocation.constants.ts'
import {
	CLI_BIN,
	CLI_PACKAGE,
	CLI_SURFACE_TIMEOUT_MS,
	UNAVAILABLE_REASONS,
} from './cli-invocations.constants.ts'

import type { CommandSurface, RenamedWords } from '../command-map/command-map.types.ts'
import type { CliSurface, CliSurfaceAnswer } from './cli-invocations.types.ts'

/**
 * The cli's own map when the package is the cli, else what the cli installed in the package answers to
 * `dialecte --help --json`; unavailable, with the reason, when there is none or it answers no map.
 */
export function readCliSurface(params: { cwd: string }): CliSurfaceAnswer {
	if (readPackageJson(params.cwd).name === CLI_PACKAGE)
		return {
			surface: {
				commands: listedCommands().map(commandSurfaceOf),
				renamed: allRenamedWords(),
			},
		}
	return readInstalledSurface(params)
}

/** The installed cli's package.json: its version and bin; undefined when it is no JSON object. */
function readManifest(path: string): { version?: unknown; bin?: unknown } | undefined {
	try {
		const manifest: unknown = JSON.parse(readFileSync(path, 'utf8'))
		return isRecord(manifest) ? manifest : undefined
	} catch {
		// a broken manifest: the invocations go unchecked with the reason, as with no cli
		return undefined
	}
}

/** The surface the installed cli answers, or why it cannot be read. */
function readInstalledSurface(params: { cwd: string }): CliSurfaceAnswer {
	const manifestPath = installedManifestPath(params)
	if (!manifestPath) return { unavailable: UNAVAILABLE_REASONS.noCli }
	const manifest = readManifest(manifestPath)
	if (!manifest) return { unavailable: UNAVAILABLE_REASONS.badManifest }
	const version = typeof manifest.version === 'string' ? manifest.version : ''
	const bin = binOf(manifest.bin)
	if (!bin) return { unavailable: withVersion({ reason: UNAVAILABLE_REASONS.noBin, version }) }

	const answer = spawnSync(
		process.execPath,
		[join(dirname(manifestPath), bin), HELP_FLAG, JSON_FLAG],
		{
			cwd: params.cwd,
			encoding: 'utf8',
			timeout: CLI_SURFACE_TIMEOUT_MS,
		},
	)
	if (answer.error || answer.status !== 0)
		return {
			unavailable: withVersion({ reason: UNAVAILABLE_REASONS.failed, version }).replace(
				'{detail}',
				answer.error?.message ?? `exit ${answer.status ?? answer.signal}`,
			),
		}
	const json = parseJson(answer.stdout)
	if (json === undefined)
		return { unavailable: withVersion({ reason: UNAVAILABLE_REASONS.noJson, version }) }
	const surface = surfaceOf(json)
	return surface
		? { surface }
		: { unavailable: withVersion({ reason: UNAVAILABLE_REASONS.noMap, version }) }
}

/** The installed cli's package.json, resolved from the package as Node would, or undefined. */
function installedManifestPath(params: { cwd: string }): string | undefined {
	try {
		return createRequire(join(params.cwd, 'package.json')).resolve(`${CLI_PACKAGE}/package.json`)
	} catch {
		return undefined
	}
}

/** The path of the `dialecte` bin in a package.json `bin` field. */
function binOf(bin: unknown): string | undefined {
	if (typeof bin === 'string') return bin
	if (typeof bin !== 'object' || bin === null) return undefined
	const path: unknown = Object.entries(bin).find(([name]) => name === CLI_BIN)?.[1]
	return typeof path === 'string' ? path : undefined
}

function withVersion(params: { reason: string; version: string }): string {
	return params.reason.replace('{version}', params.version)
}

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text)
	} catch {
		return undefined
	}
}

/** The commands' names, verbs and flags and the renamed forms of a `--help --json` answer; undefined when it has none. */
function surfaceOf(json: unknown): CliSurface | undefined {
	if (!isRecord(json) || !Array.isArray(json.commands) || !Array.isArray(json.renamed))
		return undefined
	const commands = json.commands.map(commandOf)
	const renamed = json.renamed.map(renamedOf)
	if (commands.some((command) => !command) || renamed.some((form) => !form)) return undefined
	return {
		commands: commands.filter((command): command is CommandSurface => command !== undefined),
		renamed: renamed.filter((form): form is RenamedWords => form !== undefined),
	}
}

function commandOf(value: unknown): CommandSurface | undefined {
	if (!isRecord(value) || typeof value.name !== 'string') return undefined
	if (!isWordList(value.verbs) || !isWordList(value.flags)) return undefined
	return { name: value.name, verbs: value.verbs, flags: value.flags }
}

function renamedOf(value: unknown): RenamedWords | undefined {
	if (!isRecord(value) || typeof value.old !== 'string' || typeof value.new !== 'string')
		return undefined
	return { old: value.old, new: value.new }
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isWordList(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((word) => typeof word === 'string')
}
