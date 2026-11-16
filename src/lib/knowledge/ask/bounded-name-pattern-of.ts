import { fillMessage } from '../standard/fill-message.ts'
import {
	BOUNDED_NAME_TEMPLATE,
	REGEX_SPECIAL_PATTERN,
	REGEX_SPECIAL_REPLACEMENT,
} from './ask.constants.ts'

/** A name met word-bounded (no letter, digit or underscore right before or after it), its pattern characters escaped. */
export function boundedNamePatternOf(params: { name: string; flags: string }): RegExp {
	const name = params.name.replace(REGEX_SPECIAL_PATTERN, REGEX_SPECIAL_REPLACEMENT)
	return new RegExp(
		fillMessage({ template: BOUNDED_NAME_TEMPLATE, values: { name } }),
		params.flags,
	)
}
