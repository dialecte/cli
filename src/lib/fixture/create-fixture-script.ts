import { XSI_TYPE_ATTRIBUTE } from './fixture.constants.ts'

import type { ElementRef, RunScript, RunScriptContext } from '../run/run.types.ts'
import type {
	FixtureAttribute,
	FixtureElement,
	FixturePlan,
	FixtureQuery,
	FixtureTransaction,
} from './fixture.types.ts'

/**
 * The plan as a `dialecte run` script: one transaction adds the planned elements down from the root with
 * `addChild` (an element of an abstract type naming its variant, with its planned text), then gives each required attribute the engine and the dialecte's hooks left empty its planned
 * value with `update` - what a hook fills (an id, a derived name) stays the hook's.
 */
export function createFixtureScript(params: { plan: FixturePlan }): RunScript {
	const { plan } = params
	return async function buildFixture(context: RunScriptContext): Promise<void> {
		const query = context.doc.query as unknown as FixtureQuery
		const root = await query.getRoot()
		await context.doc.transaction(
			async function addPlannedElements(transaction: unknown): Promise<void> {
				await buildElement({
					transaction: transaction as FixtureTransaction,
					record: root,
					element: plan.root,
				})
			},
			{ label: `fixture ${plan.tagName}` },
		)
	}
}

async function buildElement(params: {
	transaction: FixtureTransaction
	record: ElementRef
	element: FixtureElement
}): Promise<void> {
	const { transaction, record, element } = params
	await fillEmptyAttributes({ transaction, record, attributes: element.attributes })
	for (const child of element.children) {
		const added = await transaction.addChild(record, {
			tagName: child.tagName,
			attributes: child.xsiType ? { [XSI_TYPE_ATTRIBUTE]: child.xsiType } : {},
			...(child.text !== undefined && { value: child.text }),
		})
		await buildElement({ transaction, record: added, element: child })
	}
}

async function fillEmptyAttributes(params: {
	transaction: FixtureTransaction
	record: ElementRef
	attributes: readonly FixtureAttribute[]
}): Promise<void> {
	const { transaction, record } = params
	const empty: Record<string, string> = {}
	for (const { name, value } of params.attributes) {
		const current = await transaction.getAttribute(record, { name, defaults: 'none' })
		if (current === '' || current === undefined) empty[name] = value
	}
	if (Object.keys(empty).length) await transaction.update(record, { attributes: empty })
}
