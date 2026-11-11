/** A JSON object with no key (`{}`, ` { }`): a lot file that declares nothing. */
export function isEmptyDeclaration(text: string): boolean {
	try {
		const declaration: unknown = JSON.parse(text)
		return (
			typeof declaration === 'object' &&
			declaration !== null &&
			!Array.isArray(declaration) &&
			Object.keys(declaration).length === 0
		)
	} catch {
		// not JSON: it holds something the lot wrote, kept with the hand-over
		return false
	}
}
