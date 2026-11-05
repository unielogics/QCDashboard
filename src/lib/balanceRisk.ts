import type { CockpitMonth, CockpitRiskSource, OverdraftItem } from "./financialCockpit";

export type BalanceRiskSource = CockpitRiskSource;
export type BalanceRiskInput = CockpitMonth & { risk_sources?: BalanceRiskSource[] };
export type RiskEvent = {
  id: string; month: string; date: string | null; rawDate: string | null;
  type: string; description: string; amount: number | null; account: string | null;
  fileId: string | null; fileName: string | null; page: number | null; inCalendar: boolean;
};
export type RiskDay = { date: string; day: number; negative: boolean; events: RiskEvent[]; sources: BalanceRiskSource[] };
export type RiskMonth = {
  month: string; label: string; accounts: string[]; days: RiskDay[]; offset: number;
  negativeDays: number | null; nsf: number | null; returned: number | null;
  lowest: number | null; fees: number | null; events: RiskEvent[];
  sources: BalanceRiskSource[]; fileIds: string[]; locatedDates: number; unlocatedDays: number | null;
  countComplete: { negativeDays: boolean; nsf: boolean; returned: boolean };
  countConflict: boolean;
};
export type RiskCount = { value: number | null; complete: boolean; reportedMonths: number; totalMonths: number };

export const RISK_EVENT_LABELS: Record<string, string> = {
  nsf_fee: "NSF fee", overdraft_fee: "Overdraft fee", returned_item: "Returned item",
  negative_balance: "Negative-balance entry", other: "Statement entry",
};
export const riskNumber = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const riskCount = (value: unknown) => { const number = riskNumber(value); return number != null && number >= 0 && Number.isInteger(number) ? number : null; };
export const feeEvent = (event: Pick<RiskEvent, "type">) => event.type === "nsf_fee" || event.type === "overdraft_fee";
export function validRiskDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value ? value : null;
}
export function riskMonthDays(month: string): { days: number; offset: number } | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const first = new Date(`${month}-01T12:00:00Z`);
  const next = new Date(first); next.setUTCMonth(next.getUTCMonth() + 1); next.setUTCDate(0);
  return { days: next.getUTCDate(), offset: (first.getUTCDay() + 6) % 7 };
}
export function riskDateLabel(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** Calendar dates are locations, not additional incidents or invented daily balances. */
export function balanceRiskMonths(input: BalanceRiskInput[]): RiskMonth[] {
  return [...input].sort((a, b) => a.month.localeCompare(b.month)).map((month, index) => {
    const geometry = riskMonthDays(month.month);
    const sources = (month.risk_sources ?? []).filter((source) => Boolean(source.file_id));
    const negativeDates = new Set([...(month.negative_dates ?? []), ...sources.flatMap((source) => source.negative_dates ?? [])].filter((date) => validRiskDate(date) && date.startsWith(`${month.month}-`)));
    const events = (month.overdraft_items ?? []).map((item: OverdraftItem, itemIndex): RiskEvent => {
      const source = item as OverdraftItem & { file_id?: string; file_name?: string; page?: number };
      const date = validRiskDate(item.date);
      return {
        id: `${month.month}:${index}:${itemIndex}`, month: month.month, date,
        rawDate: typeof item.date === "string" && item.date ? item.date : null,
        type: String(item.type || "other"), description: String(item.description || ""),
        amount: riskNumber(item.amount), account: item.account || null,
        fileId: source.file_id || null, fileName: source.file_name || null,
        page: Number.isInteger(source.page) && (source.page ?? 0) > 0 ? source.page! : null,
        inCalendar: date != null && date.startsWith(`${month.month}-`),
      };
    });
    const feeAmounts = events.filter(feeEvent).map((event) => event.amount).filter((value): value is number => value != null);
    const accounts = [...new Set((month.accounts ?? []).filter(Boolean))];
    const negativeDays = riskCount(month.negative_days);
    const accountDates = new Set(sources.flatMap((source) => (source.negative_dates ?? []).filter((date) => validRiskDate(date) && date.startsWith(`${month.month}-`)).map((date) => `${source.account}\0${date}`)));
    const mappedDays = accounts.length <= 1 ? negativeDates.size : sources.length ? accountDates.size : null;
    const sourceLows = sources.map((source) => riskNumber(source.low_balance)).filter((value): value is number => value != null);
    const lowest = accounts.length > 1 ? sourceLows.length ? Math.min(...sourceLows) : null : riskNumber(month.low_balance);
    const sourceCountsComplete = !sources.length || sources.every((source) => riskCount(source.negative_days) != null);
    const countConflict = negativeDays != null && sourceCountsComplete && ((mappedDays != null && negativeDays < mappedDays) || negativeDays === 0 && lowest != null && lowest < 0);
    return {
      month: month.month, label: month.label || month.month, accounts,
      offset: geometry?.offset ?? 0,
      days: Array.from({ length: geometry?.days ?? 0 }, (_, day): RiskDay => {
        const date = `${month.month}-${String(day + 1).padStart(2, "0")}`;
        return { date, day: day + 1, negative: negativeDates.has(date), events: events.filter((event) => event.inCalendar && event.date === date), sources: sources.filter((source) => source.negative_dates?.includes(date)) };
      }),
      negativeDays, nsf: riskCount(month.nsf), returned: riskCount(month.returned_checks),
      countComplete: {
        negativeDays: negativeDays != null && !countConflict && (!sources.length || sources.every((source) => riskCount(source.negative_days) != null)),
        nsf: riskCount(month.nsf) != null && (!sources.length || sources.every((source) => riskCount(source.nsf) != null)),
        returned: riskCount(month.returned_checks) != null && (!sources.length || sources.every((source) => riskCount(source.returned_checks) != null)),
      },
      lowest, fees: feeAmounts.length ? feeAmounts.reduce((sum, value) => sum + value, 0) : null, events, sources, countConflict,
      fileIds: [...new Set([...(month.file_ids ?? []), ...sources.map((source) => source.file_id)])],
      locatedDates: negativeDates.size,
      unlocatedDays: negativeDays != null && mappedDays != null ? Math.max(0, negativeDays - mappedDays) : null,
    };
  });
}
export function riskTotals(months: RiskMonth[]) {
  const count = (key: "negativeDays" | "nsf" | "returned"): RiskCount => {
    const values = months.map((month) => month[key]).filter((value): value is number => value != null);
    const reportedMonths = months.filter((month) => month.countComplete[key]).length;
    return { value: values.length ? values.reduce((sum, value) => sum + value, 0) : null, complete: months.length > 0 && reportedMonths === months.length, reportedMonths, totalMonths: months.length };
  };
  const lows = months.map((month) => month.lowest).filter((value): value is number => value != null);
  return { negative: count("negativeDays"), fees: count("nsf"), returned: count("returned"), lowest: lows.length ? Math.min(...lows) : null, locatedDates: new Set(months.flatMap((month) => month.days.filter((day) => day.negative).map((day) => day.date))).size, accountDays: months.some((month) => month.accounts.length > 1) };
}
export function riskCountLabel(count: RiskCount): string {
  if (count.value == null) return "Not reported";
  return count.complete ? String(count.value) : count.value === 0 ? "0 reported" : `${count.value}+`;
}
export function riskMonthSignal(month: RiskMonth): { label: string; tone: "bad" | "warn" | "mut" | "ok" } {
  if ((month.negativeDays ?? 0) > 0 || month.locatedDates > 0) return { label: "Below-zero days reported", tone: "bad" };
  if (month.lowest != null && month.lowest < 0) return { label: month.countConflict ? "Negative monthly low; day count needs review" : "Negative monthly low; dates not provided", tone: "warn" };
  if ((month.nsf ?? 0) > 0 || (month.returned ?? 0) > 0 || month.events.some((event) => feeEvent(event) || event.type === "returned_item")) return { label: "Fee or return activity", tone: "warn" };
  return month.negativeDays === 0 && month.countComplete.negativeDays ? { label: "No negative days reported", tone: "ok" } : { label: "Daily evidence incomplete", tone: "mut" };
}
export function riskTrend(months: RiskMonth[]): string {
  const last = months.at(-1), before = months.at(-2);
  if (!last || !before || last.negativeDays == null || before.negativeDays == null || !last.countComplete.negativeDays || !before.countComplete.negativeDays) return "Trend needs two fully reported months";
  if ([...last.accounts].sort().join("\0") !== [...before.accounts].sort().join("\0")) return "Account mix changed; compare individual accounts";
  const difference = last.negativeDays - before.negativeDays;
  const unit = months.some((month) => month.accounts.length > 1) ? "account-days" : "days";
  return difference ? `${Math.abs(difference)} fewer ${unit} than ${before.label}`.replace("fewer", difference > 0 ? "more" : "fewer") : `Negative-day count unchanged from ${before.label}`;
}
export function riskDayLabel(day: RiskDay): string {
  const fees = day.events.filter(feeEvent).length, returned = day.events.filter((event) => event.type === "returned_item").length;
  return `${riskDateLabel(day.date)}: ${day.negative ? "negative-balance day reported" : "daily closing balance not provided"}${fees ? `; ${fees} fee event${fees === 1 ? "" : "s"}` : ""}${returned ? `; ${returned} returned item${returned === 1 ? "" : "s"}` : ""}${day.events.length > fees + returned ? "; other statement entries" : ""}`;
}
/** Roving calendar focus stays in the displayed month; selection still uses Enter or Space. */
export function nextRiskDay(day: number, key: string, days: number, offset: number): number | null {
  const weekday = (offset + day - 1) % 7;
  const target = key === "ArrowRight" ? day + 1 : key === "ArrowLeft" ? day - 1 : key === "ArrowDown" ? day + 7 : key === "ArrowUp" ? day - 7 : key === "Home" ? day - weekday : key === "End" ? day + 6 - weekday : null;
  return target == null ? null : Math.max(1, Math.min(days, target));
}
export function riskEventPage(events: RiskEvent[], page: number, size = 6) {
  const pages = Math.max(1, Math.ceil(events.length / size));
  const current = Math.min(Math.max(0, page), pages - 1);
  return { page: current, pages, items: events.slice(current * size, (current + 1) * size) };
}
