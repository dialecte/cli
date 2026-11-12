import type { WrittenSizes } from './writing-fs.types.ts'
/**
 * A stand-in for `node:fs` that counts the bytes of each `writeSync` call (into `written.sizes`) while it is armed:
 * what a test of a write that must stay under one bound reads back. The real function always writes.
 */
import type * as NodeFs from 'node:fs'

/** The size of each buffer written while armed, in order. */
export const written: WrittenSizes = { armed: false, sizes: [] }

/** `actual` with its `writeSync` noting the size of each buffer into `written` while it is armed. */
export function writingFs(actual: typeof NodeFs): typeof NodeFs {
	function writingSync(...args: unknown[]): unknown {
		const [, buffer] = args
		if (written.armed && ArrayBuffer.isView(buffer)) written.sizes.push(buffer.byteLength)
		return Reflect.apply(actual.writeSync, undefined, args)
	}
	return { ...actual, writeSync: writingSync } as unknown as typeof NodeFs
}
