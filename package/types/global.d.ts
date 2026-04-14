export {};

declare global {
	namespace NodeJS {
		interface ProcessEnv {
			/** The local path for the RSLib builder */
			RSLIB_BUILDER_LOCAL_PATH: string;
		}
	}
}
