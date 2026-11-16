import { aboutOf } from './parse-subject.ts'

import type { FactSubject } from '../facts/facts.types.ts'
import type { RequestSubjectOfParams } from './ask.types.ts'

/**
 * The subject an ask's fact is keyed by: the subject its record holds (a re-ask's rebuilt one), else the one its
 * request names (`--about`, `--code`, `--method`, `--package`).
 */
export function requestSubjectOf(params: RequestSubjectOfParams): FactSubject {
	const { request, recorded } = params
	if (recorded !== null) return recorded
	const about = aboutOf({ about: request.about ?? undefined })
	return {
		package: request.package,
		tags: about.tag === undefined ? [] : [about.tag],
		attributes: about.attribute === undefined ? [] : [about.attribute],
		codes: request.code === null ? [] : [request.code],
		methods: request.method === null ? [] : [request.method],
	}
}
