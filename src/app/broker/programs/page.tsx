"use client";

import Link from "next/link";
import { Callout, Card, CellChip, PageHeader } from "@/components/ds";
import { useReferralPrograms, REFERRAL_TYPE_LABELS } from "@/hooks/useReferralPrograms";

export default function ReferralProgramsPage() {
  const programs = useReferralPrograms();
  return <div className="grid">
    <PageHeader title="Active programs" lede="Start a file for your client in any available program. The team reviews eligibility and the final funding structure." />
    {programs.isLoading ? <Card>Loading programs…</Card> : null}
    {programs.error ? <Callout tone="bad">Programs could not be loaded. <button className="btn" onClick={() => void programs.refetch()}>Try again</button></Callout> : null}
    {programs.data?.length === 0 ? <Card>No active programs are available. Contact the team.</Card> : null}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 16 }}>
      {programs.data?.map((program) => <Card key={program.program_key} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2>{program.name}</h2>
        {program.short_description ? <p className="sub">{program.short_description}</p> : null}
        <div className="row">{program.variants.map((variant) => <CellChip key={variant} tone="pet">{REFERRAL_TYPE_LABELS[variant] || variant}</CellChip>)}</div>
        <div className="grid g8" style={{ marginTop: "auto" }}>
          {program.variants.map((variant) => <Link className="btn pri" key={variant} href={variant === "foreclosure_rescue" ? "/foreclosure-rescues?new=1" : `/broker/ai-underwriter-leads?program=${encodeURIComponent(program.program_key)}&variant=${variant}`}>
            Start {program.variants.length > 1 ? REFERRAL_TYPE_LABELS[variant]?.toLowerCase() : "file"}
          </Link>)}
          {!program.variants.length ? <span className="sub">Contact the team to configure the application route.</span> : null}
        </div>
      </Card>)}
    </div>
  </div>;
}
