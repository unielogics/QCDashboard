import type { CollateralAssetDraft, CollateralPropertyDraft, InvestorCollateral } from "./investorCollateral";

export const collateralDraftKey = (profileId: string) => ["file-collateral-draft", profileId] as const;
export type CollateralWorkingDraft = {
  profileId: string; base: InvestorCollateral; enabled: boolean;
  properties: CollateralPropertyDraft[]; removed: CollateralPropertyDraft[];
  assets: CollateralAssetDraft[]; removedAssets: CollateralAssetDraft[]; dirty: boolean;
};
