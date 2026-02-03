/**
 * Module with intentionally invalid TSDoc comments for lint testing.
 *
 * @packageDocumentation
 */

/**
 * This function has an unknown TSDoc tag.
 *
 * @invalidTag This tag does not exist in TSDoc
 * @param value - Some value
 * @returns The value unchanged
 *
 * @public
 */
export function badDocFunction(value: string): string {
	return value;
}

/**
 * This function references a non-existent parameter.
 *
 * @param nonExistentParam - This parameter doesn't exist in the signature
 * @returns Nothing
 *
 * @public
 */
export function missingParamDoc(): void {
	// Empty function
}
