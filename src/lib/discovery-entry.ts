import { refsOf } from './binding-refs.ts'

import type { Binding } from './config.ts'

/** A self-contained entry that declares q/tx/doc/project, fed to `discoverMethods`. */
export function discoveryEntry(binding: Binding): string {
	const refs = refsOf(binding)
	return [
		...refs.imports,
		`declare const q: ${refs.query}`,
		`declare const tx: ${refs.transaction}`,
		`declare const doc: ${refs.nullary('Document')}`,
		`declare const project: ${refs.nullary('Project')}`,
		`export { q, tx, doc, project }`,
		'',
	].join('\n')
}
