"use client";

// The design system, on one page, in development only.
//
// This migration was verified structurally the whole way — typecheck, endpoint
// parity, ordered handler diffs, class-token diffs. What none of that catches
// is a rule that compiles and renders wrong: a surface that resolves
// transparent, a chip whose tone is invisible against its own ground, a row
// that clips the moment its content is realistic rather than short.
//
// So every component and class the migration introduced is rendered here with
// the content that actually breaks things: long status strings, addresses that
// need truncating, a KPI row wide enough to wrap, a callout containing a list.
//
// It is a reference for whoever touches the vocabulary next, and a target for
// the screenshot harness. `notFound()` in production means it cannot ship.

import { notFound } from "next/navigation";
import { Icon } from "@/components/design-system/Icon";
import {
  Btn,
  BtnLink,
  Callout,
  Card,
  CellChip,
  CG,
  Chip,
  Empty,
  Field,
  IconBtn,
  Input,
  ItemRow,
  Kpi,
  KpiRow,
  Linky,
  Loading,
  Note,
  PageHeader,
  Panel,
  Select,
  StatusLine,
  Sub,
  Table,
  Tag,
  Td,
  Textarea,
  Tr,
  WarnLine,
  type ChipTone,
} from "@/components/ds";

const TONES: ChipTone[] = ["ok", "warn", "bad", "mut", "acc", "gold", "pet"];

// The string that found the `.cellchip` clipping trap: a verdict long enough
// that nowrap inside an overflow:hidden panel silently truncates it.
const LONG_STATUS =
  "LTARV 71.4% is inside the 75% cap but the appraisal is 41 days old";

export default function DsGallery() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="content content--wide" style={{ minHeight: "100vh" }}>
      <PageHeader
        title="Design system"
        lede="Every class the migration introduced, at the content lengths that break things."
        actions={
          <>
            <Btn size="sm">Secondary</Btn>
            <Btn size="sm" variant="pri">
              Primary
            </Btn>
          </>
        }
      />

      <CG>
        {/* ── surfaces ─────────────────────────────────────────────── */}
        <Panel className="s6" title="Panel" sub="with a sub and actions" actions={<Tag>12</Tag>}>
          <Sub>
            A panel body. `.panel` is overflow:hidden, which zeroes its automatic minimum size as a
            flex child — the reason this gallery lays out on `.cg` and not a flex column.
          </Sub>
          <div className="mt">
            <Card>
              A card inside a panel.
            </Card>
          </div>
        </Panel>

        <Panel className="s6" title="Card tones" sub="state on the surface, not only in a badge">
          <div className="grid g8">
            <Card className="tone-ok">tone-ok — this one is fine</Card>
            <Card className="tone-warn">tone-warn — this one needs a look</Card>
            <Card className="tone-bad">tone-bad — this one is blocking you</Card>
          </div>
        </Panel>

        {/* ── the KPI row ──────────────────────────────────────────── */}
        <Panel className="s12" title="KpiRow" sub="icon, trend and prose all restored after the migration dropped them">
          <KpiRow>
            <Kpi label="Loan amount" value="$1,240,000" icon="dollar" iconTone="acc" />
            <Kpi label="Final rate" value="9.125%" delta="+37 bps" trend="up" tone="bad" />
            <Kpi label="DSCR" value="1.31" delta="+0.06" trend="up" tone="ok" icon="trend" iconTone="ok" />
            <Kpi label="Pipeline" value="18" sub="4 closing this month" icon="file" />
            <Kpi label="Approval mode" value="Auto-approve under $50k" prose icon="sliders" iconTone="pet" />
            <Kpi label="Overdue" value="3" tone="warn" delta="2 past 30d" className="tone-warn" />
          </KpiRow>
        </Panel>

        {/* ── status vocabulary ────────────────────────────────────── */}
        <Panel className="s6" title="Chips" sub="one tone vocabulary, everywhere">
          <div className="row">
            {TONES.map((t) => (
              <CellChip key={t} tone={t}>
                c-{t}
              </CellChip>
            ))}
          </div>
          <div className="row mt">
            <Tag>tag</Tag>
            <Chip dotColor="var(--ok)">chip with a dot</Chip>
            <span className="mlbl">mlbl</span>
            <span className="cnt">7</span>
            <span className="cnt sm">7</span>
            <span className="kbd">⌘K</span>
          </div>
          <div className="mt">
            <Sub>
              A chip is nowrap. When the status became a sentence, three routes hand-rolled the same
              block — so it got a word:
            </Sub>
            <div style={{ marginTop: 8 }}>
              <StatusLine tone="warn">{LONG_STATUS}</StatusLine>
            </div>
          </div>
        </Panel>

        <Panel className="s6" title="Buttons">
          <div className="row">
            <Btn>Default</Btn>
            <Btn variant="pri">Primary</Btn>
            <Btn className="danger">Danger</Btn>
            <Btn className="pri-bad">Solid danger</Btn>
            <Btn disabled>Disabled</Btn>
          </div>
          <div className="row mt">
            <Btn size="sm">Small</Btn>
            <Btn size="sm" className="tone-warn">
              tone-warn
            </Btn>
            <Btn size="sm" className="tone-acc">
              tone-acc
            </Btn>
            <Btn size="sm" className="tone-pet">
              tone-pet
            </Btn>
            <IconBtn aria-label="Close">
              <Icon name="x" size={14} />
            </IconBtn>
            <BtnLink href="#" size="sm">
              Link <Icon name="chevR" size={11} />
            </BtnLink>
            <Linky>Text action</Linky>
          </div>
          <Sub className="mt">
            `.btn.tone-*` and not a bare `.c-*`: `.btn:hover` out-specifies a single class, so a
            chip tone on a button loses its tint exactly when you point at it. Hover these.
          </Sub>
        </Panel>

        {/* ── advisory blocks ──────────────────────────────────────── */}
        <Panel className="s6" title="Callout, note, warnline">
          <div className="grid g8">
            <Callout tone="acc" icon={<Icon name="docCheck" size={15} />}>
              <b style={{ fontSize: 13 }}>Nothing moves.</b>
              <Sub>The bucket keeps its files exactly where they are.</Sub>
            </Callout>
            <Callout tone="warn" icon={<Icon name="alert" size={15} />}>
              A callout with a warn tone.
            </Callout>
            <Callout tone="bad" icon={<Icon name="alert" size={15} />}>
              A callout with a bad tone.
            </Callout>
            <Note>
              <Icon name="spark" size={16} />
              <span>
                <b>Note</b> is the petrol advisory from the trunk.
              </span>
            </Note>
            <div className="warnline">A warnline — a single line of amber.</div>
          </div>
        </Panel>

        <Panel className="s6" title="Rows">
          <ItemRow
            icon={<Icon name="doc" size={15} />}
            right={<CellChip tone="ok">verified</CellChip>}
          >
            <b style={{ fontSize: 13 }}>Bank statement — March 2026</b>
          </ItemRow>
          <ItemRow
            className="tone-warn"
            icon={<Icon name="doc" size={15} />}
            right={<CellChip tone="warn">flagged</CellChip>}
          >
            <b style={{ fontSize: 13 }}>Purchase contract</b>
            <Sub className="trunc">
              1418 Northwest Fairview Terrace, Building C, Suite 220, Portland, Oregon 97210
            </Sub>
          </ItemRow>
          <ItemRow
            className="tone-bad"
            icon={<Icon name="alert" size={15} />}
            right={<CellChip tone="bad">missing</CellChip>}
          >
            <b style={{ fontSize: 13 }}>Entity operating agreement</b>
          </ItemRow>
          <div className="mt">
            <div className="rung">
              <span className="grow">
                <b>.rung</b>
              </span>
              <CellChip tone="mut">neutral</CellChip>
            </div>
            <div className="rung tone-warn" style={{ marginTop: 6 }}>
              <span className="grow">
                <b>.rung.tone-warn</b>
              </span>
              <CellChip tone="warn">open</CellChip>
            </div>
            <div className="rung tone-bad" style={{ marginTop: 6 }}>
              <span className="grow">
                <b>.rung.tone-bad</b>
              </span>
              <CellChip tone="bad">blocking</CellChip>
            </div>
          </div>
        </Panel>

        {/* ── forms ────────────────────────────────────────────────── */}
        <Panel className="s6" title="Form controls">
          <div className="fldsec">
            <div className="lbl">Normal</div>
            <div className="fldgrid two">
              <Field label="Loan amount" hint="Optional.">
                <Input placeholder="1,200,000" />
              </Field>
              <Field label="Loan type">
                <Select defaultValue="dscr">
                  <option value="dscr">DSCR</option>
                  <option value="bridge">Bridge</option>
                </Select>
              </Field>
            </div>
          </div>
          <div className="fldsec">
            <div className="lbl">States</div>
            <div className="fldgrid two">
              <Field label="Property type" req>
                <Select className="bad" defaultValue="">
                  <option value="">—</option>
                </Select>
              </Field>
              <Field label="Recipient" hint="Fixed by the share.">
                <Input readOnly value="lender@example.com" />
              </Field>
            </div>
            <div className="mt">
              <div className="field box" style={{ maxWidth: 280 }}>
                <Icon name="search" size={14} />
                <input placeholder="Search — .field.box" />
              </div>
            </div>
            <div className="mt">
              <Textarea rows={2} placeholder="A textarea." />
            </div>
          </div>
        </Panel>

        <Panel className="s6" title="Pick rows" sub=".picklist owns the rhythm; the container wins">
          <div className="picklist" style={{ maxHeight: 200 }}>
            <label className="pick on top">
              <input type="checkbox" defaultChecked style={{ marginTop: 3 }} />
              <span style={{ minWidth: 0 }}>
                <b style={{ fontSize: 13 }}>Selected</b>
                <Sub>`.pick.on` — border and tint from the accent.</Sub>
              </span>
            </label>
            <label className="pick top">
              <input type="checkbox" style={{ marginTop: 3 }} />
              <span style={{ minWidth: 0 }}>
                <b style={{ fontSize: 13 }}>Unselected</b>
                <Sub>`.pick.top` aligns the box to the first line, not the paragraph middle.</Sub>
              </span>
            </label>
            <label className="pick">
              <input type="checkbox" />
              <span>A one-line pick.</span>
            </label>
          </div>
        </Panel>

        {/* ── data ─────────────────────────────────────────────────── */}
        <Panel className="s12" title="Table" noPad>
          <Table
            caption="Sample loans"
            cols={[
              { label: "Deal", width: 110 },
              { label: "Address" },
              { label: "Stage" },
              { label: "DSCR", align: "r" },
              { label: "Amount", align: "r", width: 140 },
            ]}
          >
            <Tr>
              <Td>
                <span className="mono">QC-10442</span>
              </Td>
              <Td>
                <span className="trunc">1418 NW Fairview Terrace, Building C, Suite 220, Portland OR</span>
              </Td>
              <Td>
                <CellChip tone="acc">Processing</CellChip>
              </Td>
              <Td align="r">
                <span className="num">1.31</span>
              </Td>
              <Td align="r">
                <span className="num">$1,240,000</span>
              </Td>
            </Tr>
            <Tr className="done">
              <Td>
                <span className="mono">QC-10390</span>
              </Td>
              <Td>221 Sunset Blvd</Td>
              <Td>
                <CellChip tone="mut">Funded</CellChip>
              </Td>
              <Td align="r">
                <span className="num">1.44</span>
              </Td>
              <Td align="r">
                <span className="num">$860,000</span>
              </Td>
            </Tr>
          </Table>
        </Panel>

        {/* ── the states a list can be in ──────────────────────────── */}
        <Panel className="s4" title="Empty">
          <Empty icon="file" title="No conditions yet">
            The funding team adds these as the loan progresses.
          </Empty>
        </Panel>
        <Panel className="s4" title="Loading">
          <Loading />
        </Panel>
        <Panel className="s4" title="Hintbox">
          <div className="hintbox">
            <span className="hintbox-i">
              <Icon name="bolt" size={16} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ fontSize: 13 }}>Appears after handoff</b>
              <Sub>A placeholder with a reason, which is not the same as an error.</Sub>
            </div>
          </div>
        </Panel>

        {/* ── chrome ───────────────────────────────────────────────── */}
        <Panel className="s6" title="File header + tabs">
          <div className="filehd">
            <div className="filehd-b">
              <div style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: 8 }}>
                  <a className="crumb" href="#">
                    <Icon name="chevL" size={10} /> Pipeline
                  </a>
                  <CellChip tone="acc">Buyer Deal</CellChip>
                  <Tag>active</Tag>
                </div>
                <h1 className="filehd-t">1418 NW Fairview Terrace</h1>
                <Sub>Marisol Okonkwo · FICO 741 · Target $1,240,000</Sub>
              </div>
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <Btn variant="pri">Ready for funding</Btn>
              </div>
            </div>
            <div className="ftabs" role="tablist" aria-label="Sections">
              <button type="button" role="tab" aria-selected className="ftab on">
                <Icon name="home" size={13} /> Property
              </button>
              <button type="button" role="tab" aria-selected={false} className="ftab">
                <Icon name="spark" size={13} /> Elara
                <span className="cnt sm">3</span>
              </button>
              <button type="button" role="tab" aria-selected={false} className="ftab">
                <Icon name="doc" size={13} /> Documents
              </button>
            </div>
          </div>
        </Panel>

        <Panel className="s6" title="Thread">
          <div className="thr" style={{ maxHeight: 260 }}>
            <div className="msg">
              <div className="msg-h">
                <span className="msg-role">Borrower</span>
                <span className="msg-when">Mar 4, 9:12 AM</span>
              </div>
              <div className="msg-b">Uploaded the January and February statements.</div>
            </div>
            <div className="msg ai">
              <div className="msg-h">
                <span className="msg-role">Elara</span>
                <span className="msg-when">Mar 4, 9:13 AM</span>
              </div>
              <div className="msg-b">Both parsed. March is still outstanding.</div>
            </div>
            <div className="msg internal">
              <div className="msg-h">
                <span className="msg-role">Agent (private)</span>
                <span className="msg-when">Mar 4, 9:20 AM</span>
              </div>
              <div className="msg-b">Off the record — dashed, not a fourth colour.</div>
            </div>
            <div className="msg mine">
              <div className="msg-h">
                <span className="msg-role">Operator</span>
                <span className="msg-when">Mar 4, 9:31 AM</span>
              </div>
              <div className="msg-b">Chasing March now.</div>
            </div>
          </div>
        </Panel>

        {/* ── the 12-column grid itself ────────────────────────────── */}
        <Panel className="s12" title="The grid" sub=".cg with .s3 … .s12; collapses at 1100px">
          <div className="cg">
            {[3, 3, 3, 3, 4, 4, 4, 6, 6].map((n, i) => (
              <div key={i} className={`card s${n}`} style={{ textAlign: "center" }}>
                <span className="lbl">s{n}</span>
              </div>
            ))}
          </div>
        </Panel>
      </CG>
    </main>
  );
}
