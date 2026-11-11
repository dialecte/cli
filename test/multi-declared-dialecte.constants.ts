/** The tag declared two ways. */
export const MULTI_DECLARED_TAG = 'AAA_1'

/** The local name of the type `AAA_1` declares as its first way (default namespace). */
export const FIRST_DECLARATION_TYPE_NAME = 'tAAA_1A'
export const FIRST_DECLARATION_DOCUMENTATION = 'The plain way of declaring AAA_1.'

/** The local name of the type `AAA_1` declares as its second way (extension namespace, global). */
export const SECOND_DECLARATION_TYPE_NAME = 'tAAA_1B'
export const SECOND_DECLARATION_DOCUMENTATION = 'The extension way of declaring AAA_1.'

/** The values the second way's `bAAA_1` admits (its own: the tag level's `bAAA_1` has no enumeration); `x` is also admitted by `A`'s `bA`. */
export const SECOND_DECLARATION_ENUMERATION = ['p', 'q', 'x'] as const

/** The parent that holds `AAA_1` in both of its namespaces (unresolved), added to core's test dialecte. */
export const TWO_NAMESPACES_PARENT = 'AA_4'

/**
 * The parent that is a tag-level parent of `AAA_1` but names no declaration of it (a wildcard parent: any child
 * element, no `children.details.AAA_1`), added to core's test dialecte.
 */
export const WILDCARD_PARENT = 'AA_5'

/** The tag `AA_4` sits under, and copies its content from. */
export const TWO_NAMESPACES_PARENT_PARENT = 'A'
export const TWO_NAMESPACES_PARENT_MODEL = 'AA_1'
