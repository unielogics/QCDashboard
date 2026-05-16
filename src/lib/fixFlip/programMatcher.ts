// Fix & Flip Deal Analyzer — program eligibility gating.
// Credit-first, then experience, liquidity, leverage. Returns eligible
// programs + ineligible ones with hedged reasons (never "approved").
// BYTE-IDENTICAL between QCDashboard and QCMobile.

import type { ExperienceTier, FixFlipInputs, LendingProgram } from "./types";
import { LENDING_PROGRAMS } from "./programs";

const EXP_RANK: Record<ExperienceTier, number> = {
  "0_flips": 0,
  "1_2_flips": 1,
  "3_5_flips": 2,
  "5_plus_flips": 3,
  pro: 4,
};

export function experienceRank(t: ExperienceTier): number {
  return EXP_RANK[t] ?? 0;
}

export interface MatchOutput {
  eligible: LendingProgram[];
  ineligible: { program: LendingProgram; reasons: string[] }[];
}

export function matchPrograms(inputs: FixFlipInputs): MatchOutput {
  const eligible: LendingProgram[] = [];
  const ineligible: { program: LendingProgram; reasons: string[] }[] = [];

  const credit = inputs.creditScore;
  const expRank = experienceRank(inputs.experience);
  const arvAdj = inputs.arv * (1 - (inputs.arvHaircutPct ?? 0));
  const rehab = inputs.rehabCost * (1 + (inputs.rehabOverrunPct ?? 0));
  const totalCost = inputs.purchasePrice + rehab;

  for (const p of LENDING_PROGRAMS) {
    const reasons: string[] = [];

    // 1. Credit — the primary gatekeeper.
    if (credit == null) {
      reasons.push("Credit score is required for program matching");
    } else if (credit < p.minCreditScore) {
      reasons.push(`Credit score below minimum (needs ${p.minCreditScore})`);
    }

    // 2. Experience.
    if (expRank < (EXP_RANK[p.minExperience] ?? 0)) {
      if (!(inputs.experience === "0_flips" && p.allowsFirstTimeFlipper)) {
        reasons.push("Experience requirement not met");
      }
    }
    if (inputs.experience === "0_flips" && !p.allowsFirstTimeFlipper) {
      reasons.push("Program does not allow first-time flippers");
    }

    // 3. Liquidity.
    if (
      p.minLiquidity != null &&
      inputs.liquidity != null &&
      inputs.liquidity < p.minLiquidity
    ) {
      reasons.push("Liquidity too low for this program");
    }

    // 4. Leverage sanity — if even the program's own caps can't reach
    //    a workable loan vs. total cost, flag it (not a hard gate, a
    //    signal). ARV leverage check.
    const arvCap = arvAdj * p.maxARVLTV;
    const ltcCap = totalCost * p.maxLTC;
    if (arvCap <= 0 || ltcCap <= 0) {
      reasons.push("Deal numbers incomplete for leverage check");
    }

    if (reasons.length === 0) eligible.push(p);
    else ineligible.push({ program: p, reasons });
  }

  return { eligible, ineligible };
}
