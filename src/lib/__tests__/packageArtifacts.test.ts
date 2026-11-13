import { describe, expect, it } from "vitest";
import type { Artifact } from "@/components/file/leadFile";
import { checkedPackageArtifacts, checkedPackageArtifactUrl, mergeSavedPackageArtifacts, packageArtifactPath, packageVerificationMatches, selectPackageArtifacts, type LatestSavedPackage, type PackageArtifactLink, type PackageArtifactsSnapshot } from "../packageArtifacts";

const artifact = (id: string, type: string, generation = "g1", extra: Partial<Artifact> = {}): Artifact => ({ id, intake_id: "file", artifact_type: type, title: type, version: 2, status: "current", is_fresh: true, generation_id: generation, input_fingerprint: "saved-input", created_at: "2026-11-13T12:00:00Z", updated_at: "2026-11-13T12:00:00Z", ...extra });
const bundle = () => [artifact("summary", "executive_summary"), artifact("report", "investor_presentation"), artifact("packet", "lender_packet")];
const link = (extra: Partial<PackageArtifactLink> = {}): PackageArtifactLink => ({ artifact_id: "report", url: "https://files.example.test/report.pdf", version: 2, content_type: "application/pdf", disposition: "inline", expires_in_seconds: 900, ...extra });
const latest = (): LatestSavedPackage => ({ generation_id: "g1", executive_summary_id: "summary", investor_presentation_id: "report", lender_packet_id: "packet", versions: { executive_summary: 2, investor_presentation: 2, lender_packet: 2 }, created_at: "2026-11-13T12:00:00Z", input_fingerprint: "saved-input", source_freshness: "unchecked" });

describe("saved package identity", () => {
  it("overlays package metadata without dropping prequalification or unrelated file artifacts", () => {
    const prequalification = artifact("prequal", "prequalification"), other = artifact("other", "other");
    const old = [...bundle(), prequalification, other], next = bundle().map(row => ({ ...row, id: `new-${row.id}` }));
    const result = mergeSavedPackageArtifacts(old, next);
    expect(result).toEqual([prequalification, other, ...next]); expect(result[0]).toBe(prequalification); expect(old).toHaveLength(5);
  });
  it("selects one complete generation even when a newer partial write appears", () => {
    const input = [...bundle(), artifact("new-summary", "executive_summary", "g2", { created_at: "2026-11-13T13:00:00Z" })];
    const selected = selectPackageArtifacts(input);
    expect(selected.summary?.id).toBe("summary"); expect(selected.packet?.id).toBe("packet"); expect(selected.presentation?.id).toBe("report"); expect(selected.fresh).toBe(true);
    expect(input[0].id).toBe("summary");
  });
  it("does not mix incomplete generations or bless status-only freshness", () => {
    expect(selectPackageArtifacts([artifact("a", "executive_summary"), artifact("b", "lender_packet", "g2"), artifact("c", "investor_presentation", "g3")]).coherent).toBe(false);
    expect(selectPackageArtifacts(bundle().map(row => ({ ...row, is_fresh: null }))).fresh).toBe(false);
    expect(selectPackageArtifacts(bundle().map(row => ({ ...row, is_fresh: false }))).fresh).toBe(false);
  });
  it("keeps legacy and superseded artifacts available without claiming a current generation", () => {
    const selected = selectPackageArtifacts(bundle().map(row => ({ ...row, generation_id: null, status: "superseded" })));
    expect(selected.hasArtifacts).toBe(true); expect(selected.coherent).toBe(false); expect(selected.summary).toBeUndefined();
  });
  it("uses immutable artifact ID and encodes both route segments", () => {
    expect(packageArtifactPath("file/id", "old/id")).toBe("/admin/ai-underwriter-leads/file%2Fid/artifacts/old%2Fid/url?download=false");
    expect(packageArtifactPath("file", "old", true)).toContain("/old/url?download=true");
  });
  it("honors the server complete bundle even if a partial newer generation superseded one old row", () => {
    const selected = selectPackageArtifacts(bundle().map(row => ({ ...row, status: "superseded", is_fresh: null })), latest());
    expect(selected.coherent).toBe(true); expect(selected.summary?.id).toBe("summary"); expect(selected.fresh).toBe(false);
  });
  it("does not infer a bundle when the server explicitly has none", () => {
    expect(selectPackageArtifacts(bundle(), null).coherent).toBe(false);
  });
  it("does not fall back to another bundle when the authoritative IDs or generation mismatch", () => {
    expect(selectPackageArtifacts(bundle(), { ...latest(), investor_presentation_id: "missing" }).coherent).toBe(false);
    expect(selectPackageArtifacts(bundle(), { ...latest(), generation_id: "other" }).summary).toBeUndefined();
  });
  it("accepts matching artifact-only snapshots without changing their content", () => {
    const snapshot: PackageArtifactsSnapshot = { intake_id: "file", artifacts: bundle(), latest_package: latest(), refresh: null };
    expect(checkedPackageArtifacts(snapshot, "file")).toBe(snapshot);
  });
  it("rejects another file or artifact before cache adoption", () => {
    const snapshot: PackageArtifactsSnapshot = { intake_id: "file", artifacts: bundle(), latest_package: latest(), refresh: null };
    expect(() => checkedPackageArtifacts(snapshot, "other")).toThrow();
    expect(() => checkedPackageArtifacts({ ...snapshot, artifacts: [artifact("foreign", "lender_packet", "g1", { intake_id: "other" })] }, "file")).toThrow();
  });
});

describe("previously validated immutable bundle", () => {
  const metadata = () => bundle().map(row => ({ ...row, is_fresh: null }));
  it("keeps a matching full-read or successful generation usable after unchecked metadata arrives", () => {
    expect(packageVerificationMatches(metadata(), bundle())).toBe(true);
    expect(packageVerificationMatches(metadata(), [])).toBe(false);
  });
  it.each(["queued", "running", "failed", "blocked"] as const)("invalidates earlier verification for a %s update", status => {
    expect(packageVerificationMatches(metadata(), bundle(), { status } as PackageArtifactsSnapshot["refresh"])).toBe(false);
  });
  it("rejects changed IDs, fingerprints, generation, superseded records or explicit stale results", () => {
    for (const patch of [{ id: "other" }, { input_fingerprint: "changed" }, { generation_id: "new" }, { status: "superseded" as const }, { is_fresh: false }]) {
      expect(packageVerificationMatches(metadata().map((row, index) => index ? row : { ...row, ...patch }), bundle())).toBe(false);
    }
    expect(packageVerificationMatches(metadata(), [...bundle(), { ...bundle()[0], is_fresh: false }])).toBe(false);
    expect(packageVerificationMatches([metadata()[0], metadata()[0], metadata()[0]], bundle())).toBe(false);
  });
});

describe("click-time PDF links", () => {
  const selected = artifact("report", "investor_presentation");
  it("accepts HTTPS and same-origin local PDF links", () => {
    expect(checkedPackageArtifactUrl(link(), selected, "http://localhost:3000")).toBe(link().url);
    expect(checkedPackageArtifactUrl(link({ url: "/fixture.pdf" }), selected, "http://localhost:3000")).toBe("http://localhost:3000/fixture.pdf");
  });
  it.each([link({ artifact_id: "other" }), link({ version: 1 }), link({ content_type: "text/html" }), link({ url: "javascript:alert(1)" }), link({ url: "http://untrusted.test/pdf" })])("rejects identity, type or unsafe URL mismatches", response => {
    expect(() => checkedPackageArtifactUrl(response, selected, "http://localhost:3000")).toThrow();
  });
});
