/** Adds an AA_2 under the A of core's test dialecte and answers its id. */
type Ref = { tagName: string; id: string }
type Context = {
	doc: {
		query: {
			findByAttributes(params: {
				tagName: string
				attributes: Record<string, string>
			}): Promise<Ref[]>
		}
		transaction<Result>(
			callback: (tx: {
				addChild(
					parent: Ref,
					child: { tagName: string; attributes: Record<string, string> },
				): Promise<Ref>
			}) => Promise<Result>,
			options?: { label?: string },
		): Promise<Result>
	}
}

export default async function addAa2({ doc }: Context): Promise<string> {
	const [assembly] = await doc.query.findByAttributes({ tagName: 'A', attributes: { aA: 'A' } })
	return doc.transaction(
		async (tx) => {
			const added = await tx.addChild(assembly, { tagName: 'AA_2', attributes: { aAA_2: '7' } })
			return added.id
		},
		{ label: 'add AA_2' },
	)
}
