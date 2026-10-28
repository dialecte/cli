import { callTool } from './call-tool.ts'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { McpServerContext } from './mcp.types.ts'

const calls = vi.hoisted(() => ({ api: 0, loadDialectes: 0 }))

vi.mock('../../commands/api.ts', async function wrapApi(importOriginal) {
	const original = await importOriginal<typeof import('../../commands/api.ts')>()
	return {
		...original,
		runApi: function countedApi(params: Parameters<typeof original.runApi>[0]) {
			calls.api++
			return original.runApi(params)
		},
	}
})

vi.mock('../schema/load-dialectes.ts', async function wrapLoad(importOriginal) {
	const original = await importOriginal<typeof import('../schema/load-dialectes.ts')>()
	return {
		...original,
		loadDialectes: function countedLoad(params: Parameters<typeof original.loadDialectes>[0]) {
			calls.loadDialectes++
			return original.loadDialectes(params)
		},
	}
})

const context: McpServerContext = {
	serverCwd: process.cwd(),
	cliVersion: '0.2.0',
	dialecteRoot: undefined,
}

beforeEach(() => {
	calls.api = 0
	calls.loadDialectes = 0
})

describe('one run per call', () => {
	it('a failed api_find runs the command once', async () => {
		const result = await callTool({ name: 'api_find', input: { need: 'zzz' }, context })
		expect(result.isError).toBe(true)
		expect(calls.api).toBe(1)
	})

	it('a failed schema loads the dialectes once', async () => {
		const result = await callTool({ name: 'schema', input: { tag: 'Nope' }, context })
		expect(result.isError).toBe(true)
		expect(calls.loadDialectes).toBe(1)
	})
})
