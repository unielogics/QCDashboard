import { redirect } from "next/navigation";

type SearchParamValue = string | string[] | undefined;

export default function ClientDetailRedirect({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: Record<string, SearchParamValue>;
}) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const v of value) qs.append(key, v);
    } else if (value !== undefined) {
      qs.append(key, value);
    }
  }
  const query = qs.toString();
  redirect(`/clients/${params.id}/workspace${query ? `?${query}` : ""}`);
}
