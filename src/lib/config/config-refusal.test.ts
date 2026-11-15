/** The refusal of the config readers: one line per finding, the findings kept as given. */
import { ConfigRefusal } from './config-refusal.ts'

import { describe, expect, it } from 'vitest'

import type { ConfigFinding } from './config.types.ts'

describe('ConfigRefusal', () => {
	it('two findings → one line joined by "; ", findings kept as given, named ConfigRefusal', () => {
		const findings: ConfigFinding[] = [
			{ file: '/r/package.json', line: 4, key: 'dialecte.gate', problem: 'move it to .dialecterc' },
			{ file: '/r/.dialecterc', line: 2, key: 'editor', problem: 'a personal key' },
		]

		const refusal = new ConfigRefusal(findings)

		expect({ name: refusal.name, message: refusal.message, findings: refusal.findings }).toEqual({
			name: 'ConfigRefusal',
			message:
				'/r/package.json:4: dialecte.gate: move it to .dialecterc; /r/.dialecterc:2: editor: a personal key',
			findings,
		})
	})

	it('a keyless finding prints file:line: problem, never "undefined"', () => {
		const findings: ConfigFinding[] = [
			{ file: '/r/.dialecterc', line: 3, problem: 'is not valid YAML' },
			{ file: '/r/.dialecterc', line: 2, key: 'editor', problem: 'a personal key' },
		]

		expect(new ConfigRefusal(findings).message).toEqual(
			'/r/.dialecterc:3: is not valid YAML; /r/.dialecterc:2: editor: a personal key',
		)
	})
})
