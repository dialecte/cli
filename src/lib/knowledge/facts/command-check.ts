/** The check the `facts` command applies to valid facts (D13): standard sources by their files key, schema sources by the definition hash. */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { definitionHash } from '../../schema/definition-hash.ts'
import { loadDialectes } from '../../schema/load-dialectes.ts'
import { fillMessage } from '../standard/fill-message.ts'
import { readStandardInput } from '../standard/read-standard-input.ts'
import { standardFolderFilesKey } from '../standard/standard-files-key.ts'
import {
	CHECK_REASON_SEPARATOR,
	CHECK_REASONS,
	PACKAGE_MANIFEST,
	SCHEMA_SOURCE_KIND,
	SCHEMAS_NOT_LOADED,
} from './facts.constants.ts'

import type {
	CheckOutcome,
	DialectesLoader,
	FactCheck,
	FactCheckParams,
	FactSource,
	InstalledSchemas,
	StandardFilesKeyNow,
} from './facts.types.ts'

/**
 * The check for the environment and folder a command runs in. A fact is stale when one of its sources moved, else
 * unverifiable when one cannot be compared, else valid; a stale or unverifiable outcome says why and the fix. A
 * standard source is compared with the standard folder's current files key (no standard configured, or its folder
 * gone: unverifiable); a schema source with the installed dialecte's definition hash (no `package.json` in the
 * folder, a load failure, or the package not installed: unverifiable). Any other source keeps the fact as stored.
 * It never fails on the folder: a load failure is kept as the reason of every schema source. The dialectes are not
 * loaded when the loader is `null` (the facts read hold no schema source).
 */
export async function factCheckOf(params: FactCheckParams): Promise<FactCheck> {
	const { environment, cwd } = params
	const schemas =
		params.loadDialectes === null
			? SCHEMAS_NOT_LOADED
			: await installedSchemasOf({ cwd, load: params.loadDialectes ?? loadDialectes })
	const filesKeys = new Map<string, StandardFilesKeyNow>()
	function filesKeyOf(standardId: string): StandardFilesKeyNow {
		const known = filesKeys.get(standardId)
		if (known !== undefined) return known
		const found = currentFilesKey({ environment, standardId })
		filesKeys.set(standardId, found)
		return found
	}
	return function commandCheck({ fact }): CheckOutcome {
		const outcomes = fact.sources.map(function outcomeOfSource(source) {
			return sourceOutcomeOf({ source, schemas, filesKeyOf, cwd })
		})
		const state = worstStateOf({ outcomes })
		if (state === 'valid') return { state }
		const reasons = outcomes.flatMap(function reasonOfOutcome(outcome) {
			return outcome.state === state && outcome.reason !== undefined ? [outcome.reason] : []
		})
		return { state, reason: reasons.join(CHECK_REASON_SEPARATOR) }
	}
}

/** Stale when a source moved, else unverifiable when one cannot be compared, else valid. */
function worstStateOf(params: { outcomes: CheckOutcome[] }): CheckOutcome['state'] {
	const states = params.outcomes.map((outcome) => outcome.state)
	if (states.includes('stale')) return 'stale'
	return states.includes('unverifiable') ? 'unverifiable' : 'valid'
}

/**
 * The dialectes installed in the folder; none, with the reason, when the load fails: no `package.json` in the
 * folder, else the load's error.
 */
async function installedSchemasOf(params: {
	cwd: string
	load: DialectesLoader
}): Promise<InstalledSchemas> {
	const { cwd } = params
	try {
		const loaded = await params.load({ cwd })
		return {
			kind: 'loaded',
			hashes: new Map(
				loaded.dialectes.map((dialecte) => [
					dialecte.packageName,
					definitionHash({ config: dialecte.config }),
				]),
			),
			skipped: new Map(loaded.skipped.map((skip) => [skip.packageName, skip.reason])),
		}
	} catch (error) {
		if (!existsSync(join(cwd, PACKAGE_MANIFEST)))
			return { kind: 'none', template: CHECK_REASONS.noPackage, message: '' }
		return {
			kind: 'none',
			template: CHECK_REASONS.loadFailed,
			message: error instanceof Error ? error.message : String(error),
		}
	}
}

/** What one source says now: moved (stale), not comparable (unverifiable), or holding (valid); why when not valid. */
function sourceOutcomeOf(params: {
	source: FactSource
	schemas: InstalledSchemas
	filesKeyOf: (standardId: string) => StandardFilesKeyNow
	cwd: string
}): CheckOutcome {
	const { source } = params
	if (source.kind === 'standard') {
		if (typeof source.standard !== 'string')
			return malformed({ kind: source.kind, member: 'standard' })
		return standardOutcomeOf({
			standard: source.standard,
			recorded: source.files,
			current: params.filesKeyOf(source.standard),
		})
	}
	if (source.kind === SCHEMA_SOURCE_KIND) {
		if (typeof source.package !== 'string')
			return malformed({ kind: source.kind, member: 'package' })
		return schemaOutcomeOf({
			packageName: source.package,
			recorded: source.definitionHash,
			schemas: params.schemas,
			cwd: params.cwd,
		})
	}
	// a Dialecte or outside source is re-checked by the answer ladder, not here: the fact keeps its stored state
	return { state: 'valid' }
}

/** A standard source against the standard folder's files key now. */
function standardOutcomeOf(params: {
	standard: string
	recorded: unknown
	current: StandardFilesKeyNow
}): CheckOutcome {
	const { standard, current } = params
	// a refused root names its own fix (the expected layout, R4-7); any other refusal names the root to set
	if (current.kind === 'none')
		return {
			state: 'unverifiable',
			reason:
				current.layout === undefined
					? fillMessage({
							template: CHECK_REASONS.standardNotComparable,
							values: { standard, message: current.message },
						})
					: fillMessage({
							template: CHECK_REASONS.standardRootRefused,
							values: { standard, message: current.message, layout: current.layout },
						}),
		}
	if (current.key === params.recorded) return { state: 'valid' }
	return {
		state: 'stale',
		reason: fillMessage({ template: CHECK_REASONS.standardChanged, values: { standard } }),
	}
}

/** A schema source against the installed dialecte's definition hash. */
function schemaOutcomeOf(params: {
	packageName: string
	recorded: unknown
	schemas: InstalledSchemas
	cwd: string
}): CheckOutcome {
	const { packageName, schemas, cwd } = params
	if (schemas.kind === 'none')
		return {
			state: 'unverifiable',
			reason: fillMessage({
				template: schemas.template,
				values: { package: packageName, cwd, message: schemas.message },
			}),
		}
	const current = schemas.hashes.get(packageName)
	if (current === undefined) {
		const skipped = schemas.skipped.get(packageName)
		return {
			state: 'unverifiable',
			reason:
				skipped === undefined
					? fillMessage({
							template: CHECK_REASONS.schemaNotInstalled,
							values: { package: packageName, cwd },
						})
					: fillMessage({
							template: CHECK_REASONS.schemaSkipped,
							values: { package: packageName, message: skipped },
						}),
		}
	}
	if (current === params.recorded) return { state: 'valid' }
	return {
		state: 'stale',
		reason: fillMessage({
			template: CHECK_REASONS.schemaChanged,
			values: { package: packageName },
		}),
	}
}

/** A source missing the member it is compared by: unverifiable, the fix named. */
function malformed(params: { kind: string; member: string }): CheckOutcome {
	return {
		state: 'unverifiable',
		reason: fillMessage({ template: CHECK_REASONS.sourceMalformed, values: params }),
	}
}

/** The files key of a standard folder now; why not when no standard is configured or the folder is gone. */
function currentFilesKey(params: {
	environment: NodeJS.ProcessEnv
	standardId: string
}): StandardFilesKeyNow {
	const input = readStandardInput({
		environment: params.environment,
		standardId: params.standardId,
	})
	if (input.kind === 'refused')
		return input.layout === undefined
			? { kind: 'none', message: input.message }
			: { kind: 'none', message: input.message, layout: input.layout }
	const [standard] = input.input.selected
	return standard === undefined
		? {
				kind: 'none',
				message: fillMessage({
					template: CHECK_REASONS.noStandardFolder,
					values: { standard: params.standardId },
				}),
			}
		: { kind: 'key', key: standardFolderFilesKey({ standard }) }
}
