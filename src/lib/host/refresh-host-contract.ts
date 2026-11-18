/** `host:refresh` and `host:drift`: ask the real tool what it describes; the suite only ever asks a fake. */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { resolveBin } from '../bin.ts'
import { formatFiles } from '../format.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { checkHostContract, commandPathOf, graphqlTypeAt } from './check-host-contract.ts'
import { selectionsOf } from './graphql-selections.ts'
import {
	HOST_FIXTURE_EXTENSION,
	HOST_FIXTURE_NAMES,
	HOST_FIXTURE_WORD_SEPARATOR,
	HOST_FIXTURES_PATH,
	HOST_RECORD_EXPORTS,
	HOST_RECORD_HEADER,
	HOST_RECORD_PATH,
	HOST_REFRESH_LINES,
} from './refresh-host-contract.constants.ts'

import type { ResolvedBin } from '../bin.types.ts'
import type { FormatFilesParams } from '../format.types.ts'
import type {
	HostCallSpec,
	HostCallTable,
	HostContractCommand,
	HostContractRecord,
	HostGraphqlField,
	HostRefusal,
} from './host.types.ts'
import type {
	HostDescription,
	HostDriftOutcome,
	HostMissingPart,
	HostReading,
	HostRefreshOutcome,
	HostRefreshParams,
} from './refresh-host-contract.types.ts'

/**
 * Asks each record's tool again, saves every raw answer byte for byte under `test/fixtures/host-contract/<name>/`, and
 * writes the record module `src/lib/host/<name>/<name>-contract.constants.ts` formatted. Refuses, writing nothing,
 * when a part of the tool the record names is absent.
 *
 * @intent keep the record and its fixtures moving together, from the real tool
 * @internal
 */
export function refreshHostContract(params: HostRefreshParams): HostRefreshOutcome {
	const { root } = params
	const records = recordsOf(params)
	if ('refusal' in records) return records
	const described = records.map(function describedRecord(record) {
		return { record, description: descriptionOf({ root, record }) }
	})
	for (const { record, description } of described) {
		const refusal = refusalOfDescription({ record, description })
		if (refusal) return refusal
	}
	const { resolveFormatter = defaultFormatterOf, format = formatFiles } = params
	if (!resolveFormatter(root)) return { refusal: HOST_REFRESH_LINES.noFormatter }
	// the modules first, each formatted or put back: a failed format leaves nothing written
	const modules = writtenModulesOf({ root, described, format })
	if ('refusal' in modules) return modules
	const fixtures = described.flatMap(function writtenFixtures({ record, description }) {
		return writeFixtures({ root, name: record.name, files: description.files })
	})
	return { changed: [...modules.changed, ...fixtures].sort() }
}

/**
 * Asks each record's tool again and writes nothing: exit 1 naming what the tool lacks of what the table uses, exit 0
 * when it only added something; a part of the tool that is absent is reported as not checked.
 *
 * @intent tell when the real tool drifted from what the cli declares
 * @internal
 */
export function driftHostContract(params: HostRefreshParams): HostDriftOutcome {
	const { root } = params
	const records = recordsOf(params)
	if ('refusal' in records) return { exit: 1, lines: [records.refusal] }
	const drifts = records.map(function driftOfRecord(record) {
		return driftOf({ record, description: descriptionOf({ root, record }) })
	})
	return {
		exit: drifts.some(function failed(drift) {
			return drift.failed
		})
			? 1
			: 0,
		lines: drifts.flatMap(function linesOfDrift(drift) {
			return drift.lines
		}),
	}
}

/** The formatter the record modules are formatted with: the repository's oxfmt; null when it has none. */
function defaultFormatterOf(root: string): ResolvedBin | null {
	return resolveBin('oxfmt', 'oxfmt', root)
}

/** The records asked: all of them, or the one named `vendor`. */
function recordsOf(params: HostRefreshParams): readonly HostContractRecord[] | HostRefusal {
	const { records, vendor } = params
	if (vendor === undefined) return records
	const named = records.filter(function isNamed(record) {
		return record.name === vendor
	})
	if (named.length) return named
	return {
		refusal: fillMessage({
			template: HOST_REFRESH_LINES.unknownVendor,
			values: {
				name: vendor,
				names: records
					.map(function nameOf(record) {
						return record.name
					})
					.join(', '),
			},
		}),
	}
}

/** Why a description cannot be written: a part of the tool absent, or a read that failed. */
function refusalOfDescription(params: {
	record: HostContractRecord
	description: HostDescription
}): HostRefusal | undefined {
	const { record, description } = params
	const [absent] = description.absent
	if (absent) {
		return {
			refusal: fillMessage({
				template: HOST_REFRESH_LINES.absentPart,
				values: { part: absent.name, version: record.versions[absent.selector] ?? '?' },
			}),
		}
	}
	if (description.refusals.length) return { refusal: description.refusals.join('; ') }
	return undefined
}

/** One record's drift: the commands not checked, the reads that failed, the versions, and what the tool lacks. */
function driftOf(params: { record: HostContractRecord; description: HostDescription }): {
	failed: boolean
	lines: string[]
} {
	const { record, description } = params
	const notChecked = description.absent.map(function lineOfAbsent(part) {
		return fillMessage({
			template: HOST_REFRESH_LINES.notChecked,
			values: {
				vendor: record.name,
				commands: commandsOfPart({ calls: record.calls, part }).join(', '),
				part: part.name,
			},
		})
	})
	const versions = Object.entries(description.versions).map(function lineOfVersion([
		selector,
		version,
	]) {
		return fillMessage({
			template: HOST_REFRESH_LINES.version,
			values: {
				vendor: record.name,
				selector,
				version,
				recorded: record.versions[selector] ?? '?',
			},
		})
	})
	const lacks = checkHostContract({
		calls: description.checked,
		contract: description.contract,
		impliedFlagsOf: record.impliedFlagsOf,
	}).filter(function isLack(finding) {
		// the live description holds only what the table uses: nothing in it is stale
		return finding.kind !== 'stale'
	})
	const faults = [
		...description.refusals.map(function lineOfRefusal(refusal) {
			return `${record.name}: ${refusal}`
		}),
		...lacks.map(function lineOfFinding(finding) {
			return `${record.name}: ${finding.message}`
		}),
	]
	const clean = faults.length
		? []
		: [fillMessage({ template: HOST_REFRESH_LINES.clean, values: { vendor: record.name } })]
	return { failed: faults.length > 0, lines: [...versions, ...notChecked, ...faults, ...clean] }
}

/** The command paths of the calls a part of the tool serves (its selector is their first word). */
function commandsOfPart(params: { calls: HostCallTable; part: HostMissingPart }): string[] {
	return pathsOf({
		calls: Object.fromEntries(
			Object.entries(params.calls).filter(function isOfPart([, spec]) {
				return spec.words[0] === params.part.selector
			}),
		),
	})
}

/**
 * What the record's tool describes when asked again: each version, the help of every command path the table uses,
 * the field list of those that ask fields, and every GraphQL type the queries reach from the root; a part found absent
 * leaves its commands unasked.
 */
function descriptionOf(params: { root: string; record: HostContractRecord }): HostDescription {
	const { root, record } = params
	const files: Record<string, string> = {}
	const versions: Record<string, string> = {}
	const absent: HostMissingPart[] = []
	const refusals: string[] = []
	for (const selector of Object.keys(record.versions)) {
		const answer = record.describe.versionOf({ root, selector })
		if ('absent' in answer) absent.push({ selector, name: answer.absent })
		else if ('refusal' in answer) refusals.push(answer.refusal)
		else {
			files[fixtureNameOf({ kind: 'version', subject: selector })] = answer.raw
			versions[selector] = answer.version
		}
	}
	const checked = callsWithout({ calls: record.calls, absent })
	const commands = commandsOf({ root, record, calls: checked })
	const graphql = graphqlOf({ root, record, calls: checked })
	return {
		files: { ...files, ...commands.files, ...graphql.files },
		contract: { commands: commands.value, graphql: graphql.value },
		versions,
		checked,
		absent,
		refusals: [...refusals, ...commands.refusals, ...graphql.refusals],
	}
}

/** The calls without those of an absent part. */
function callsWithout(params: {
	calls: HostCallTable
	absent: readonly HostMissingPart[]
}): HostCallTable {
	const parts = new Set(
		params.absent.map(function selectorOf(part) {
			return part.selector
		}),
	)
	return Object.fromEntries(
		Object.entries(params.calls).filter(function isAsked([, spec]) {
			return !parts.has(spec.words[0] ?? '')
		}),
	)
}

/** The distinct command paths of the calls, sorted. */
function pathsOf(params: { calls: HostCallTable }): string[] {
	return [
		...new Set(
			Object.values(params.calls).map(function pathOfSpec(spec) {
				return commandPathOf({ words: spec.words })
			}),
		),
	].sort()
}

/** Each command path's help, and its field list when a call there asks fields, with the raw answers. */
function commandsOf(params: {
	root: string
	record: HostContractRecord
	calls: HostCallTable
}): HostReading<Record<string, HostContractCommand>> {
	const { root, record, calls } = params
	const specs = Object.values(calls)
	const commands: Record<string, HostContractCommand> = {}
	const files: Record<string, string> = {}
	const refusals: string[] = []
	for (const path of pathsOf({ calls })) {
		const words = wordsOfPath({ specs, path })
		const subject = words.join(HOST_FIXTURE_WORD_SEPARATOR)
		const help = record.describe.helpOf({ root, words })
		if ('refusal' in help) {
			refusals.push(help.refusal)
			continue
		}
		files[fixtureNameOf({ kind: 'help', subject })] = help.raw
		const fields = asksFields({ specs, path })
			? record.describe.fieldsOf?.({ root, words })
			: undefined
		if (fields && 'refusal' in fields) refusals.push(fields.refusal)
		else if (fields) files[fixtureNameOf({ kind: 'fields', subject })] = fields.raw
		commands[path] = {
			flags: help.flags,
			aliases: help.aliases,
			...(fields && !('refusal' in fields) ? { fields: fields.fields } : {}),
		}
	}
	return { value: commands, files, refusals }
}

/** The words of the first call at `path`. */
function wordsOfPath(params: { specs: readonly HostCallSpec[]; path: string }): readonly string[] {
	const spec = params.specs.find(function isAt(each) {
		return commandPathOf({ words: each.words }) === params.path
	})
	return spec?.words ?? []
}

/** Whether a call at `path` asks fields. */
function asksFields(params: { specs: readonly HostCallSpec[]; path: string }): boolean {
	return params.specs.some(function asks(spec) {
		return spec.fields !== undefined && commandPathOf({ words: spec.words }) === params.path
	})
}

/**
 * Every GraphQL type the calls' queries reach, introspected type by type from the root: a selection's parent type is
 * asked the first time it is reached (document order reaches a parent before its fields); sorted by name, with the raw
 * answers.
 */
function graphqlOf(params: {
	root: string
	record: HostContractRecord
	calls: HostCallTable
}): HostReading<Record<string, Record<string, HostGraphqlField>>> {
	const { root, record, calls } = params
	const types: Record<string, Record<string, HostGraphqlField>> = {}
	const files: Record<string, string> = {}
	const refusals: string[] = []
	const asked = new Set<string>()
	for (const spec of Object.values(calls)) {
		if (spec.graphql === undefined) continue
		const selections = selectionsOf({ query: spec.graphql })
		if ('refusal' in selections) {
			refusals.push(selections.refusal)
			continue
		}
		for (const selection of selections) {
			const parent = graphqlTypeAt({ graphql: types, path: selection.path })
			if (parent === undefined || asked.has(parent)) continue
			asked.add(parent)
			const answer = record.describe.typeOf({ root, name: parent })
			if ('refusal' in answer) {
				refusals.push(answer.refusal)
				continue
			}
			files[fixtureNameOf({ kind: 'type', subject: parent })] = answer.raw
			types[parent] = answer.fields
		}
	}
	const value = Object.fromEntries(
		Object.keys(types)
			.sort()
			.map(function entryOfType(name) {
				return [name, types[name] ?? {}]
			}),
	)
	return { value, files, refusals }
}

/** The fixture file of one describe call. */
function fixtureNameOf(params: { kind: keyof typeof HOST_FIXTURE_NAMES; subject: string }): string {
	return fillMessage({
		template: HOST_FIXTURE_NAMES[params.kind],
		values: { subject: params.subject },
	})
}

/** A path template filled with the vendor's name. */
function vendorPathOf(params: { template: string; name: string }): string {
	return fillMessage({ template: params.template, values: { name: params.name } })
}

/**
 * Each record's module written and formatted, the paths whose bytes changed; on a failed format every module written is
 * put back and the refresh refused.
 */
function writtenModulesOf(params: {
	root: string
	described: readonly { record: HostContractRecord; description: HostDescription }[]
	format: (params: FormatFilesParams) => boolean
}): { changed: string[] } | HostRefusal {
	const { root, described, format } = params
	const before = described.map(function previousOf({ record }) {
		const path = vendorPathOf({ template: HOST_RECORD_PATH, name: record.name })
		const file = join(root, path)
		return { path, file, text: existsSync(file) ? readFileSync(file, 'utf8') : undefined }
	})
	for (const [index, { record, description }] of described.entries()) {
		const target = before[index]
		if (!target) continue
		mkdirSync(dirname(target.file), { recursive: true })
		writeFileSync(target.file, moduleTextOf({ name: record.name, description }))
	}
	const formatted = format({
		root,
		files: before.map(function pathOf(target) {
			return target.path
		}),
	})
	if (!formatted) {
		for (const target of before) {
			if (target.text === undefined) rmSync(target.file, { force: true })
			else writeFileSync(target.file, target.text)
		}
		return {
			refusal: fillMessage({
				template: HOST_REFRESH_LINES.formatFailed,
				values: {
					path: before
						.map(function pathOf(target) {
							return target.path
						})
						.join(', '),
				},
			}),
		}
	}
	return {
		changed: before.flatMap(function changedPath(target) {
			return readFileSync(target.file, 'utf8') === target.text ? [] : [target.path]
		}),
	}
}

/** The record module's text, before formatting: the versions read and the contract, as typed constants. */
function moduleTextOf(params: { name: string; description: HostDescription }): string {
	const prefix = params.name.toUpperCase()
	const { versions, contract } = params.description
	return [
		...HOST_RECORD_HEADER,
		'',
		`export const ${prefix}${HOST_RECORD_EXPORTS.versions} = ${JSON.stringify(versions)} as const`,
		'',
		`export const ${prefix}${HOST_RECORD_EXPORTS.contract} = ${JSON.stringify(contract)} as const satisfies HostContract`,
		'',
	].join('\n')
}

/**
 * The fixtures folder made to hold exactly `files`: each written when its bytes differ, each other saved answer
 * removed; the paths changed.
 */
function writeFixtures(params: {
	root: string
	name: string
	files: Readonly<Record<string, string>>
}): string[] {
	const folder = vendorPathOf({ template: HOST_FIXTURES_PATH, name: params.name })
	const absolute = join(params.root, folder)
	mkdirSync(absolute, { recursive: true })
	const written = Object.entries(params.files).flatMap(function writeFixture([file, raw]) {
		const target = join(absolute, file)
		if (existsSync(target) && readFileSync(target, 'utf8') === raw) return []
		writeFileSync(target, raw)
		return [`${folder}/${file}`]
	})
	const removed = readdirSync(absolute).flatMap(function removeStale(file) {
		if (!file.endsWith(HOST_FIXTURE_EXTENSION) || Object.hasOwn(params.files, file)) return []
		rmSync(join(absolute, file))
		return [`${folder}/${file}`]
	})
	return [...written, ...removed]
}
