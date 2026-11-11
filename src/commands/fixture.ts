/**
 * `dialecte fixture <Tag>` - the smallest valid XML document holding `<Tag>`, built by the installed
 * dialecte's engine: a `dialecte run` of a script that adds the chain of parents from the root (the
 * `--under` path, or the shortest one), every child required on the way and a valid value for every
 * required attribute the hooks leave empty, then exports the document. Ids are seeded and the clock frozen:
 * the same command gives the same bytes. Never hand-written XML: the hooks run as in real use.
 */
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

import { createFixtureScript } from '../lib/fixture/create-fixture-script.ts'
import { FIXTURE_NOW, FIXTURE_SEED } from '../lib/fixture/fixture.constants.ts'
import { planFixture } from '../lib/fixture/plan-fixture.ts'
import { readFixtureSchema } from '../lib/fixture/read-fixture-schema.ts'
import { jsonOf, textOf } from '../lib/print/print.ts'
import { runOutcomeLines } from '../lib/run/format-run-outcome.ts'
import { findDialecteEntry, loadRunEnvironment } from '../lib/run/load-run-environment.ts'
import { runScript } from '../lib/run/run-script.ts'
import { DEFAULT_RUN_TIMEOUT_IN_MILLISECONDS } from '../lib/run/run.constants.ts'
import { splitArguments } from '../lib/split-arguments.ts'
import {
	FIXTURE_BOOLEAN_FLAGS,
	FIXTURE_USAGE,
	FIXTURE_VALUE_FLAGS,
	XML_LINE_BREAK_PATTERN,
} from './fixture.constants.ts'
import { processOutput } from './process-output.ts'
import { EXIT_FAILED, EXIT_OK, EXIT_USAGE } from './run.constants.ts'

import type { FixtureDialecte } from '../lib/fixture/fixture.types.ts'
import type { RunEnvironment } from '../lib/run/run.types.ts'
import type { FixtureCommandParams, FixtureOptions } from './fixture.types.ts'

export async function run(argv: string[]): Promise<void> {
	const exitCode = await runFixtureCommand({
		argv,
		cwd: process.cwd(),
		output: processOutput(),
	})
	if (exitCode !== EXIT_OK) process.exit(exitCode)
}

/** Runs the command and answers its exit code: 0 the fixture, 1 no fixture (unknown tag, a failed build), 2 usage. */
export async function runFixtureCommand(params: FixtureCommandParams): Promise<number> {
	const { argv, cwd, output } = params
	const parsed = parseFixtureOptions({ argv })
	if (typeof parsed === 'string') {
		output.stderr(textOf([`fixture: ${parsed}`, FIXTURE_USAGE]))
		return EXIT_USAGE
	}
	const options = parsed

	let environment: RunEnvironment
	let dialecte: FixtureDialecte
	try {
		const packageName =
			options.packageName ??
			findDialecteEntry({
				projectDirectory: cwd,
				resolveFromProject: createRequire(join(cwd, 'package.json')),
			})
		environment = await loadRunEnvironment({ projectDirectory: cwd, packageName })
		dialecte = readFixtureSchema({ environment, packageName })
	} catch (thrown) {
		output.stderr(textOf([thrown instanceof Error ? thrown.message : String(thrown)]))
		return EXIT_USAGE
	}

	const planned = planFixture({ dialecte, tagName: options.tagName, under: options.under })
	if ('problem' in planned) {
		output.stdout(
			options.json
				? jsonOf({ ok: false, problem: planned.problem }, 2)
				: textOf([`fixture: ${planned.problem}`]),
		)
		return EXIT_FAILED
	}
	const { plan } = planned

	const script = createFixtureScript({ plan })
	const { outcome, file } = await runScript({
		loadScript: async function loadFixtureScript() {
			return script
		},
		environment,
		mode: 'commit',
		seed: FIXTURE_SEED,
		now: FIXTURE_NOW,
		exportDocument: true,
		timeoutInMilliseconds: DEFAULT_RUN_TIMEOUT_IN_MILLISECONDS,
	})
	if (!outcome.ok || !file) {
		output.stdout(
			options.json
				? jsonOf({ ok: false, outcome }, 2)
				: textOf([
						`fixture: the engine could not build ${plan.chain.join('/')}`,
						...runOutcomeLines({ outcome }),
					]),
		)
		return EXIT_FAILED
	}

	const xml = await file.text()
	const path = `/${plan.chain.join('/')}`
	const bytes = Buffer.byteLength(xml)
	const outPath = options.outPath === undefined ? undefined : resolve(cwd, options.outPath)
	if (outPath) writeFileSync(outPath, xml)

	if (options.json)
		output.stdout(
			jsonOf(
				{
					ok: true,
					packageName: dialecte.packageName,
					tag: plan.tagName,
					path,
					bytes,
					...(outPath ? { out: outPath } : { xml }),
				},
				2,
			),
		)
	else
		output.stdout(
			textOf(
				// the document the engine exported, printed line by line
				outPath
					? [`fixture: ${path} - ${bytes} bytes written to ${outPath}`]
					: xml.split(XML_LINE_BREAK_PATTERN),
			),
		)
	return EXIT_OK
}

/** The options, or what is wrong with the command line. */
export function parseFixtureOptions(params: { argv: string[] }): FixtureOptions | string {
	const split = splitArguments({
		argv: params.argv,
		valueFlags: FIXTURE_VALUE_FLAGS,
		booleanFlags: FIXTURE_BOOLEAN_FLAGS,
	})
	if (typeof split === 'string') return split
	const { positionals, values, flags } = split

	if (positionals.length !== 1) return 'name one tag'
	const underText = values.get('under')
	const under = underText?.split('/').filter((step) => step !== '')
	if (under?.length === 0) return '--under takes a path of tags, A/B'
	return {
		tagName: positionals[0],
		under,
		packageName: values.get('package'),
		outPath: values.get('out'),
		json: flags.has('json'),
	}
}
