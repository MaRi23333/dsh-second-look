/** Client-safe subset of the host session.modelCatalog response. Never credentials. */
export interface ReviewerModel {
    id: string;
    name: string;
    reasoning?: {
        efforts: readonly {
            id: string;
            name: string;
        }[];
        defaultEffort?: string;
    };
}
export interface ReviewerCatalog {
    groups: readonly {
        id: string;
        name: string;
        models: readonly ReviewerModel[];
    }[];
    failures: readonly {
        id: string;
        name: string;
        message: string;
    }[];
}
export type ReviewerCatalogResult = {
    ok: true;
    value: ReviewerCatalog;
} | {
    ok: false;
};
/** A failed catalog must never clear or replace a saved custom model route. */
export declare function loadReviewerCatalog(remote: {
    session?: {
        modelCatalog(): Promise<{
            ok: boolean;
            value?: ReviewerCatalog;
        }>;
    };
}): Promise<ReviewerCatalogResult>;
//# sourceMappingURL=reviewer-catalog.d.ts.map