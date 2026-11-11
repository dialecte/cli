import type { CountedStats } from './counting-fs.types.ts'
/**
 * A stand-in for `node:fs` that counts the paths asked of `statSync` and `lstatSync` (into `paths`) and of
 * `readFileSync` (into `reads`) while it is armed: what a test of a loop that must not touch every file of a folder
 * reads back. The real function always answers.
 */
import type * as NodeFs from 'node:fs'

/** The paths stat or read while armed, in order. */
export const counted: CountedStats = { armed: false, paths: [], reads: [] }

/** `actual` with its stat and read functions counting their paths into `counted` while it is armed. */
export function countingFs(actual: typeof NodeFs): typeof NodeFs {
	return {
		...actual,
		statSync: countingOf({ real: actual.statSync, into: counted.paths }),
		lstatSync: countingOf({ real: actual.lstatSync, into: counted.paths }),
		readFileSync: countingOf({ real: actual.readFileSync, into: counted.reads }),
	} as typeof NodeFs
}

function countingOf<Real extends (...args: never[]) => unknown>(params: {
	real: Real
	into: string[]
}): Real {
	function counting(...args: unknown[]): unknown {
		if (counted.armed) params.into.push(String(args[0]))
		return Reflect.apply(params.real, undefined, args)
	}
	return counting as unknown as Real
}
