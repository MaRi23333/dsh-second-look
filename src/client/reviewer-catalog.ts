/** Client-safe subset of the host session.modelCatalog response. Never credentials. */
export interface ReviewerModel {
  id: string
  name: string
  reasoning?: { efforts: readonly { id: string; name: string }[]; defaultEffort?: string }
}
export interface ReviewerCatalog {
  groups: readonly { id: string; name: string; models: readonly ReviewerModel[] }[]
  failures: readonly { id: string; name: string; message: string }[]
}
export type ReviewerCatalogResult = { ok: true; value: ReviewerCatalog } | { ok: false }

/** A failed catalog must never clear or replace a saved custom model route. */
export async function loadReviewerCatalog(remote: {
  session?: { modelCatalog(): Promise<{ ok: boolean; value?: ReviewerCatalog }> }
}): Promise<ReviewerCatalogResult> {
  try {
    const response = await remote.session?.modelCatalog()
    return response?.ok && response.value ? { ok: true, value: response.value } : { ok: false }
  } catch { return { ok: false } }
}
