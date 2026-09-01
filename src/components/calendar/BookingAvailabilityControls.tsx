"use client";

import { Icon } from "@/components/design-system/Icon";
import { Btn, Field, Input } from "@/components/ds";
import type { BookingDaySchedule, BookingTimeRange } from "@/lib/types";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function WeeklyScheduleEditor({
  value,
  defaultStart = "09:00",
  defaultEnd = "17:00",
  durationMin,
  onChange,
}: {
  value: BookingDaySchedule[];
  defaultStart?: string;
  defaultEnd?: string;
  durationMin: number;
  onChange: (value: BookingDaySchedule[]) => void;
}) {
  const schedule = normalizeSchedule(value);

  const replaceDay = (weekday: number, intervals: BookingTimeRange[]) => {
    onChange(schedule.map((day) => (
      day.weekday === weekday
        ? { ...day, intervals: [...intervals].sort((left, right) => left.start_time.localeCompare(right.start_time)) }
        : day
    )));
  };

  const toggleDay = (day: BookingDaySchedule) => {
    replaceDay(
      day.weekday,
      day.intervals.length ? [] : [{ start_time: defaultStart, end_time: defaultEnd }],
    );
  };

  const addRange = (day: BookingDaySchedule) => {
    const next = findOpenRange(day.intervals, durationMin);
    if (next) replaceDay(day.weekday, [...day.intervals, next]);
  };

  return (
    <div className="booking-weekly-editor" aria-label="Weekly booking schedule">
      {schedule.map((day) => {
        const enabled = day.intervals.length > 0;
        return (
          <div className={`booking-weekly-day${enabled ? " enabled" : ""}`} key={day.weekday}>
            <label className="booking-weekly-day-toggle">
              <input
                type="checkbox"
                checked={enabled}
                onChange={() => toggleDay(day)}
              />
              <span>{WEEKDAYS[day.weekday]}</span>
            </label>
            {enabled ? (
              <div className="booking-weekly-ranges">
                {day.intervals.map((range, index) => (
                  <div className="booking-weekly-range" key={`${day.weekday}-${index}`}>
                    <Input
                      type="time"
                      aria-label={`${WEEKDAYS[day.weekday]} start time ${index + 1}`}
                      value={range.start_time}
                      onChange={(event) => replaceDay(
                        day.weekday,
                        day.intervals.map((item, itemIndex) => (
                          itemIndex === index ? { ...item, start_time: event.target.value } : item
                        )),
                      )}
                    />
                    <span>to</span>
                    <Input
                      type="time"
                      aria-label={`${WEEKDAYS[day.weekday]} end time ${index + 1}`}
                      value={range.end_time}
                      onChange={(event) => replaceDay(
                        day.weekday,
                        day.intervals.map((item, itemIndex) => (
                          itemIndex === index ? { ...item, end_time: event.target.value } : item
                        )),
                      )}
                    />
                    <Btn
                      type="button"
                      size="sm"
                      aria-label={`Remove ${WEEKDAYS[day.weekday]} hours ${index + 1}`}
                      title="Remove hours"
                      onClick={() => replaceDay(
                        day.weekday,
                        day.intervals.filter((_, itemIndex) => itemIndex !== index),
                      )}
                    >
                      <Icon name="trash" size={13} />
                    </Btn>
                  </div>
                ))}
                <Btn
                  type="button"
                  size="sm"
                  onClick={() => addRange(day)}
                  disabled={day.intervals.length >= 6 || !findOpenRange(day.intervals, durationMin)}
                >
                  <Icon name="plus" size={13} /> Add hours
                </Btn>
              </div>
            ) : (
              <span className="booking-weekly-unavailable">Unavailable</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function AdvanceBookingWindowControls({
  enabled,
  minimumDays,
  maximumDays,
  onChange,
}: {
  enabled: boolean;
  minimumDays: number;
  maximumDays: number;
  onChange: (patch: {
    advance_booking_window_enabled?: boolean;
    minimum_notice_days?: number;
    maximum_advance_days?: number;
  }) => void;
}) {
  const invalid = enabled && maximumDays < minimumDays;
  return (
    <div className="booking-window-controls">
      <label className="booking-window-toggle">
        <span>
          <strong>Limit advance booking</strong>
          <small>{enabled ? "Use the booking range below." : "Standard range: 2 hours to 15 days ahead."}</small>
        </span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onChange({ advance_booking_window_enabled: event.target.checked })}
        />
      </label>
      {enabled ? (
        <div className="booking-window-fields">
          <Field label="Earliest booking">
            <div className="booking-window-input">
              <Input
                type="number"
                min={0}
                max={365}
                value={minimumDays}
                onChange={(event) => onChange({ minimum_notice_days: Math.max(0, Number(event.target.value)) })}
              />
              <span>days ahead</span>
            </div>
          </Field>
          <Field label="Latest booking">
            <div className="booking-window-input">
              <Input
                type="number"
                min={1}
                max={365}
                value={maximumDays}
                onChange={(event) => onChange({ maximum_advance_days: Math.max(1, Number(event.target.value)) })}
              />
              <span>days ahead</span>
            </div>
          </Field>
          {invalid ? <div className="booking-window-error">Latest booking must be on or after earliest booking.</div> : null}
        </div>
      ) : null}
    </div>
  );
}

export function activeScheduleDays(schedule: BookingDaySchedule[]): number[] {
  return normalizeSchedule(schedule)
    .filter((day) => day.intervals.length > 0)
    .map((day) => day.weekday);
}

export function scheduleBounds(
  schedule: BookingDaySchedule[],
  fallbackStart: string,
  fallbackEnd: string,
): { start_time: string; end_time: string } {
  const intervals = normalizeSchedule(schedule).flatMap((day) => day.intervals);
  if (!intervals.length) return { start_time: fallbackStart, end_time: fallbackEnd };
  return {
    start_time: intervals.reduce((current, item) => item.start_time < current ? item.start_time : current, intervals[0].start_time),
    end_time: intervals.reduce((current, item) => item.end_time > current ? item.end_time : current, intervals[0].end_time),
  };
}

function normalizeSchedule(value: BookingDaySchedule[] | undefined): BookingDaySchedule[] {
  const byDay = new Map((value ?? []).map((day) => [day.weekday, day]));
  return WEEKDAYS.map((_, weekday) => ({
    weekday,
    intervals: [...(byDay.get(weekday)?.intervals ?? [])].sort((left, right) => left.start_time.localeCompare(right.start_time)),
  }));
}

function findOpenRange(intervals: BookingTimeRange[], durationMin: number): BookingTimeRange | null {
  const length = Math.max(60, durationMin);
  const occupied = intervals
    .map((item) => ({ start: timeToMinutes(item.start_time), end: timeToMinutes(item.end_time) }))
    .filter((item): item is { start: number; end: number } => item.start !== null && item.end !== null)
    .sort((left, right) => left.start - right.start);
  const starts = [
    ...(occupied.length ? [occupied[occupied.length - 1].end + 30] : [9 * 60]),
    ...Array.from({ length: 48 }, (_, index) => index * 30),
  ];
  const start = starts.find((candidate) => (
    candidate + length <= 24 * 60 - 1
    && !occupied.some((item) => candidate < item.end && candidate + length > item.start)
  ));
  return start === undefined
    ? null
    : { start_time: minutesToTime(start), end_time: minutesToTime(start + length) };
}

function timeToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? hour * 60 + minute : null;
}

function minutesToTime(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
