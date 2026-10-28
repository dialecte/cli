import { answerModels } from './answer-models.ts'

import { describe, expect, it } from 'vitest'

describe('answerModels', () => {
	it('vendor openai -> standard Sol, strong Sol (high), frontier Astra', () => {
		const { output, exitCode } = answerModels({ vendor: 'openai', json: false })

		expect(exitCode).toBe(0)
		expect(output).toMatch(/^standard {2}Sol$/m)
		expect(output).toMatch(/^strong {4}Sol \(high\)$/m)
		expect(output).toMatch(/^frontier {2}Astra$/m)
		expect(output).toContain('checked 2026-10-28')
		expect(output).toMatch(/^fast {6}search and locate/m)
	})

	it('unknown vendor -> exit 1 with the known ids', () => {
		const { output, exitCode } = answerModels({ vendor: 'acme', json: false })

		expect(exitCode).toBe(1)
		expect(output).toContain('unknown vendor "acme"')
		expect(output).toContain('anthropic, openai, google')
	})

	it('no vendor known -> exit 2 with the command to set it', () => {
		const { output, exitCode } = answerModels({ vendor: undefined, json: false })

		expect(exitCode).toBe(2)
		expect(output).toContain('dialecte skills sync --vendor')
	})

	it('--json -> the tiers, the date and the definitions as data', () => {
		const { output } = answerModels({ vendor: 'google', json: true })
		const parsed = JSON.parse(output)

		expect(parsed.vendor).toBe('google')
		expect(parsed.checkedAt).toBe('2026-10-28')
		expect(parsed.tiers.strong).toEqual({ model: 'Pro' })
		expect(parsed.note).toContain('flagship')
		expect(Object.keys(parsed.definitions)).toEqual(['fast', 'standard', 'strong', 'frontier'])
	})

	it('the tier definitions: one review agent for both passes, no split review', () => {
		const { definitions } = JSON.parse(answerModels({ vendor: 'anthropic', json: true }).output)

		expect(definitions.strong).toContain('the review (one agent, both passes)')
		expect(definitions.fast).toContain('does file X say Y')
		expect(definitions.standard).toContain('independent readers of a standard')
		expect(Object.values(definitions).join(' ')).not.toMatch(/pass 1|pass 2/)
	})
})
