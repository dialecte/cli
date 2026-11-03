import type { Binding } from '../config.ts'

/** A dialecte installed in an app, bound the way the lookups read it: namespace name and the entry exporting it. */
export type InstalledBinding = {
	packageName: string
	/** The export subpath (`v2019C1`). */
	version: string
	binding: Binding
}

/** Which installed dialecte a lookup reads, or why none. */
export type InstalledBindingChoice =
	| { kind: 'binding'; binding: InstalledBinding }
	/** Several match, none matches, or none is installed: what to print, exit 2. */
	| { kind: 'output'; message: string }
