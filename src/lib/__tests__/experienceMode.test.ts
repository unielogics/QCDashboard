// A client made by a file carries values the agent's CRM never writes. The
// client page must say something readable for each, never "undefined".
import { describe, expect, it } from "vitest";
import { deriveExperienceMode, experienceLockLabel, experienceReasonLabel } from "../experienceMode";

describe("why a client's experience mode is what it is", () => {
  it("names the reasons the CRM writes", () => {
    expect(experienceReasonLabel("agent_referred")).toBe("Agent-referred");
    expect(experienceReasonLabel("super_admin_override")).toBe("Super Admin override");
  });
  it("names the kind of file a client came from", () => {
    expect(experienceReasonLabel("dealer_ai_intake")).toBe("Opened from a dealer intake file");
    expect(experienceReasonLabel("foreclosure_rescue")).toBe("Opened from a foreclosure rescue file");
    expect(experienceReasonLabel("mca_funding_intake")).toBe("Opened from an MCA funding intake");
  });
  it("shows a reason it has no word for as written", () => {
    expect(experienceReasonLabel("calendar_conversion")).toBe("calendar conversion");
    expect(experienceReasonLabel("")).toBe("");
    expect(experienceReasonLabel(null)).toBe("");
  });
});

describe("who locked it", () => {
  it("names the firm, which is who locks a client made by a file", () => {
    expect(experienceLockLabel("firm")).toBe("the firm");
    expect(experienceLockLabel("client")).toBe("the client");
    expect(experienceLockLabel("funding_team")).toBe("Funding Team");
  });
  it("never prints undefined for a value it does not know", () => {
    expect(experienceLockLabel("regional_manager")).toBe("regional manager");
    expect(experienceLockLabel(undefined)).toBe("");
  });
});

describe("the mode a client is in", () => {
  it("is what was chosen, else follows whether an agent owns the client", () => {
    expect(deriveExperienceMode({ client_experience_mode: "guided", broker_id: null })).toBe("guided");
    expect(deriveExperienceMode({ client_experience_mode: null, broker_id: "broker-1" })).toBe("guided");
    expect(deriveExperienceMode({ client_experience_mode: null, broker_id: null })).toBe("self_directed");
  });
});
