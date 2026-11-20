export const ELEMENT_GENERICS = [
	'Ref',
	'RawRecord',
	'TrackedRecord',
	'TreeRecord',
	'AttributesOf',
	'AttributesValueObjectOf',
	'FullAttributeObjectOf',
	'ChildrenOf',
	'ParentsOf',
	'DescendantsOf',
	'AncestorsOf',
	'ParentRelationship',
	'ChildRelationship',
	'Attribute',
	'QualifiedAttribute',
] as const

/** The probe of the full method surface, written only when method discovery succeeds. */
export const API_PROBE_FILE = 'coverage.api.generated.ts'
