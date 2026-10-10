import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearPendingCapitalReadinessHandoff,
  readCapitalReadinessHandoffFragment,
  readPendingCapitalReadinessHandoff,
  storePendingCapitalReadinessHandoff,
  toCapitalReadinessIntakePrefill,
} from "@/lib/capitalReadinessHandoff";

const payload = {
  version: 1,
  source: "capital_readiness_diagnostic",
  locale: "es",
  answers: {
    businessType: "dealer",
    years: "over_2",
    revenue: "1200000",
    grossProfit: "180000",
    netIncome: "60000",
    revenueTrend: "stable",
    debtBurden: "under_10",
    cashRunway: "two_three",
    credit: "fair",
    records: "current",
    bankingBehavior: "clean",
    collateral: "some",
    fundingPurpose: "working_capital",
    propertyDebtService: "",
    occupancy: "",
  },
  result: {
    band: "three_six",
    score: 72,
    coverage: 88,
    grossMargin: 15,
    netMargin: 5,
    propertyDscr: null,
    occupancy: null,
  },
} as const;

afterEach(() => vi.unstubAllGlobals());

describe("Capital Readiness diagnostic handoff", () => {
  it("removes the fragment immediately and returns a validated self-reported payload", () => {
    const replaceState = vi.fn();
    vi.stubGlobal("window", {
      location: {
        hash: `#capital-readiness=${encodeURIComponent(JSON.stringify(payload))}`,
        pathname: "/dealer-ai-underwriter",
        search: "?source=public_site",
      },
      history: { state: { preserved: true }, replaceState },
    });

    const handoff = readCapitalReadinessHandoffFragment();

    expect(handoff).toEqual(payload);
    expect(replaceState).toHaveBeenCalledWith({ preserved: true }, "", "/dealer-ai-underwriter?source=public_site");
    expect(toCapitalReadinessIntakePrefill(handoff!)).toMatchObject({ verification_status: "self_reported_unverified" });
  });

  it("clears but rejects malformed diagnostic data", () => {
    const replaceState = vi.fn();
    vi.stubGlobal("window", {
      location: {
        hash: `#capital-readiness=${encodeURIComponent(JSON.stringify({ ...payload, source: "untrusted" }))}`,
        pathname: "/funding-review",
        search: "",
      },
      history: { state: null, replaceState },
    });

    expect(readCapitalReadinessHandoffFragment()).toBeNull();
    expect(replaceState).toHaveBeenCalledOnce();
  });

  it("stores validated pending data in tab storage and clears it only when asked", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });

    expect(storePendingCapitalReadinessHandoff(payload)).toBe(true);
    expect(readPendingCapitalReadinessHandoff()).toEqual(toCapitalReadinessIntakePrefill(payload));
    expect(readPendingCapitalReadinessHandoff()).not.toBeNull();
    clearPendingCapitalReadinessHandoff();
    expect(readPendingCapitalReadinessHandoff()).toBeNull();
  });

  it("discards corrupt pending data instead of attempting to claim it", () => {
    const values = new Map<string, string>([["qc.pendingCapitalReadinessDiagnostic", "{bad-json"]]);
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });

    expect(readPendingCapitalReadinessHandoff()).toBeNull();
    expect(values.size).toBe(0);
  });
});
