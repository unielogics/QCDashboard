"use client";

// The four tabs, along the bottom, where a workbook's tabs are — the owner
// asked for them there and for the same reason Sheets puts them there: the
// grid is the page, and the thing that switches pages belongs under it.
//
// The control itself is the design system's `Tabs`, not a second tab
// implementation: it already carries `role="tablist"`, `aria-selected` and a
// badge slot, and the badge is exactly where each sheet's status chip goes.
// What is bespoke here is only the strip it sits in.
//
// A tab that is not in the link's scope is not rendered at all. A view-only
// link says so once, on the strip, rather than on every cell.
//
// The strip is `.sg-tabs`, not `.sg-tabbar`: the public page's own stacked
// fork already owns `.sg-tabbar` in an inline `<style>` on the same document,
// and two definitions of one class where the later one silently wins is a
// collision waiting for whoever edits either file next.

import { CellChip, type ChipTone } from "@/components/ds";
import { Tabs } from "@/components/design-system/Tabs";
import type { SheetKind } from "./types";

export type SheetTabChip = { label: string; tone?: ChipTone; title?: string };

export type SheetTab = {
  kind: SheetKind;
  title: string;
  chip?: SheetTabChip | null;
};

export function SheetTabs({
  tabs,
  active,
  onChange,
  canEdit = true,
}: {
  tabs: SheetTab[];
  active: SheetKind;
  onChange: (kind: SheetKind) => void;
  canEdit?: boolean;
}) {
  if (tabs.length === 0) return null;
  return (
    <div className="sg-tabs">
      <Tabs<SheetKind>
        value={active}
        onChange={onChange}
        options={tabs.map((tab) => ({
          id: tab.kind,
          label: tab.title,
          badge: tab.chip ? (
            <CellChip tone={tab.chip.tone ?? "mut"} title={tab.chip.title} className="sg-tabchip">
              {tab.chip.label}
            </CellChip>
          ) : undefined,
        }))}
      />
      {canEdit ? null : (
        <span className="sg-viewonly" title="This link opens the worksheet without a sign-in and cannot change it.">
          View only
        </span>
      )}
    </div>
  );
}
