import type { AuthedApi } from "./worksheetApi";

export type DocumentAssociationAction = "accept" | "deny" | "reset";
export type DocumentAssociationStatus = "matched" | "unconfirmed" | "conflict" | "accepted" | "denied" | "stale";
export type DocumentAssociationEvent = { id: string; action: DocumentAssociationAction; reason: string; actor_id?: string | null; actor_name?: string | null; at: string; source_stamp: string; revision: number; stale?: boolean; identity_file_id?: string; content_hash?: string; analysis_id?: string | null; document_family_id?: string | null; document_version_number?: number | null };
export type DocumentAssociation = { file_id: string; file_name: string; content_hash: string | null; analysis_id: string | null; expected_entity: string; observed_entities: string[]; status: DocumentAssociationStatus; automatic_status?: DocumentAssociationStatus; allows_financial_use: boolean; document_accepted: boolean; source_stamp: string; can_review: boolean; current_decision: DocumentAssociationEvent | null; history: DocumentAssociationEvent[]; document_family_id?: string | null; document_version_number?: number | null; document_created_at?: string | null };
export type DocumentAssociations = { profile_id: string; revision: number; expected_entity: string; documents: DocumentAssociation[] };
export type DocumentAssociationDraft = { profileId: string; fileId: string; sourceStamp: string; revision: number; action: DocumentAssociationAction | null; reason: string; idempotencyKey: string };

export const documentAssociationLabel = (status: DocumentAssociationStatus) => ({ matched: "Business name matches", unconfirmed: "Business association unconfirmed", conflict: "Business name conflict", accepted: "Business association confirmed", denied: "Business association denied", stale: "Earlier association needs a new review" })[status];
export const readDocumentAssociations = (api: AuthedApi, profileId: string) => api<DocumentAssociations>(`/application-profiles/${encodeURIComponent(profileId)}/document-associations`);
export function associationDraftIsStale(draft: DocumentAssociationDraft, profileId: string, record: DocumentAssociation | undefined, revision: number) {
  return draft.profileId !== profileId || !record || draft.fileId !== record.file_id || draft.sourceStamp !== record.source_stamp || draft.revision !== revision;
}
export function saveDocumentAssociation(api: AuthedApi, profileId: string, record: DocumentAssociation, revision: number, draft: DocumentAssociationDraft) {
  if (associationDraftIsStale(draft, profileId, record, revision)) throw new Error("This document or another financial review changed. Start a new review against the current source.");
  if (!record.can_review || !record.content_hash || !/^[a-f0-9]{64}$/i.test(record.content_hash) || !/^[a-f0-9]{64}$/i.test(record.source_stamp) || !draft.action || draft.reason.trim().length < 8 || draft.reason.trim().length > 2000) throw new Error("An authorized current-source review, an explicit association decision, and a reason between eight and 2,000 characters are required.");
  return api<DocumentAssociations>(`/application-profiles/${encodeURIComponent(profileId)}/documents/${encodeURIComponent(record.file_id)}/association`, { method: "POST", body: JSON.stringify({ action: draft.action, reason: draft.reason.trim(), expected_revision: draft.revision, source_stamp: draft.sourceStamp, idempotency_key: draft.idempotencyKey }) });
}
