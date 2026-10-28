import type { CoreModules, ElementRef, RunError, RunQuery, RunRecord } from './run.types.ts'

/**
 * What a thrown value says, as data: a structured error's code, key, detail, meta and the element it
 * is about as a path from the root - or, when there is no path, why (`pathNote`); any other error's
 * message alone.
 */
export async function describeRunError(params: {
	thrown: unknown
	core: CoreModules
	query: RunQuery
}): Promise<RunError> {
	const { thrown, core, query } = params
	const carried = core.toDialecteError(thrown)
	if (!carried) return { message: thrown instanceof Error ? thrown.message : String(thrown) }

	const { code, key, message, detail, ref, meta } = carried
	const described: RunError = { message, code, key, detail }
	if (ref) described.ref = ref
	if (meta) described.meta = meta

	if (!ref?.id) {
		described.pathNote = ref
			? `the error names a ${ref.tagName} but no element id`
			: 'the error names no element'
		return described
	}
	const path = await describeElementPath({ query, core, ref: { tagName: ref.tagName, id: ref.id } })
	if (path) described.path = path
	else
		described.pathNote = `no element ${ref.id} in the committed document (never committed, or deleted)`
	return described
}

/**
 * The element as an XPath-like path from the root: one step per ancestor, parent by parent, with the
 * position among same-tag siblings when there are several (`/Root/A/AA_2[2]`). A ref naming another
 * tag than the record holds is read under the record's own tag. Undefined when the element is not in
 * the document.
 */
export async function describeElementPath(params: {
	query: RunQuery
	core: CoreModules
	ref: ElementRef
}): Promise<string | undefined> {
	const { query, core } = params
	const steps: string[] = []
	let current = await readRecord({ query, core, ref: params.ref })
	if (!current) return undefined

	while (current) {
		const parent: RunRecord | undefined = current.parent
			? await readRecord({ query, core, ref: current.parent })
			: undefined
		const { tagName, id } = current
		const sameTag = parent?.children.filter((child) => child.tagName === tagName) ?? []
		const position = sameTag.findIndex((child) => child.id === id) + 1
		steps.unshift(sameTag.length > 1 ? `${tagName}[${position}]` : tagName)
		current = parent
	}
	return `/${steps.join('/')}`
}

/** The record by id; when the ref names another tag, read again under the tag the record holds. */
async function readRecord(params: {
	query: RunQuery
	core: CoreModules
	ref: ElementRef
}): Promise<RunRecord | undefined> {
	const { query, core, ref } = params
	try {
		return await query.any.getRecord(ref)
	} catch (thrown) {
		const mismatch = core.toDialecteError(thrown)
		const actualTagName = mismatch?.meta?.actualTagName
		if (mismatch?.key !== 'ELEMENT_TAGNAME_MISMATCH' || typeof actualTagName !== 'string')
			return undefined
		return readRecord({ query, core, ref: { tagName: actualTagName, id: ref.id } })
	}
}
