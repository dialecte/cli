/** A dependency a published package cannot carry: it names a folder on the publisher's machine. */
export type LocalDependency = {
	/** The package.json field that holds it (`dependencies`, `devDependencies`...). */
	field: string
	name: string
	/** The spec as written (`file:../core`). */
	spec: string
}
