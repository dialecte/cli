/** A dialecte module's catalogues, in the shapes `defineErrors` and a diagnostic catalogue have. */
export const WIDGET_ERRORS = {
	NAME_TAKEN: {
		key: 'NAME_TAKEN',
		code: 'W1001',
		message: 'The name is already taken',
		explanation: { when: 'A sibling holds the name', fix: 'Pick another name' },
	},
}

export const WIDGET_IMPORT_DIAGNOSTICS = {
	source: 'widget',
	codes: {
		'unresolved-reference': {
			severity: 'warning',
			family: 'reference',
			message: 'A reference names an element the file does not hold',
			explanation: {
				when: 'The path a reference holds names no element of the file',
				fix: 'Import the file that holds the element',
				docs: 'https://example.test/widget/references',
			},
		},
	},
}

export const NOT_A_CATALOGUE = { source: 42 }
