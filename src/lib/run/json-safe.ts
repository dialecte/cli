import type { JsonSafe } from './run.types.ts'

/**
 * A value the outcome can carry as JSON: the value itself when it serializes, otherwise its text with
 * a note saying why (a cycle, a BigInt, ...), so `--json` never fails on what a script returned.
 */
export function toJsonSafe(params: { value: unknown }): JsonSafe {
	const { value } = params
	try {
		JSON.stringify(value)
		return { value }
	} catch (thrown) {
		const reason = thrown instanceof Error ? thrown.message : String(thrown)
		return { value: String(value), note: `not JSON (${reason.split('\n')[0]}), given as text` }
	}
}
