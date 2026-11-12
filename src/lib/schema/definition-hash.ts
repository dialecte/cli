import { createHash } from 'node:crypto'

import { stableJson } from '../stable-json.ts'
import { DEFINITION_HASH_PREFIX } from './schema.constants.ts'

import type { AnyDialecteConfig } from '@dialecte/core'

/**
 * The hash of what a dialecte's config says about its elements: `sha256:` and the 64 hex characters of the
 * stable JSON of its `definition`, `types` and `namespaces`; any other part of the config leaves it unchanged.
 *
 * @intent tell whether two builds of a dialecte define the same elements, identify a dialecte's definition
 */
export function definitionHash(params: { config: AnyDialecteConfig }): string {
	const { definition, types, namespaces } = params.config
	const digest = createHash('sha256')
		.update(stableJson({ definition, types, namespaces }))
		.digest('hex')
	return `${DEFINITION_HASH_PREFIX}${digest}`
}
