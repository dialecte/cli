/**
 * `dialecte health [--since <date|duration>] [--repository <name>] [--json]`: the findings of the health
 * rules across the stores the inbox reads. Reads files only, writes nothing, starts no process.
 */
import { tmpdir } from 'node:os'
import { basename, dirname } from 'node:path'

import { COMMAND_MAP } from '../lib/command-map/command-map.constants.ts'
import { renderCommandSection } from '../lib/command-map/render-help.ts'
import { collectFindings } from '../lib/health/collect-findings.ts'
import { readHealthRepository } from '../lib/health/read-health-context.ts'
import { readScratchFolders } from '../lib/health/read-scratch.ts'
import { renderFindings } from '../lib/health/render-findings.ts'
import { walkStores } from '../lib/health/walk-stores.ts'
import { JSON_FLAG } from '../lib/parse-invocation.constants.ts'
import { jsonOf, linesOf, printOut, textOf } from '../lib/print/print.ts'
import { isProcessAlive } from '../lib/process-alive.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import {
	DATE_PATTERN,
	DATE_TIME_PATTERN,
	DEFAULT_SINCE_MS,
	DURATION_PATTERN,
	DURATION_UNIT_MS,
	HEALTH_COMMAND,
	HEALTH_FLAGS,
	HEALTH_SINCE_REFUSAL,
	HEALTH_VALUE_OPTIONS,
	HEALTH_WORDS_REFUSAL,
} from './health.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { HealthFinding } from '../lib/health/health.types.ts'
import type { HealthJson, HealthParams } from './health.types.ts'

export async function run(argv: string[]): Promise<void> {
	const result = runHealth({ cwd: process.cwd(), argv })
	printOut({ stream: result.exitCode === 2 ? 'stderr' : 'stdout', text: result.output })
	if (result.exitCode !== 0) process.exit(result.exitCode)
}

/**
 * The findings of every rule over every store's repository and the temporary folder's scratch, red first, then newest
 * first. Exit 1 when a red finding exists, 0 otherwise, 2 for a usage error.
 */
export function runHealth(params: HealthParams): CommandResult {
	const json = params.argv.includes(JSON_FLAG)
	const read = readArguments({
		argv: params.argv,
		valueOptions: HEALTH_VALUE_OPTIONS,
		flags: HEALTH_FLAGS,
	})
	if (typeof read === 'string') return healthUsageExit({ reason: read, json })
	if (read.words.length > 0)
		return healthUsageExit({
			reason: HEALTH_WORDS_REFUSAL.replace('{words}', () => read.words.join(' ')),
			json,
		})
	const now = params.now ?? new Date()
	const sinceValue = read.values.get('since')
	const since =
		sinceValue === undefined
			? new Date(now.getTime() - DEFAULT_SINCE_MS)
			: parseSince({ value: sinceValue, now })
	if (since === undefined)
		return healthUsageExit({
			reason: HEALTH_SINCE_REFUSAL.replace('{value}', () => sinceValue ?? ''),
			json,
		})
	const wanted = read.values.get('repository')
	// a store that cannot be listed is left out, as the inbox leaves it out of its lots; with `--repository`, the
	// other repositories are not read (a repository's name is its folder's, the parent of its git common dir)
	const repositories = walkStores({ cwd: params.cwd, listPath: params.listPath })
		.flatMap((walked) => ('lotNames' in walked ? [dirname(walked.store)] : []))
		.filter((common) => wanted === undefined || basename(dirname(common)) === wanted)
		.map((common) => readHealthRepository({ common }))
	// the scratch folders belong to no repository: read only when no repository is asked for
	const scratch = wanted === undefined ? readScratchFolders({ tmp: params.tmp ?? tmpdir() }) : []
	const findings = collectFindings({
		repositories,
		scratch,
		window: { since, now },
		isAlive: params.isAlive ?? isProcessAlive,
	})
	const exitCode = findings.some((finding) => finding.severity === 'red') ? 1 : 0
	const sinceText = since.toISOString()
	if (json) return { exitCode, output: jsonOf(healthJsonOf({ since: sinceText, findings }), 2) }
	return { exitCode, output: textOf(renderFindings({ findings, since: sinceText })) }
}

/**
 * The window's start a `--since` names: `<n>h` or `<n>d` before now, a date (its midnight UTC) or a date and time with
 * its zone; undefined for anything else.
 */
function parseSince(params: { value: string; now: Date }): Date | undefined {
	const { value, now } = params
	const duration = DURATION_PATTERN.exec(value)
	if (duration !== null)
		return new Date(now.getTime() - Number(duration[1]) * DURATION_UNIT_MS[duration[2]])
	if (DATE_PATTERN.test(value)) {
		const midnight = new Date(`${value}T00:00:00.000Z`)
		// a day the month does not have (2026-02-30) reads as another day: refused
		return Number.isNaN(midnight.getTime()) || midnight.toISOString().slice(0, 10) !== value
			? undefined
			: midnight
	}
	if (!DATE_TIME_PATTERN.test(value)) return undefined
	const instant = new Date(value)
	return Number.isNaN(instant.getTime()) ? undefined : instant
}

/** `--json`: the window's start, the findings and how many are red and amber. */
function healthJsonOf(params: { since: string; findings: HealthFinding[] }): HealthJson {
	const red = params.findings.filter((finding) => finding.severity === 'red').length
	return {
		since: params.since,
		findings: params.findings,
		counts: { red, amber: params.findings.length - red },
	}
}

/** A usage error, exit 2: the reason and the health section; `{ error, usage, next: null }` with `--json`. */
function healthUsageExit(params: { reason: string; json: boolean }): CommandResult {
	const usage = renderCommandSection({ name: HEALTH_COMMAND, entry: COMMAND_MAP.health })
	if (params.json)
		return { exitCode: 2, output: jsonOf({ error: params.reason, usage, next: null }, 2) }
	return {
		exitCode: 2,
		output: textOf([`${HEALTH_COMMAND}: ${params.reason}`, '', ...linesOf(usage)]),
	}
}
