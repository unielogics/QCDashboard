"use client";

// What a client put on a financial form, in short.
//
// The personal financial statement is the whole SBA 413: dozens of lines, most
// of them left empty. Opening it to find out what somebody said means scrolling
// a form built for typing. This is the read-back: the headline figures, only
// the lines that were answered (with a count of those left blank), the debt
// cards, the schedules, and the file behind it with a preview button. For an
// upload it shows what the AI took off the document and says so, because a
// typed figure and a scanned one carry different weight.

import { useQuery } from "@tanstack/react-query";
import { Callout, CellChip, Sub } from "@/components/ds";
import { ActionIcon } from "@/components/ds/ActionIcon";
import { Drawer } from "@/components/ds/Drawer";
import { Icon } from "@/components/design-system/Icon";
import { useAuthedApi } from "@/hooks/useApi";
import { answersByline, type FormAnswerLine, type FormAnswerSection, type FormAnswerTable, type FormAnswers, type FormKind } from "@/lib/formAnswers";
import { evidenceOriginLabel } from "@/lib/requirementWaiting";

const TITLES: Record<FormKind, string> = {
  pfs: "Personal financial statement",
  debt_schedule: "Business debt schedule",
  p_and_l: "Profit and loss statement",
  balance_sheet: "Balance sheet",
};

function Rows({ rows, total }: { rows: FormAnswerLine[]; total?: FormAnswerLine | null }) {
  return (
    <dl className="form-answers-rows">
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>
            {row.value}
            {row.note ? <small>{row.note}</small> : null}
          </dd>
        </div>
      ))}
      {total ? (
        <div className="total">
          <dt>{total.label}</dt>
          <dd>{total.value}</dd>
        </div>
      ) : null}
    </dl>
  );
}

function SectionView({ section }: { section: FormAnswerSection }) {
  const body = (
    <>
      <Rows rows={section.rows} total={section.total} />
      {section.left_blank > 0 ? <Sub>{section.left_blank} line{section.left_blank === 1 ? "" : "s"} left blank</Sub> : null}
    </>
  );
  if (section.collapsed) {
    return (
      <details className="form-answers-card fold">
        <summary>{section.title}</summary>
        {body}
      </details>
    );
  }
  return (
    <section className="form-answers-card">
      <h4>{section.title}</h4>
      {body}
    </section>
  );
}

function TableView({ table }: { table: FormAnswerTable }) {
  return (
    <section className="form-answers-card">
      <h4>{table.title}</h4>
      <div className="tblwrap">
        <table className="tbl form-answers-table">
          <thead>
            <tr>{table.columns.map((column) => <th key={column}>{column}</th>)}</tr>
          </thead>
          <tbody>
            {table.rows.map((row, index) => (
              <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>
            ))}
            {table.total_row ? (
              <tr className="total">{table.total_row.map((cell, cellIndex) => <td key={cellIndex}><b>{cell}</b></td>)}</tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function FormAnswersDrawer({
  profileId,
  kind,
  open,
  onClose,
  onPreviewFile,
}: {
  profileId: string;
  kind: FormKind | null;
  open: boolean;
  onClose: () => void;
  /** Open one of the files behind the form. The drawer closes first so the preview is not hidden under it. */
  onPreviewFile?: (fileId: string) => void;
}) {
  const api = useAuthedApi();
  const query = useQuery({
    queryKey: ["form-answers", profileId, kind],
    queryFn: () => api<FormAnswers>(`/application-profiles/${profileId}/financial-forms/${kind}/answers`),
    enabled: open && Boolean(kind),
  });
  if (!kind) return null;
  const data = query.data;
  const title = data?.label ?? TITLES[kind];
  const sourceChip = data
    ? data.source === "filled"
      ? <CellChip tone="ok">Filled in</CellChip>
      : data.source === "uploaded"
        ? <CellChip tone="acc">Uploaded</CellChip>
        : data.draft
          ? <CellChip tone="warn">Draft</CellChip>
          : <CellChip tone="mut">Nothing yet</CellChip>
    : null;
  const context = data ? [data.who, data.as_of ? `as of ${data.as_of}` : null].filter(Boolean).join(" · ") : "";
  return (
    <Drawer open={open} onClose={onClose} title={title} sub={data ? answersByline(data) : "Reading what was filled in..."} width="md" ariaLabel={`${title}: what was filled in`}>
      <div className="form-answers">
        {query.isLoading ? <div className="empty"><span className="spinner solo" />Reading the form...</div> : null}
        {query.isError ? <Callout tone="bad" icon={<Icon name="alert" size={16} />}>This form could not be read. Close and try again.</Callout> : null}
        {data ? (
          <>
            <div className="row g8 form-answers-meta">
              {sourceChip}
              {data.figures_from === "document" ? <CellChip tone="mut">Read from the document</CellChip> : null}
              {context ? <span className="sub">{context}</span> : null}
            </div>
            {data.empty_reason ? <Callout tone="warn" icon={<Icon name="alert" size={16} />}>{data.empty_reason}</Callout> : null}
            {data.headline.length ? (
              <div className="form-answers-headline">
                {data.headline.map((line) => (
                  <div key={line.label} title={line.note ?? undefined}>
                    <span>{line.label}</span>
                    <b>{line.value}</b>
                  </div>
                ))}
              </div>
            ) : null}
            {data.tables.filter((table) => table.key === "glance").map((table) => <TableView key={table.key} table={table} />)}
            {data.sections.map((section) => <SectionView key={section.key} section={section} />)}
            {data.tables.filter((table) => table.key !== "glance").map((table) => <TableView key={table.key} table={table} />)}
            {data.notes ? (
              <section className="form-answers-card">
                <h4>Notes</h4>
                <p className="form-answers-notes">{data.notes}</p>
              </section>
            ) : null}
            {data.files.length ? (
              <section className="form-answers-card">
                <h4>Files</h4>
                <ul className="form-answers-files">
                  {data.files.map((file) => (
                    <li key={file.file_id}>
                      <Icon name={file.origin === "filled_form" ? "docCheck" : "file"} size={15} />
                      <span className="grow trunc">
                        <b className="trunc">{file.file_name}</b>
                        <small>{evidenceOriginLabel(file.origin, kind)}</small>
                      </span>
                      {onPreviewFile ? (
                        <ActionIcon
                          icon="eye"
                          label={`Preview ${file.file_name}`}
                          onClick={() => {
                            onClose();
                            onPreviewFile(file.file_id);
                          }}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </Drawer>
  );
}
