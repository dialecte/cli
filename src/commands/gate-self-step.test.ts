/**
 * `dialecte gate` and its default `rules` step: the gate runs a step that starts with the word `dialecte` as the
 * cli that is running it, never as the `dialecte` a package has installed (or none). These cases spawn processes
 * and use git, in scratch packages.
 */
import { chmodSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createUnwiredPackage, parseGateJson, runGateWith } from '../../test/rule-gaps-unwired.ts'
import { createCounter } from '../../test/scratch-checks.ts'
import { HANDOVER_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { SELF_STEP_NOTE } from '../lib/gate/gate-config.constants.ts'
import { readCliVersion } from '../lib/read-cli-version.ts'

import { describe, expect, it } from 'vitest'

const INSTALLED_BIN_OUTPUT = 'installed bin'
const RULES_LINE_PATTERN = /^ok\s+rules\b/

/** The gate's output lines that report a passed `rules` step. */
function rulesLinesOf(output: string): string[] {
	return output.split('\n').filter(function isRulesLine(line) {
		return RULES_LINE_PATTERN.test(line)
	})
}

/** A package whose default steps are wired, and whose `node_modules/.bin/dialecte` prints a line and fails. */
function packageWithFakeInstalledCli(): string {
	const root = createUnwiredPackage({
		counter: createCounter(),
		scripts: ['check', 'skills:check'],
	})
	const bin = join(root, 'node_modules', '.bin', 'dialecte')
	writeFileSync(bin, `#!/bin/sh\necho '${INSTALLED_BIN_OUTPUT}'\nexit 1\n`)
	chmodSync(bin, 0o755)
	return root
}

describe(
	'gate: the default rules step runs the cli itself',
	{ timeout: HANDOVER_CASE_TIMEOUT },
	() => {
		it('gate --fast on a package with no dialecte in node_modules → exit 0, the rules step passed, the output names the cli version', async () => {
			const root = createUnwiredPackage({
				counter: createCounter(),
				scripts: ['check', 'skills:check'],
			})

			const result = await runGateWith({ cwd: root, argv: ['--fast'] })
			const jsonRun = await runGateWith({ cwd: root, argv: ['--fast', '--json', '--no-reuse'] })
			const rules = parseGateJson(jsonRun.output).steps.find((entry) => entry.step.name === 'rules')

			expect({
				exitCode: result.exitCode,
				rulesStatus: rules?.status,
				namesVersion: result.output.includes(readCliVersion()),
			}).toEqual({ exitCode: 0, rulesStatus: 'passed', namesVersion: true })
		})

		it('gate --fast → the passed rules line itself ends with the note of the cli version that ran it', async () => {
			const root = createUnwiredPackage({
				counter: createCounter(),
				scripts: ['check', 'skills:check'],
			})
			const versionNote = SELF_STEP_NOTE.replace('{version}', () => readCliVersion())

			const result = await runGateWith({ cwd: root, argv: ['--fast'] })
			const [rulesLine] = rulesLinesOf(result.output)

			expect({
				rulesLines: rulesLinesOf(result.output).length,
				endsWithVersionNote: rulesLine?.endsWith(versionNote),
			}).toEqual({ rulesLines: 1, endsWithVersionNote: true })
		})

		it('gate --fast on a package whose node_modules/.bin/dialecte prints a line and exits 1 → still exit 0, the installed bin never runs', async () => {
			const root = packageWithFakeInstalledCli()

			const result = await runGateWith({ cwd: root, argv: ['--fast'] })

			expect({
				exitCode: result.exitCode,
				installedBinShown: result.output.includes(INSTALLED_BIN_OUTPUT),
			}).toEqual({ exitCode: 0, installedBinShown: false })
		})
	},
)
