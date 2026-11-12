import { describe, expect, it, vi } from "vitest";
import { ApiError, type api } from "../api";
import { moveOperatorPipelineFile, type PipelineMoveVariables } from "../pipelineMove";

const source = { sourceKind: "intake", sourceId: "intake-123" } as const;
const result = {
  source_kind: "intake", source_id: source.sourceId, profile_id: "profile-123",
  underwriting_status: "in_underwriting", loan_id: "loan-123", loan_stage: "in_underwriting",
  created_loan: false, audit_id: null,
};

// Vitest's mock call signature erases generic return types. Retain api's
// signature for the callback while keeping its queued responses inspectable.
const mockApi = () => vi.fn<typeof api>() as ReturnType<typeof vi.fn<typeof api>> & typeof api;

describe("pipeline status moves", () => {
  it.each([undefined, null])("reads canonical state when the caller has no precondition (%s)", async (expectedStatus) => {
    const apiCall = mockApi()
      .mockResolvedValueOnce({ id: "profile-123", underwriting_status: "term_sheet_provided" })
      .mockResolvedValueOnce(result);
    const variables: PipelineMoveVariables = {
      ...source, body: { target_status: "in_underwriting", expected_status: expectedStatus },
    };

    await expect(moveOperatorPipelineFile(apiCall, variables)).resolves.toEqual(result);

    expect(apiCall.mock.calls).toEqual([
      ["/application-profiles/resolve", {
        method: "POST", body: JSON.stringify({ source_kind: "intake", source_id: source.sourceId }),
      }],
      [`/operator-files/intake/${source.sourceId}/pipeline-move`, {
        method: "POST", body: JSON.stringify({ target_status: "in_underwriting", expected_status: "term_sheet_provided" }),
      }],
    ]);
    expect(variables.body.expected_status).toBe(expectedStatus);
  });

  it("preserves the caller's explicit precondition and all approval fields", async () => {
    const apiCall = mockApi().mockResolvedValue(result);
    const body = Object.freeze({
      target_status: "approved", expected_status: "term_sheet_provided",
      approved_amount: 250000, approved_dscr: 1.31, note: "Committee approval",
    } as const);

    await moveOperatorPipelineFile(apiCall, { ...source, body });

    expect(apiCall).toHaveBeenCalledExactlyOnceWith(`/operator-files/intake/${source.sourceId}/pipeline-move`, {
      method: "POST", body: JSON.stringify(body),
    });
  });

  it("does not retry or overwrite a concurrent status change", async () => {
    const conflict = new ApiError(409, "File moved to approved; refresh and try again");
    const apiCall = mockApi()
      .mockResolvedValueOnce({ id: "profile-123", underwriting_status: "collecting_docs" })
      .mockRejectedValueOnce(conflict);

    await expect(moveOperatorPipelineFile(apiCall, { ...source, body: { target_status: "in_underwriting" } }))
      .rejects.toBe(conflict);

    expect(apiCall).toHaveBeenCalledTimes(2);
  });

  it("does not send a move if the canonical read fails", async () => {
    const failure = new ApiError(403, "File access denied");
    const apiCall = mockApi().mockRejectedValueOnce(failure);

    await expect(moveOperatorPipelineFile(apiCall, { ...source, body: { target_status: "in_underwriting" } }))
      .rejects.toBe(failure);

    expect(apiCall).toHaveBeenCalledTimes(1);
  });

  it("does not send an unguarded move if the canonical status is invalid", async () => {
    const apiCall = mockApi().mockResolvedValueOnce({ id: "profile-123", underwriting_status: null });

    await expect(moveOperatorPipelineFile(apiCall, { ...source, body: { target_status: "in_underwriting" } }))
      .rejects.toThrow("The current file status could not be loaded");

    expect(apiCall).toHaveBeenCalledTimes(1);
  });
});
