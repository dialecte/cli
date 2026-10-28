import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const PACKAGE_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const COMMANDS_ENTRY = new URL('../../cli.constants.ts', import.meta.url).href

/** A resolve hook that fails any import of the SDK, then imports `target`. */
function importWithoutSdk(target: string): { status: number | null; stderr: string } {
	const hook = `export async function resolve(specifier, context, next) {
		if (specifier.startsWith('@modelcontextprotocol/')) throw new Error('SDK resolved: ' + specifier)
		return next(specifier, context)
	}`
	const script = `import { register } from 'node:module'
register('data:text/javascript,' + encodeURIComponent(${JSON.stringify(hook)}))
await import(${JSON.stringify(target)})`
	const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
		cwd: PACKAGE_ROOT,
		encoding: 'utf8',
	})
	return { status: result.status, stderr: result.stderr }
}

describe('the SDK is loaded by `dialecte mcp` only', () => {
	it('the hook does fail an import of the SDK (control)', () => {
		const result = importWithoutSdk('@modelcontextprotocol/sdk/types.js')
		expect(result.status).not.toBe(0)
		expect(result.stderr).toContain('SDK resolved')
	})

	it('importing the commands the cli registers does not resolve the SDK', () => {
		const result = importWithoutSdk(COMMANDS_ENTRY)
		expect(result.stderr).not.toContain('SDK resolved')
		expect(result.status).toBe(0)
	})
})
