import type { ReactElement } from "react";
import styles from "./index.module.css";

/**
 * Props for the HelloBanner component.
 *
 * @public
 */
export interface HelloBannerProps {
	/** The message to display in the banner. */
	message?: string | undefined;
}

/**
 * A banner component injected at the top of every page by the hello plugin.
 *
 * @public
 */
export function HelloBanner({ message }: HelloBannerProps): ReactElement {
	return <div className={styles.banner}>{message ?? "Hello from @rspress/plugin runtime!"}</div>;
}
