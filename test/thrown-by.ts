/** What `action` throws (undefined when it does not), for an assertion on the error's name and message. */
export function thrownBy(action: () => unknown): Error | undefined {
	try {
		action()
	} catch (error) {
		return error as Error
	}
	return undefined
}
