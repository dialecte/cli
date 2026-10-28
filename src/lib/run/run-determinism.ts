import type { CoreModules } from './run.types.ts'

/**
 * Make a run repeatable: ids from core's seeded generator in place of `crypto.randomUUID`, and, when
 * `now` is given, a clock frozen at that instant (`Date.now()`, `new Date()`). Answers the function that
 * puts the real ones back.
 */
export function installDeterminism(params: {
	core: CoreModules
	seed: number
	now?: Date
}): () => void {
	const { core, seed, now } = params
	const originalRandomUuid = globalThis.crypto.randomUUID
	const originalDate = globalThis.Date
	globalThis.crypto.randomUUID = core.createSeededRandomUuid({
		seed,
	}) as typeof globalThis.crypto.randomUUID
	if (now) globalThis.Date = createFrozenDate({ instant: now.getTime(), RealDate: originalDate })

	return function restoreDeterminism(): void {
		globalThis.crypto.randomUUID = originalRandomUuid
		globalThis.Date = originalDate
	}
}

/** A `Date` whose clock stands still: no argument means the frozen instant; any other form is the real one. */
function createFrozenDate(params: { instant: number; RealDate: DateConstructor }): DateConstructor {
	const { instant, RealDate } = params

	function FrozenDate(this: unknown, ...dateArguments: unknown[]): Date | string {
		if (!new.target) return new RealDate(instant).toString()
		if (dateArguments.length === 0) return new RealDate(instant)
		return new (RealDate as unknown as new (...values: unknown[]) => Date)(...dateArguments)
	}
	FrozenDate.prototype = RealDate.prototype
	FrozenDate.now = function frozenNow(): number {
		return instant
	}
	FrozenDate.parse = RealDate.parse
	FrozenDate.UTC = RealDate.UTC
	return FrozenDate as unknown as DateConstructor
}
