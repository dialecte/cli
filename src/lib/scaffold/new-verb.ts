/**
 * Scaffolds one extension verb of a dialecte package: `<name>.ts`, `<name>.types.ts` and
 * `<name>.test.ts` under `src/<version>/extensions/<namespace>/<query|transaction>/`, the export in that
 * folder's barrel, and - when the namespace or its kind is new - the namespace module and its
 * registration among the dialecte's extension modules.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { PLACEHOLDER_MARKER } from '../skills/api-index.constants.ts'
import { addImportLine, addObjectProperty } from './edit-module.ts'
import {
	EXTENSION_REGISTRY_PATTERN,
	KIND_SHAPES,
	ROOT_ELEMENT_PATTERN,
} from './new-verb.constants.ts'
import { renderTestFile, renderTypesFile, renderVerbFile } from './verb-files.ts'

import type { NewVerbParams, NewVerbResult } from './new-verb.types.ts'

/** The files written and edited, or why nothing was written. */
export function scaffoldVerb(params: NewVerbParams): NewVerbResult | string {
	const { root, version, namespace, kind, name } = params
	const extensionsFolder = `src/${version}/extensions`
	const namespaceFolder = `${extensionsFolder}/${kebabCase(namespace)}`
	const kindFolder = `${namespaceFolder}/${kind}`
	const file = kebabCase(name)
	const names = { ...params, file, rootElement: readRootElement({ root, version }) }
	const newFiles: Record<string, string> = {
		[`${kindFolder}/${file}.ts`]: renderVerbFile(names),
		[`${kindFolder}/${file}.types.ts`]: renderTypesFile(names),
		[`${kindFolder}/${file}.test.ts`]: renderTestFile(names),
	}
	const existing = Object.keys(newFiles).filter((path) => existsSync(join(root, path)))
	if (existing.length) return `already there: ${existing.join(', ')}`

	const edits: Record<string, string> = {}
	const barrel = `${kindFolder}/index.ts`
	const exportLine = `export { ${name} } from './${file}'\n`
	if (existsSync(join(root, barrel)))
		edits[barrel] = withLine({ text: readText({ root, path: barrel }), line: exportLine })
	else newFiles[barrel] = exportLine

	const group = `${namespace}${KIND_SHAPES[kind].group}`
	const groupImport = `import * as ${group} from './${kind}'`
	const groupProperty = `${KIND_SHAPES[kind].moduleKey}: ${group}`
	const namespaceModule = `${namespaceFolder}/index.ts`
	if (!existsSync(join(root, namespaceModule))) {
		newFiles[namespaceModule] =
			`${groupImport}\n\nexport const ${namespace} = {\n\t${groupProperty},\n}\n`
		const registry = `${extensionsFolder}/index.ts`
		if (!existsSync(join(root, registry))) return `no extension registry at ${registry}`
		const registered = addObjectProperty({
			source: addImportLine({
				source: readText({ root, path: registry }),
				line: `import { ${namespace} } from './${kebabCase(namespace)}'`,
			}),
			variableName: EXTENSION_REGISTRY_PATTERN,
			property: namespace,
		})
		if (registered === undefined) return `no *_EXTENSION_MODULES object in ${registry}`
		edits[registry] = registered
	} else if (!existsSync(join(root, barrel))) {
		const extended = addObjectProperty({
			source: addImportLine({
				source: readText({ root, path: namespaceModule }),
				line: groupImport,
			}),
			variableName: new RegExp(`^${namespace}$`),
			property: groupProperty,
		})
		if (extended === undefined)
			return `no \`export const ${namespace} = {...}\` in ${namespaceModule}`
		edits[namespaceModule] = extended
	}

	for (const [path, text] of Object.entries({ ...newFiles, ...edits })) {
		mkdirSync(dirname(join(root, path)), { recursive: true })
		writeFileSync(join(root, path), text)
	}
	return {
		written: Object.keys(newFiles).sort(),
		edited: Object.keys(edits).sort(),
	}
}

/** `path:line` of every placeholder left in the files, read as they are now (after formatting). */
export function findPlaceholders(params: { root: string; paths: readonly string[] }): string[] {
	return params.paths.flatMap((path) =>
		readText({ root: params.root, path })
			.split('\n')
			.flatMap((line, index) =>
				line.includes(PLACEHOLDER_MARKER) ? [`${path}:${index + 1}`] : [],
			),
	)
}

/** `line` appended on a line of its own, whether or not the text ends with a newline. */
function withLine(params: { text: string; line: string }): string {
	const { text, line } = params
	return text === '' || text.endsWith('\n') ? `${text}${line}` : `${text}\n${line}`
}

function readRootElement(params: { root: string; version: string }): string {
	const path = join(params.root, 'src', params.version, 'definition', 'constants.generated.ts')
	if (!existsSync(path)) return 'FILL_ROOT_ELEMENT'
	return ROOT_ELEMENT_PATTERN.exec(readFileSync(path, 'utf8'))?.[1] ?? 'FILL_ROOT_ELEMENT'
}

function readText(params: { root: string; path: string }): string {
	return readFileSync(join(params.root, params.path), 'utf8')
}

function kebabCase(name: string): string {
	return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}
