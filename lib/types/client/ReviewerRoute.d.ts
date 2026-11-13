import type { ReviewerCatalog } from './reviewer-catalog.js';
import type { SettingsKey } from './settings-locales.js';
export interface ReviewerRouteValue {
    provider: string;
    model: string;
    effort: string;
}
export interface ReviewerRouteProps {
    id: string;
    value: ReviewerRouteValue;
    inherited?: ReviewerRouteValue;
    catalog: ReviewerCatalog | null;
    disabled: boolean;
    t: (key: SettingsKey) => string;
    onChange: (value: ReviewerRouteValue) => void;
}
/** Unknown saved routes remain visible and editable even when discovery fails. */
export declare function ReviewerRoute({ id, value, inherited, catalog, disabled, t, onChange }: ReviewerRouteProps): import("react/jsx-runtime").JSX.Element;
export declare function reasoningLabel(id: string, t: (key: SettingsKey) => string, fallback?: string): string;
//# sourceMappingURL=ReviewerRoute.d.ts.map