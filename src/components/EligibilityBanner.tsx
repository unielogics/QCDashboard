"use client";

// Eligibility banner — surfaces credit / experience gating with a contextual
// CTA. Shared between TermsTab (per-loan) and the standalone Simulator page.

import { useRouter } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import type { EligibilityBanner as EligibilityBannerData } from "@/lib/eligibility";

// `credit=open` is a bookmarkable hint for /profile to auto-open the
// CreditPullModal. The page picks the right mode (expired/rerun/first)
// based on the user's actual credit state — no need to encode it in the
// URL beyond the simple "open" trigger.
const TARGET_HREF: Record<NonNullable<EligibilityBannerData["ctaTarget"]>, string> = {
  "credit-pull": "/profile?credit=open",
  vault: "/vault",
  "new-loan": "/pipeline",
};

export function EligibilityBanner({ banner }: { banner: EligibilityBannerData }) {
  const { t } = useTheme();
  const router = useRouter();

  const palette = (() => {
    switch (banner.kind) {
      case "credit-blocked":
        return { bg: t.dangerBg, fg: t.danger, icon: "lock" as const };
      case "credit-warn":
        return { bg: t.warnBg, fg: t.warn, icon: "alert" as const };
      case "experience":
        return { bg: t.petrolSoft, fg: t.petrol, icon: "trend" as const };
      case "no-credit":
        return { bg: t.brandSoft, fg: t.brand, icon: "shield" as const };
      case "credit-expired":
        return { bg: t.dangerBg, fg: t.danger, icon: "refresh" as const };
      case "credit-expiring":
        return { bg: t.warnBg, fg: t.warn, icon: "refresh" as const };
    }
  })();

  return (
    <Card pad={14} style={{ background: palette.bg, borderColor: `${palette.fg}40` }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: palette.fg,
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name={palette.icon} size={18} stroke={2.4} />
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              color: palette.fg,
            }}
          >
            {banner.title}
          </div>
          <div style={{ fontSize: 12, color: t.ink2, marginTop: 4, lineHeight: 1.45 }}>{banner.body}</div>
          {banner.ctaLabel && banner.ctaTarget ? (
            <button
              onClick={() => router.push(TARGET_HREF[banner.ctaTarget!])}
              style={{
                marginTop: 10,
                padding: "8px 14px",
                borderRadius: 9,
                background: palette.fg,
                color: "#fff",
                border: "none",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {banner.ctaLabel}
            </button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
