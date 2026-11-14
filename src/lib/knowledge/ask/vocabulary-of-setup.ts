import type { LoadedDialecte } from '../../schema/schema.types.ts'
import type { AskVocabulary, DialecteNames, VocabularyOfSetupParams } from './ask.types.ts'

/**
 * The names a question is parsed against, from what the ladder loaded: the dialectes' tags, the attributes of each
 * of their declarations and the values those attributes enumerate, the catalogue codes, and the api method paths.
 */
export function vocabularyOfSetup(params: VocabularyOfSetupParams): AskVocabulary {
	const { setup } = params
	const names = setup.dialectes.map((dialecte) => readDialecteNames({ dialecte }))
	const tags = new Set<string>(names.flatMap((entry) => entry.tags))
	const attributes = new Set<string>(names.flatMap((entry) => entry.attributes))
	const values = new Set<string>(names.flatMap((entry) => entry.values))
	const codes = new Set<string>([
		...setup.catalogues.errors.flatMap((catalogue) =>
			Object.values(catalogue.entries).map((entry) => entry.code),
		),
		...setup.catalogues.diagnostics.flatMap((catalogue) => Object.keys(catalogue.codes)),
	])
	const methods = new Set<string>(
		setup.apiIndexes.flatMap((entry) => entry.index.methods.map((method) => method.path)),
	)
	return {
		tags: [...tags],
		attributes: [...attributes],
		values: [...values],
		codes: [...codes],
		methods: [...methods],
	}
}

/** A dialecte's tags, the attributes of every declaration of each, and the values they enumerate. */
function readDialecteNames(params: { dialecte: LoadedDialecte }): DialecteNames {
	const { dialecte } = params
	const { definition, elements } = dialecte.config
	const tags: string[] = []
	const attributes: string[] = []
	const values: string[] = []
	for (const tag of elements) {
		tags.push(tag)
		const tagLevel = definition[tag]
		if (tagLevel === undefined) continue
		for (const entry of [tagLevel, ...Object.values(tagLevel.declarations ?? {})])
			for (const attribute of entry.attributes.sequence) {
				attributes.push(attribute)
				const datatype = entry.attributes.details[attribute]?.type
				values.push(...dialecte.readers.enumeratedValues(datatype))
			}
	}
	return { tags, attributes, values }
}
