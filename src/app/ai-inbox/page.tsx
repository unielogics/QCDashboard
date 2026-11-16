"use client";

// The Elara inbox was retired on 2026-11-16. Its two queues live where the
// work is: AI suggestions from rooms are answered on the dashboard and on each
// file (components/operator/AiSuggestionsPanel), and the older loan tasks are
// in the Elara rail's Tasks tab, which could always approve them.
//
// The address stays so nothing that points here breaks: saved bookmarks, the
// agent's next-action links (`/ai-inbox?task=…`), and old notification emails.

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCurrentUser } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import { useUI } from "@/store/ui";

export default function RetiredElaraInboxPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openElaraTasks = useUI((state) => state.openElaraTasks);
  const { data: user, isLoading } = useCurrentUser();
  const linkedTask = searchParams.get("task");

  useEffect(() => {
    if (isLoading || !user) return;
    const isDesk = user.role === Role.SUPER_ADMIN || user.role === Role.LOAN_EXEC;
    const hasRail = user.role !== Role.CLIENT && user.role !== Role.DEALER_PARTNER && user.role !== Role.VENDOR;
    // A link to one loan task, or an agent's queue, opens the rail on its tasks.
    if (hasRail && (linkedTask || !isDesk)) openElaraTasks();
    router.replace(isDesk && !linkedTask ? "/#ai-suggestions" : "/");
  }, [isLoading, user, linkedTask, openElaraTasks, router]);

  return null;
}
