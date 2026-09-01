"use client";

import { useQuery } from "@tanstack/react-query";
import { Select } from "@/components/ds";
import { useAuthedApi } from "@/hooks/useApi";

export const GENERAL_PROGRAM_KEY = "general_funding_discussion";
export const GENERAL_PROGRAM_NAME = "General funding discussion / Not decided yet";

type CatalogItem = { program_key: string; name: string };
type CatalogResponse = { items: CatalogItem[] };

export function ProgramSelect({
  programKey,
  programName,
  onChange,
}: {
  programKey: string | null | undefined;
  programName: string | null | undefined;
  onChange: (value: { key: string; name: string }) => void;
}) {
  const apiCall = useAuthedApi();
  const catalog = useQuery({
    queryKey: ["appointment-program-catalog"],
    queryFn: () => apiCall<CatalogResponse>("/dealer-os/products?locale=en"),
    staleTime: 5 * 60_000,
  });
  const items = catalog.data?.items ?? [];
  const selectedKey = programKey || GENERAL_PROGRAM_KEY;
  const historical = Boolean(
    programKey
      && programKey !== GENERAL_PROGRAM_KEY
      && !items.some((item) => item.program_key === programKey),
  );

  return (
    <Select
      value={selectedKey}
      disabled={catalog.isLoading}
      onChange={(event) => {
        const key = event.target.value;
        if (key === GENERAL_PROGRAM_KEY) {
          onChange({ key, name: GENERAL_PROGRAM_NAME });
          return;
        }
        const item = items.find((candidate) => candidate.program_key === key);
        if (item) onChange({ key: item.program_key, name: item.name });
      }}
    >
      <option value={GENERAL_PROGRAM_KEY}>{GENERAL_PROGRAM_NAME}</option>
      {historical && programKey ? (
        <option value={programKey}>
          {programName || programKey.replaceAll("_", " ")} (historical)
        </option>
      ) : null}
      {items.map((item) => (
        <option key={item.program_key} value={item.program_key}>{item.name}</option>
      ))}
    </Select>
  );
}
