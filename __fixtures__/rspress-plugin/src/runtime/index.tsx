import type { ReactElement } from "react";
import styles from "./styles.module.css";

/**
 * A test component.
 * @public
 */
export function MyComponent(): ReactElement {
	return <div className={styles.container}>Hello</div>;
}
