import { VALUE_CHOICE_LIMIT } from './fixture.constants.ts'
import { acceptsValue, datatypeValues } from './sample-datatype.ts'

import type {
	CoreReaders,
	SchemaConfig,
	SchemaDataType,
	SchemaElementDefinition,
	SchemaRecord,
} from '../schema/schema.types.ts'
import type { SampleResult, ValuesResult } from './fixture.types.ts'

/**
 * The valid values of an attribute of the record, read through core's readers for the record as it is typed
 * (a variant named with xsi:type keeps its own rules): its fixed value alone, else its default alone, else
 * the values its type admits (`datatypeValues`). The problem names the attribute.
 */
export function attributeValues(params: {
	config: SchemaConfig
	readers: CoreReaders
	record: SchemaRecord
	attributeName: string
	datatype: SchemaDataType | undefined
}): ValuesResult {
	const { config, readers, record, attributeName, datatype } = params
	const rules = readers.getAttributeRules({ dialecteConfig: config, record, attributeName })
	if (rules.fixed !== undefined) return { values: [rules.fixed] }
	if (rules.default !== undefined) return { values: [rules.default] }
	const offered = datatypeValues({
		readers,
		datatype,
		tagName: record.tagName,
		limit: VALUE_CHOICE_LIMIT,
	})
	return 'problem' in offered
		? { problem: `no value for ${record.tagName}@${attributeName}: ${offered.problem}` }
		: offered
}

/** The first valid value of an attribute (`attributeValues`). */
export function sampleAttributeValue(params: {
	config: SchemaConfig
	readers: CoreReaders
	record: SchemaRecord
	attributeName: string
	datatype: SchemaDataType | undefined
}): SampleResult {
	const offered = attributeValues(params)
	return 'problem' in offered ? offered : { value: offered.values[0] }
}

/**
 * The values of the element's text, when it must have one: its fixed text alone, else its default alone,
 * else - typed text that an empty value does not satisfy - the values its type admits. Undefined when the
 * element holds no text, untyped (mixed) text, or text an empty value satisfies.
 */
export function textValues(params: {
	readers: CoreReaders
	definition: SchemaElementDefinition
}): ValuesResult | undefined {
	const { readers, definition } = params
	const { textContent } = definition
	if (textContent === undefined) return undefined
	if (textContent.fixed !== undefined) return { values: [textContent.fixed] }
	if (textContent.default !== undefined) return { values: [textContent.default] }
	const datatype = textContent.type
	if (datatype === undefined || acceptsValue({ readers, datatype, value: '' })) return undefined
	const offered = datatypeValues({
		readers,
		datatype,
		tagName: definition.tag,
		limit: VALUE_CHOICE_LIMIT,
	})
	return 'problem' in offered
		? { problem: `no text for ${definition.tag}: ${offered.problem}` }
		: offered
}
