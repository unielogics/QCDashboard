export type IntakeNotificationRule = {
  enabled: boolean;
  email_enabled: boolean;
  in_app_enabled: boolean;
  to_user_ids: string[];
  cc_user_ids: string[];
};

export function notificationRuleProblem(rule: IntakeNotificationRule): string | null {
  if (!rule.enabled) return null;
  if (!rule.email_enabled && !rule.in_app_enabled) return "Choose Email or In-app delivery, or turn this event off.";
  if (!rule.to_user_ids.length) return "Choose at least one primary (TO) recipient, or turn this event off.";
  if (rule.cc_user_ids.length && !rule.email_enabled) return "CC recipients require Email delivery.";
  if (rule.to_user_ids.some((id) => rule.cc_user_ids.includes(id))) return "A person cannot be both TO and CC.";
  return null;
}

export function setNotificationChannel(
  rule: IntakeNotificationRule,
  channel: "email" | "in_app",
  checked: boolean,
): IntakeNotificationRule {
  const next = {
    ...rule,
    email_enabled: channel === "email" ? checked : rule.email_enabled,
    in_app_enabled: channel === "in_app" ? checked : rule.in_app_enabled,
    cc_user_ids: channel === "email" && !checked ? [] : rule.cc_user_ids,
  };
  return {
    ...next,
    // "On" always means there is a real channel. Removing the final channel
    // switches the event Off instead of leaving a misleading no-op route.
    enabled: next.email_enabled || next.in_app_enabled ? next.enabled : false,
  };
}

export function togglePrimaryRecipient(
  rule: IntakeNotificationRule,
  userId: string,
): IntakeNotificationRule {
  const selected = rule.to_user_ids.includes(userId);
  const toUserIds = selected
    ? rule.to_user_ids.filter((id) => id !== userId)
    : [...rule.to_user_ids, userId];
  const hasPrimary = toUserIds.length > 0;
  return {
    ...rule,
    // Selecting a recipient is a direct, touch-friendly way to turn on an
    // event that was previously Off. Removing the final TO turns it Off.
    enabled: hasPrimary ? true : false,
    email_enabled: hasPrimary && !rule.email_enabled && !rule.in_app_enabled ? true : rule.email_enabled,
    to_user_ids: toUserIds,
    cc_user_ids: rule.cc_user_ids.filter((id) => id !== userId),
  };
}

export function notificationRuleSummary(rule: IntakeNotificationRule): string {
  if (!rule.enabled) return "Off";
  const channels = [rule.email_enabled ? "Email" : "", rule.in_app_enabled ? "In-app" : ""].filter(Boolean).join(" + ");
  const cc = rule.cc_user_ids.length ? ` · ${rule.cc_user_ids.length} CC` : "";
  return `${channels || "No channel"} · ${rule.to_user_ids.length} TO${cc}`;
}
