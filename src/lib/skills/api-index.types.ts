import type { MethodEntry } from '../discover.types.ts'

/** A method of the package as the index lists it: its canonical route and the other roots it is on. */
export type IndexedMethod = {
	entry: MethodEntry
	otherRoutes: string[]
}
