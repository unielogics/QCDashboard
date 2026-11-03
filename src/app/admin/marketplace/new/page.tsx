"use client";

// Marketplace > New listing: pick a funded file, prefill a draft, open the editor.
//
//   GET  /capital/admin/sources?q=&vertical=&include_all=
//   POST /capital/admin/listings/prefill  {loan_id | profile_id | intake_id}
//   POST /capital/admin/listings          (the prefilled draft)
//
// Also reached from a loan or file page with ?loan_id= / ?profile_id= /
// ?intake_id=, in which case the picker is skipped. A file that already has a
// live listing is sent to that listing instead of getting a duplicate draft.

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Btn, Card, CellChip, Empty, Input, Loading, PageHeader, Panel, Seg, StatusLine, Table, Td, Tr } from "@/components/ds";
import { useCpCreateListing, useCpPrefill, useCpSources, type CpListingPatch, type CpSourceRow } from "@/hooks/useCapitalPartners";
import { SuperAdminOnly, VERTICAL_LABEL, day, errorMessage, money } from "@/components/marketplace/shared";

export default function NewListingPage() {
  return (
    <SuperAdminOnly>
      <Suspense fallback={<Loading />}>
        <NewListing />
      </Suspense>
    </SuperAdminOnly>
  );
}

function NewListing() {
  const router = useRouter();
  const params = useSearchParams();
  const presetLoan = params.get("loan_id");
  const presetProfile = params.get("profile_id");
  const presetIntake = params.get("intake_id");
  const [q, setQ] = useState("");
  const [vertical, setVertical] = useState<"all" | "real_estate" | "auto" | "business">("all");
  const [includeAll, setIncludeAll] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const prefill = useCpPrefill();
  const create = useCpCreateListing();
  const { data: rows = [], isLoading } = useCpSources({ q: q.trim() || undefined, vertical, include_all: includeAll }, !presetLoan && !presetProfile && !presetIntake);

  const start = async (source: { loan_id?: string | null; profile_id?: string | null; intake_id?: string | null; key: string }) => {
    setErr(null);
    setBusyId(source.key);
    try {
      const draft = await prefill.mutateAsync({ loan_id: source.loan_id ?? null, profile_id: source.profile_id ?? null, intake_id: source.intake_id ?? null });
      if (draft.existing_listing) {
        router.replace(`/admin/marketplace/${draft.existing_listing.id}`);
        return;
      }
      const { existing_listing: _existing, ...rest } = draft;
      const body: CpListingPatch = { ...rest };
      const created = await create.mutateAsync(body);
      router.replace(`/admin/marketplace/${created.id}`);
    } catch (e) {
      setErr(errorMessage(e, "Could not start the listing."));
      setBusyId(null);
    }
  };

  useEffect(() => {
    if (presetLoan || presetProfile || presetIntake) void start({ loan_id: presetLoan, profile_id: presetProfile, intake_id: presetIntake, key: "preset" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetLoan, presetProfile, presetIntake]);

  const sorted = useMemo(() => [...rows].sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? "")), [rows]);

  if (presetLoan || presetProfile || presetIntake) {
    return (
      <div className="grid">
        <PageHeader title="New listing" lede="Cutting a draft from the file you came from." />
        {err ? <StatusLine tone="bad">{err}</StatusLine> : <Card><Loading>Prefilling from the loan, the profile, the file's readiness and the current term sheet…</Loading></Card>}
      </div>
    );
  }

  return (
    <div className="grid">
      <PageHeader
        title="New listing"
        lede="Pick the file to offer. The draft is prefilled from the loan, the application profile and the current production term sheet; you set lien, minimum, offered amount and the narrative on the next screen."
        actions={
          <div className="row">
            <Seg as="filter" ariaLabel="Vertical" value={vertical} onChange={setVertical} options={[{ value: "all", label: "All" }, { value: "real_estate", label: "Real estate" }, { value: "auto", label: "Auto" }, { value: "business", label: "Business" }]} />
            <label className="pick" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={includeAll} onChange={(e) => setIncludeAll(e.target.checked)} />
              <span>Show every file</span>
            </label>
          </div>
        }
      />
      <Card>
        <Input placeholder="Search by name, reference, client or program" value={q} onChange={(e) => setQ(e.target.value)} grow />
      </Card>
      {err ? <StatusLine tone="bad">{err}</StatusLine> : null}
      {isLoading ? (
        <Card><Loading>Loading files…</Loading></Card>
      ) : sorted.length === 0 ? (
        <Empty title="No files match">{includeAll ? "Try another search." : "Only files with a term sheet, an approval or a funding appear here. Tick \"Show every file\" to widen the list."}</Empty>
      ) : (
        <Panel noPad>
          <Table caption="Files" cols={[{ label: "File" }, { label: "Vertical" }, { label: "Status" }, { label: "Amount", align: "r" }, { label: "Approved", align: "r" }, { label: "Funded", align: "r" }, { label: "Updated" }, { label: "" }]}>
            {sorted.map((r: CpSourceRow) => {
              const key = `${r.kind}:${r.id}`;
              return (
                <Tr key={key}>
                  <Td>
                    <div className="grid g4">
                      <span>{r.name}</span>
                      <span className="sub num">{r.ref ?? r.id}{r.already_listed_ref ? "" : ""}</span>
                    </div>
                  </Td>
                  <Td>{VERTICAL_LABEL[r.vertical] ?? r.vertical_label ?? r.vertical}</Td>
                  <Td>{r.status ? <CellChip tone="mut">{r.status.replace(/_/g, " ")}</CellChip> : "—"}</Td>
                  <Td className="num" align="r">{money(r.amount, true)}</Td>
                  <Td className="num" align="r">{money(r.approved_amount, true)}</Td>
                  <Td className="num" align="r">{money(r.funded_amount, true)}</Td>
                  <Td className="num">{day(r.updated_at)}</Td>
                  <Td>
                    {r.already_listed_ref ? (
                      <CellChip tone="warn">Listed as {r.already_listed_ref}</CellChip>
                    ) : (
                      <Btn size="sm" variant="pri" disabled={busyId !== null || (!r.loan_id && !r.profile_id && r.kind !== "intake")} onClick={() => void start({ loan_id: r.loan_id, profile_id: r.profile_id, intake_id: r.kind === "intake" && !r.profile_id ? r.id.split(":")[1] ?? null : null, key })}>
                        {busyId === key ? "Prefilling…" : "Start listing"}
                      </Btn>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </Table>
        </Panel>
      )}
    </div>
  );
}
