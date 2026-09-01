"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  SearchableCombobox,
  type ComboboxOption,
} from "@/components/application/SearchableCombobox";
import { useAuthedApi } from "@/hooks/useApi";
import type { AppointmentFileOption } from "@/lib/repAppointments";

const FILE_OPTION_LIMIT = 200;

function useDebouncedValue(value: string, delay = 200): string {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);

  return debounced;
}

function optionId(item: AppointmentFileOption): string {
  return `${item.kind}:${item.id}`;
}

function optionType(item: AppointmentFileOption): string {
  return item.kind === "intake" ? "AI Intake" : "Funding Loan";
}

function optionMeta(item: AppointmentFileOption): string {
  const status = item.status?.replaceAll("_", " ");
  return [item.subtitle, status].filter(Boolean).join(" · ");
}

export function CalendarFileCombobox({
  appointmentId,
  value,
  onChange,
  enabled = true,
  placeholder = "Choose or search authorized files",
}: {
  appointmentId?: string;
  value: AppointmentFileOption | null;
  onChange: (value: AppointmentFileOption | null) => void;
  enabled?: boolean;
  placeholder?: string;
}) {
  const apiCall = useAuthedApi();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query);
  const endpoint = appointmentId
    ? `/dealer-os/appointments/${appointmentId}/file-options`
    : "/dealer-os/calendar/file-options";

  useEffect(() => setQuery(""), [appointmentId]);

  const fileOptions = useQuery({
    queryKey: ["calendar-authorized-file-options", endpoint, debouncedQuery],
    queryFn: () => apiCall<{ items: AppointmentFileOption[] }>(
      `${endpoint}?q=${encodeURIComponent(debouncedQuery.trim())}&limit=${FILE_OPTION_LIMIT}`,
    ),
    enabled,
    staleTime: 30_000,
  });

  const records = useMemo(
    () => fileOptions.data?.items ?? [],
    [fileOptions.data?.items],
  );
  const recordsById = useMemo(
    () => new Map(records.map((item) => [optionId(item), item])),
    [records],
  );
  const options = useMemo<ComboboxOption[]>(
    () => records.map((item) => ({
      id: optionId(item),
      label: item.label,
      code: optionType(item),
      meta: optionMeta(item),
    })),
    [records],
  );
  const selected = value ? {
    id: optionId(value),
    label: value.label,
    code: optionType(value),
    meta: optionMeta(value),
  } : null;

  return (
    <SearchableCombobox
      value={selected}
      options={options}
      placeholder={placeholder}
      ariaLabel="Authorized file"
      loading={fileOptions.isLoading || fileOptions.isFetching}
      disabled={!enabled}
      onQueryChange={setQuery}
      onChange={(option) => {
        if (!option) {
          onChange(null);
          return;
        }
        onChange(recordsById.get(option.id) ?? null);
      }}
    />
  );
}
