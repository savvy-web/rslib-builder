import type { ReactElement } from "react";
import styles from "./index.module.css";

/**
 * Props for the FeatureCard component.
 *
 * @public
 */
export interface FeatureCardProps {
	/** The card title. */
	title: string;
	/** The card description. */
	description: string;
}

/**
 * A card component for highlighting features in documentation pages.
 *
 * @public
 */
export function FeatureCard({ title, description }: FeatureCardProps): ReactElement {
	return (
		<div className={styles.card}>
			<div className={styles.title}>{title}</div>
			<div className={styles.description}>{description}</div>
		</div>
	);
}
