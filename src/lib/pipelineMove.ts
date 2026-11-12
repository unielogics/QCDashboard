import type { api } from "./api";
import type { ApplicationProfile } from "./applicationProfile";
import {
  PIPELINE_LIFECYCLE,
  type PipelineMoveRequest,
  type PipelineMoveResult,
  type UnifiedSourceKind,
} from "./unifiedOperator";

export type PipelineMoveVariables = {
  sourceKind: UnifiedSourceKind;
  sourceId: string;
  body: PipelineMoveRequest;
};

export async function moveOperatorPipelineFile(
  apiCall: typeof api,
  { sourceKind, sourceId, body }: PipelineMoveVariables,
): Promise<PipelineMoveResult> {
  let expectedStatus = body.expected_status;
  if (expectedStatus == null) {
    // Board rows can be old or show a derived status before a profile exists.
    // Resolve immediately before the write to compare against canonical state.
    const profile = await apiCall<ApplicationProfile>("/application-profiles/resolve", {
      method: "POST",
      body: JSON.stringify({ source_kind: sourceKind, source_id: sourceId }),
    });
    expectedStatus = profile.underwriting_status;
    if (!PIPELINE_LIFECYCLE.some((item) => item.key === expectedStatus)) {
      throw new Error("The current file status could not be loaded. Refresh and try again.");
    }
  }

  // An explicit precondition belongs to the caller's fresh read. Never retry
  // a real concurrent change with a different expected status.
  return apiCall<PipelineMoveResult>(`/operator-files/${sourceKind}/${sourceId}/pipeline-move`, {
    method: "POST",
    body: JSON.stringify({ ...body, expected_status: expectedStatus }),
  });
}
