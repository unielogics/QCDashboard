"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Btn, CellChip } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { monthShort, type CockpitAccount, type CockpitMonth } from "@/lib/financialCockpit";
import { balanceRiskMonths, feeEvent, nextRiskDay, riskCountLabel, riskDateLabel, riskDayLabel, riskEventPage, riskMonthSignal, riskTotals, riskTrend, RISK_EVENT_LABELS, type RiskCount, type RiskDay, type RiskEvent, type RiskMonth } from "@/lib/balanceRisk";
import styles from "./OverdraftCard.module.css";

type Source = { fileId: string; label: string; page?: number; };
type PreviewSource = (fileId: string, page?: number) => void;
const amount = (value: number | null) => value == null ? "Not provided" : value.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const coverage = (count: RiskCount) => count.complete ? "All displayed months reported" : `${count.reportedMonths} of ${count.totalMonths} months fully reported`;
const monthCount = (month: RiskMonth, key: "negativeDays" | "nsf" | "returned" = "negativeDays") => riskCountLabel({ value: month[key], complete: month.countComplete[key], reportedMonths: 0, totalMonths: 1 });

function SourcePicker({ sources, exact, onPreview }: { sources: Source[]; exact: boolean; onPreview?: PreviewSource; }) {
  const unique = [...new Map(sources.map((source) => [`${source.fileId}:${source.page ?? ""}`, source])).values()];
  const [choice, setChoice] = useState("");
  const selected = unique.find((source) => `${source.fileId}:${source.page ?? ""}` === choice) ?? unique[0];
  if(!selected) return (
    <p className={styles.note}>Source file reference not provided.</p>
  );
  return (
    <div className={styles.sources}>
      <label>
        {exact ? "Source statement" : "Month-level statement sources"}
        <select
          aria-label={exact ? "Source statement" : "Month-level statement sources"}
          value={`${selected.fileId}:${selected.page ?? ""}`}
          onChange={(event) => setChoice(event.target.value)}
        >
          {unique.map((source) => <option
            key={`${source.fileId}:${source.page ?? ""}`}
            value={`${source.fileId}:${source.page ?? ""}`}
          >
            {source.label}
            {source.page ? ` · page ${source.page}` : ""}
          </option>)}
        </select>
      </label>
      {onPreview ? <Btn
        size="sm"
        onClick={() => onPreview(selected.fileId, selected.page)}
      >
        <Icon
          name="eye"
          size={13}
        />
        Open source
      </Btn> : null}
    </div>
  );
}
function monthSources(month: RiskMonth): Source[] {
  return month.fileIds.map((id, index) => {
    const source = month.sources.find((candidate) => candidate.file_id === id);
    return { fileId: id, label: source?.file_name || `Statement ${index + 1}`, page: source?.page };
  });
}
function DayInfo({ day, month, onPreview }: { day: RiskDay; month: RiskMonth; onPreview?: PreviewSource; }) {
  const accounts = [...new Set(day.sources.map((source) => source.account).filter(Boolean))];
  const sources = day.sources.map((source) => ({ fileId: source.file_id, label: source.file_name || source.account || "Statement", page: source.page }));
  return (
    <div className={styles.dayInfo}>
      <h5>{riskDateLabel(day.date)}</h5>
      <CellChip tone={day.negative ? "bad" : "mut"}>{day.negative ? "Negative-balance day reported" : "Daily closing balance not provided"}</CellChip>
      <p>{day.negative ? "A negative balance was reported on this date. Its exact daily closing amount was not provided." : "An unmarked day does not establish a positive or zero balance."}</p>
      {day.negative ? <p className={styles.note}>
        Account:{" "}
        {accounts.length ? accounts.join(", ") : month.accounts.length === 1 ? month.accounts[0] : "Not identified for this date"}
      </p> : null}
      <SourcePicker
        sources={sources.length ? sources : monthSources(month)}
        exact={sources.length > 0}
        onPreview={onPreview}
      />
    </div>
  );
}
function EventInfo({ event, month, onBack, onPreview }: { event: RiskEvent; month: RiskMonth; onBack: () => void; onPreview?: PreviewSource; }) {
  return (
    <div className={styles.eventInfo}>
      <button
        type="button"
        className={styles.back}
        onClick={onBack}
      >
        ← Back to entries
      </button>
      <h5>{RISK_EVENT_LABELS[event.type] ?? "Statement entry"}</h5>
      <dl>
        <div>
          <dt>Date</dt>
          <dd>{event.date ? riskDateLabel(event.date) : event.rawDate ? `${event.rawDate} (unvalidated date)` : "Not provided"}</dd>
        </div>
        <div>
          <dt>Account</dt>
          <dd>{event.account || "Not provided"}</dd>
        </div>
        <div>
          <dt>Recorded amount</dt>
          <dd>{amount(event.amount)}</dd>
        </div>
        <div>
          <dt>Type</dt>
          <dd>{RISK_EVENT_LABELS[event.type] ?? event.type}</dd>
        </div>
      </dl>
      <p className={styles.description}>{event.description || "Description not provided."}</p>
      {event.date && !event.inCalendar ? <p className={styles.note}>The recorded date is outside this statement month and is not placed on its calendar.</p> : null}
      {event.type === "returned_item" ? <p className={styles.note}>A returned-item amount is not counted as a fee or reported negative day.</p> : event.type === "negative_balance" ? <p className={styles.note}>This entry alone does not establish a reported negative day.</p> : null}
      <SourcePicker
        sources={event.fileId ? [{ fileId: event.fileId, label: event.fileName || "Source statement", page: event.page ?? undefined }] : monthSources(month)}
        exact={Boolean(event.fileId)}
        onPreview={onPreview}
      />
    </div>
  );
}

/** A date locates evidence; it never creates a daily balance or an additional incident. */
export function OverdraftCard({ months, accountLabel, needReread, accounts = [], onPreviewSource }: {
  months: CockpitMonth[]; accountLabel: string; needReread: number;
  accounts?: Array<Pick<CockpitAccount, "key" | "label" | "series">>; onPreviewSource?: PreviewSource;
}) {
  const titleId = useId(), calendarId = useId(), calendarRef = useRef<HTMLTableElement>(null);
  const [scope, setScope] = useState("current"), [monthKey, setMonthKey] = useState("");
  const [selectedDate, setSelectedDate] = useState<string | null>(null), [focusedDate, setFocusedDate] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null), [filter, setFilter] = useState("all"), [page, setPage] = useState(0), [view, setView] = useState("calendar");
  useEffect(() => { setScope("current"); }, [accountLabel]);
  const account = accounts.find((candidate) => candidate.key === scope);
  const models = useMemo(() => balanceRiskMonths(account?.series ?? months), [account?.series, months]);
  const totals = useMemo(() => riskTotals(models), [models]);
  const month = models.find((candidate) => candidate.month === monthKey) ?? models.at(-1), index = month ? models.indexOf(month) : -1;
  const railStart = Math.max(0, Math.min(index - 2, models.length - 6)), rail = models.slice(railStart, railStart + 6);
  useEffect(() => { setMonthKey(""); }, [scope]);
  useEffect(() => {
    setSelectedDate(null);
    setSelectedEvent(null);
    setPage(0);
    setFilter("all");
    setFocusedDate(month?.month ? `${month.month}-01` : "");
  }, [month?.month, scope, accountLabel]);
  const day = month?.days.find((candidate) => candidate.date === selectedDate), event = month?.events.find((candidate) => candidate.id === selectedEvent);
  const shownEvents = (month?.events ?? []).filter((item) => (!selectedDate || item.date === selectedDate) && (filter === "all" || filter === "fees" && feeEvent(item) || filter === "returned" && item.type === "returned_item" || filter === "undated" && !item.inCalendar));
  const eventPage = riskEventPage(shownEvents, page, 4), signal = month ? riskMonthSignal(month) : null;
  const changeMonth = (key: string) => {
    setMonthKey(key);
    setSelectedDate(null);
    setSelectedEvent(null);
    setPage(0);
  };
  const chooseDay = (date: string) => {
    setSelectedDate(date);
    setSelectedEvent(null);
    setPage(0);
    if(filter === "undated") setFilter("all");
  };
  return (
    <section
      className={`fc-card fc-wide ${styles.card}`}
      aria-labelledby={titleId}
    >
      <div className="fc-card-h">
        <div>
          <h4 id={titleId}>Balance risk</h4>
          <div className="sub">Reported below-zero days, fees and returned items, kept separate.</div>
        </div>
        <div className={styles.headerActions}>
          {accounts.length ? <label className={styles.account}>
            Account
            <select
              aria-label="Balance risk account"
              value={account ? scope : "current"}
              onChange={(change) => setScope(change.target.value)}
            >
              <option value="current">
                {`Current view · ${accountLabel}`}
              </option>
              {accounts.map((item) => <option
                key={item.key}
                value={item.key}
              >
                {item.label}
              </option>)}
            </select>
          </label> : <span className="sub">{accountLabel}</span>}
          <div
            className="fc-toggle"
            role="tablist"
            aria-label="Balance risk view"
          >
            {["calendar", "table"].map((item) => <button
              key={item}
              type="button"
              role="tab"
              aria-selected={view === item}
              className={view === item ? "on" : undefined}
              onClick={() => setView(item)}
            >
              {item === "calendar" ? "Calendar" : "Table"}
            </button>)}
          </div>
        </div>
      </div>
      {!models.length ? <p className={styles.empty}>No statement months are available. Negative days and event counts are unknown.</p> : <>
        <div
          className={styles.stats}
          aria-label="Balance risk summary"
        >
          <div>
            <span>{totals.accountDays ? "Negative account-days" : "Negative-balance days"}</span>
            <strong>{riskCountLabel(totals.negative)}</strong>
            <small>{totals.locatedDates ? `${totals.locatedDates} distinct dates located` : coverage(totals.negative)}</small>
          </div>
          <div>
            <span>NSF / overdraft items</span>
            <strong>{riskCountLabel(totals.fees)}</strong>
            <small>{coverage(totals.fees)}</small>
          </div>
          <div>
            <span>Returned items</span>
            <strong>{riskCountLabel(totals.returned)}</strong>
            <small>{coverage(totals.returned)}</small>
          </div>
          <div>
            <span>{totals.accountDays ? "Lowest account-month balance" : "Lowest reported balance"}</span>
            <strong className={totals.lowest != null && totals.lowest < 0 ? styles.loss : undefined}>{amount(totals.lowest)}</strong>
            <small>{totals.accountDays ? "Individual account lows; dates may differ" : "Monthly low; daily amount not supplied"}</small>
          </div>
        </div>
        <div className={styles.trend}>
          <span>{riskTrend(models)}</span>
          {totals.accountDays ? <small>One date negative in two accounts is two account-days. Calendar dates appear once.</small> : null}
        </div>
        {view === "table" ? <div className={styles.tableWrap}>
          <table className="tbl">
            <caption>Reported monthly balance risk. Fees and returns are separate from reported negative days.</caption>
            <thead>
              <tr>
                <th>Month</th>
                <th>Negative days / account-days</th>
                <th>NSF / overdraft</th>
                <th>Returned</th>
                <th>Account monthly low</th>
              </tr>
            </thead>
            <tbody>
              {models.map((item) => <tr key={item.month}>
                <td>
                  <button
                    type="button"
                    className={styles.back}
                    onClick={() => {
                      changeMonth(item.month);
                      setView("calendar");
                    }}
                  >
                    {item.label}
                  </button>
                </td>
                <td>{monthCount(item)}</td>
                <td>{monthCount(item, "nsf")}</td>
                <td>{monthCount(item, "returned")}</td>
                <td>{amount(item.lowest)}</td>
              </tr>)}
            </tbody>
          </table>
        </div> : <>
          <div
            className={styles.monthRail}
            aria-label="Monthly negative-day trend"
          >
            {rail.map((item) => <button
              type="button"
              key={item.month}
              aria-pressed={month?.month === item.month}
              data-tone={riskMonthSignal(item).tone}
              onClick={() => changeMonth(item.month)}
              aria-label={`${item.label}: ${monthCount(item)} negative ${item.accounts.length > 1 ? "account-days" : "balance days"}`}
            >
              <span>{monthShort(item.month)}</span>
              <strong>{monthCount(item)}</strong>
              <i
                aria-hidden="true"
                style={{ width: `${item.negativeDays == null ? 0 : Math.min(100, Math.max(item.negativeDays > 0 ? 8 : 0, item.negativeDays / Math.max(1, item.days.length * Math.max(1, item.accounts.length)) * 100))}%` }}
              />
            </button>)}
          </div>
          {month ? <>
            <div className={styles.monthHeader}>
              <Btn
                size="sm"
                disabled={index <= 0}
                aria-label="Previous statement month"
                onClick={() => changeMonth(models[index - 1].month)}
              >
                <Icon
                  name="chevL"
                  size={14}
                />
              </Btn>
              <label>
                Statement month
                <select
                  aria-label="Statement month"
                  value={month.month}
                  onChange={(change) => changeMonth(change.target.value)}
                >
                  {models.map((item) => <option
                    key={item.month}
                    value={item.month}
                  >
                    {item.label}
                  </option>)}
                </select>
              </label>
              <Btn
                size="sm"
                disabled={index >= models.length - 1}
                aria-label="Next statement month"
                onClick={() => changeMonth(models[index + 1].month)}
              >
                <Icon
                  name="chevR"
                  size={14}
                />
              </Btn>
              {signal ? <CellChip tone={signal.tone}>{signal.label}</CellChip> : null}
            </div>
            <div className={styles.layout}>
              <div className={styles.calendarPanel}>
                {month.days.length ? <table
                  ref={calendarRef}
                  role="grid"
                  className={styles.calendar}
                  aria-label={`${month.label} balance-risk calendar`}
                  aria-describedby={calendarId}
                >
                  <thead>
                    <tr>
                      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((weekday) => <th
                        key={weekday}
                        scope="col"
                      >
                        {weekday}
                      </th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: Math.ceil((month.offset + month.days.length) / 7) }, (_, week) => <tr key={week}>
                      {Array.from({ length: 7 }, (_, column) => {
                        const value = month.days[week * 7 + column - month.offset];
                        return (
                          <td
                            key={column}
                            role="gridcell"
                            aria-selected={value ? selectedDate === value.date : undefined}
                          >
                            {value ? <button
                              type="button"
                              data-date={value.date}
                              data-negative={value.negative || undefined}
                              data-selected={selectedDate === value.date || undefined}
                              tabIndex={(focusedDate || month.days[0].date) === value.date ? 0 : -1}
                              aria-label={riskDayLabel(value)}
                              aria-pressed={selectedDate === value.date}
                              onFocus={() => setFocusedDate(value.date)}
                              onClick={() => chooseDay(value.date)}
                              onKeyDown={(key) => {
                                const next = nextRiskDay(value.day, key.key, month.days.length, month.offset);
                                if(next == null) return;
                                key.preventDefault();
                                const target = month.days[next - 1];
                                setFocusedDate(target.date);
                                calendarRef.current?.querySelector<HTMLButtonElement>(`[data-date="${target.date}"]`)?.focus();
                              }}
                            >
                              <span>{value.day}</span>
                              <span
                                className={styles.markers}
                                aria-hidden="true"
                              >
                                {value.events.some(feeEvent) ? <i className={styles.feeDot} /> : null}
                                {value.events.some((item) => item.type === "returned_item") ? <i className={styles.returnDot}>↩</i> : null}
                                {value.events.some((item) => !feeEvent(item) && item.type !== "returned_item") ? <i className={styles.otherDot}>·</i> : null}
                              </span>
                            </button> : null}
                          </td>
                        );
                      })}
                    </tr>)}
                  </tbody>
                </table> : <p className={styles.empty}>Statement month unavailable; entries remain below.</p>}
                <div className={styles.legend}>
                  <span>
                    <i className={styles.negativeKey} />
                    Below-zero date
                  </span>
                  <span>
                    <i className={styles.unknownKey} />
                    Daily amount unknown
                  </span>
                  <span>
                    <i className={styles.feeDot} />
                    Fee entry
                  </span>
                  <span>
                    <i className={styles.returnDot}>↩</i>
                    Returned item
                  </span>
                </div>
                <p
                  id={calendarId}
                  className={styles.help}
                >
                  Arrow keys move between days; Enter or Space opens details. Unmarked days have no daily closing amount provided.
                </p>
                {month.countConflict ? <p className={styles.note}>The reported day count and dated or monthly-low evidence disagree. Review the source; no dates or counts have been invented.</p> : month.unlocatedDays ? <p className={styles.note}>
                  {`${month.countComplete.negativeDays ? "" : "At least "}${month.unlocatedDays} reported negative ${month.accounts.length > 1 ? "account-days" : "days"} lack an exact date and are not placed on the calendar.`}
                </p> : month.negativeDays == null ? <p className={styles.note}>Negative-day total not reported. Located dates establish those days only.</p> : null}
              </div>
              <div className={styles.inspector}>
                {event ? <EventInfo
                  event={event}
                  month={month}
                  onBack={() => setSelectedEvent(null)}
                  onPreview={onPreviewSource}
                /> : <>
                  {day ? <DayInfo
                    day={day}
                    month={month}
                    onPreview={onPreviewSource}
                  /> : <div className={styles.monthInfo}>
                    <h5>
                      {month.label}
                      {' '}
                      details
                    </h5>
                    <p>
                      {month.negativeDays == null ? "Negative-day count not reported" : `${monthCount(month)} negative ${month.accounts.length > 1 ? "account-days" : "balance days"} reported`}
                      {' '}
                      ·
                      {' '}
                      {month.locatedDates}
                      {' '}
                      distinct dates located.
                    </p>
                    <p className={styles.note}>
                      {`NSF / overdraft fee amounts read: ${amount(month.fees)}. Fee and return entries do not add to the reported negative-day count.`}
                    </p>
                  </div>}
                  <div className={styles.eventHeader}>
                    <h5>{day ? "Entries for this date" : "Statement entries"}</h5>
                    {day ? <button
                      type="button"
                      className={styles.back}
                      onClick={() => {
                        setSelectedDate(null);
                        setPage(0);
                      }}
                    >
                      All dates
                    </button> : null}
                  </div>
                  <label className={styles.eventFilter}>
                    Show
                    <select
                      aria-label="Statement event type"
                      value={filter}
                      onChange={(change) => {
                        setFilter(change.target.value);
                        setSelectedEvent(null);
                        setPage(0);
                        if(change.target.value === "undated") setSelectedDate(null);
                      }}
                    >
                      <option value="all">All entries</option>
                      <option value="fees">NSF / overdraft fees</option>
                      <option value="returned">Returned items</option>
                      <option value="undated">Unplaced dates</option>
                    </select>
                  </label>
                  {eventPage.items.length ? <ul
                    className={styles.events}
                    aria-label="Statement event records"
                  >
                    {eventPage.items.map((item) => <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedEvent(item.id)}
                      >
                        <span>
                          <b>{RISK_EVENT_LABELS[item.type] ?? "Statement entry"}</b>
                          <small>
                            {item.date ? riskDateLabel(item.date) : "Date not provided"}
                            {item.account ? ` · ${item.account}` : ""}
                          </small>
                        </span>
                        <strong>{amount(item.amount)}</strong>
                        <Icon
                          name="chevR"
                          size={13}
                        />
                      </button>
                    </li>)}
                  </ul> : <p className={styles.empty}>
                    {`No ${day ? "dated" : "matching"} entry details were provided for ${day ? "this day" : "this month"}.`}
                  </p>}
                  <div className={styles.pagination}>
                    <span role="status">{shownEvents.length ? `${eventPage.page * 4 + 1}–${Math.min((eventPage.page + 1) * 4, shownEvents.length)} of ${shownEvents.length} entries` : "0 entry records"}</span>
                    <Btn
                      size="sm"
                      disabled={eventPage.page === 0}
                      aria-label="Previous event page"
                      onClick={() => setPage(eventPage.page - 1)}
                    >
                      Previous
                    </Btn>
                    <Btn
                      size="sm"
                      disabled={eventPage.page + 1 >= eventPage.pages}
                      aria-label="Next event page"
                      onClick={() => setPage(eventPage.page + 1)}
                    >
                      Next
                    </Btn>
                  </div>
                </>}
              </div>
            </div>
          </> : null}
        </>}
        {needReread ? <p className={styles.note}>Some statements need a re-read before dated fee details are available.</p> : null}
      </>}
    </section>
  );
}
