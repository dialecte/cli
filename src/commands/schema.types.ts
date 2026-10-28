import type { CommandOutput } from '../lib/command-output.types.ts'
import type { LoadedDialectes } from '../lib/schema/schema.types.ts'

/** The dialectes a schema lookup reads, or the answer that says why there are none to read. */
export type SchemaDialectesRead =
	| {
			kind: 'dialectes'
			tagName: string
			/** Those the `--package` filter keeps. */
			loaded: LoadedDialectes
			/** The package filter, when one was given. */
			packageName: string | undefined
			/** Every dialecte installed, filter or not. */
			installed: string[]
	  }
	| { kind: 'output'; output: CommandOutput }
