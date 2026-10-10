"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Btn, Callout, CellChip, Field, Input, Select, Textarea } from "@/components/ds";
import { ApiError } from "@/lib/api";
import { useAuthedApi, useCurrentUser } from "@/hooks/useApi";
import {
  CAPITAL_READINESS_PHASES,
  capitalReadinessBandLabel,
  capitalReadinessBandTone,
  capitalReadinessItemDetail,
  capitalReadinessItemTitle,
  capitalReadinessMetricLabel,
  capitalReadinessMetricTone,
  capitalReadinessReviewLabel,
  capitalReadinessReviewTone,
  formatReadinessMetric,
  type ApplicationCapitalReadinessSnapshot,
  type CapitalReadinessMetric,
  type CapitalReadinessAction,
  type CapitalReadinessFinancialPeriod,
} from "@/lib/capitalReadiness";

type Locale = "en" | "es";
type ActionEditorState = {
  phaseKey: string;
  title: string;
  dueDate: string;
  metricKey: string;
  baselineValue: string;
  targetValue: string;
  requiredEvidence: string;
  dependencies: string[];
};

type Props = {
  profileId?: string | null;
  initialSnapshot?: ApplicationCapitalReadinessSnapshot | null;
  locale?: Locale;
  canReview?: boolean;
  clientSafe?: boolean;
  title?: string;
  onSnapshot?: (snapshot: ApplicationCapitalReadinessSnapshot | null) => void;
};

const COPY = {
  en: {
    title: "Capital readiness",
    lede: "Financial preparation, evidence confidence, and the path to an underwriter-ready file.",
    provisional: "AI-assisted, provisional analysis. QC will review the underlying facts and the figures may change after human review.",
    reviewed: "QC reviewed this readiness baseline. Future evidence can create a new version without replacing this history.",
    score: "Readiness score",
    coverage: "Evidence coverage",
    confidence: "Confidence",
    policy: "Policy",
    baseline: "Baseline health metrics",
    pillars: "Readiness pillars",
    blockers: "Highest-impact blockers",
    strengths: "Verified strengths",
    phases: "Five-phase readiness plan",
    programs: "Program opportunities",
    sources: "Sources and calculation lineage",
    unavailable: "No Capital Readiness baseline has been calculated for this file yet.",
    unavailableDetail: "Evidence completion and program readiness remain separate and are not treated as this score.",
    calculate: "Calculate baseline",
    recalculate: "Recalculate from current evidence",
    calculating: "Calculating…",
    confirm: "Confirm baseline",
    revise: "Save reviewed revision",
    note: "Optional review note",
    empty: "Nothing is recorded in this section yet.",
    phaseNoActions: "No milestone has been assigned in this phase yet.",
    sourcePeriod: "Source period",
    lastCalculated: "Calculated",
    financialIntelligence: "Financial intelligence",
    weight: "weight",
    evidenceCoverage: "evidence coverage",
    confidenceLower: "confidence",
    trend: "trend",
    due: "Due",
    expectedImpact: "Expected impact",
    addAction: "Add action",
    actionTitle: "Action title",
    dueOptional: "Due date (optional)",
    saveAction: "Save action",
    cancel: "Cancel",
    startAction: "Start",
    completeAction: "Complete",
    reopenAction: "Reopen",
    evidenceSource: "Evidence source",
    hash: "Hash",
    needsReview: "Needs review",
    history: "History",
    hideHistory: "Hide history",
    loadingHistory: "Loading history…",
    historyUnavailable: "Snapshot history could not be loaded.",
    noPriorSnapshot: "This is the first recorded baseline.",
    materialChange: "Material change",
    noMaterialChange: "No material change",
    priorVersion: "Prior version",
    scoreChange: "Score change",
    coverageChange: "Coverage change",
    changedMetrics: "Changed metrics",
    sourcePeriods: "Source periods",
    hideSourcePeriods: "Hide source periods",
    loadingPeriods: "Loading source periods…",
    periodsUnavailable: "Financial source periods could not be loaded.",
    confirmPeriod: "Confirm",
    rejectPeriod: "Reject",
    correctPeriod: "Correct values",
    saveCorrection: "Save immutable correction",
    correctionNotice: "A correction creates a new confirmed period, supersedes this version, and recalculates readiness. Source lineage is retained.",
    metricOptional: "Metric (optional)",
    baselineOptional: "Baseline (optional)",
    targetOptional: "Target (optional)",
    evidenceOptional: "Evidence requirements (comma-separated)",
    dependencies: "Depends on",
    assignedToYou: "Responsible: you",
    conflictRefreshed: "This baseline changed in another session. The latest version is now shown; review it before trying again.",
  },
  es: {
    title: "Preparación de capital",
    lede: "Preparación financiera, confianza en la evidencia y el camino hacia un expediente listo para suscripción.",
    provisional: "Análisis provisional asistido por IA. QC revisará los datos y las cifras pueden cambiar después de la revisión humana.",
    reviewed: "QC revisó esta línea base. La nueva evidencia puede crear otra versión sin reemplazar el historial.",
    score: "Puntuación de preparación",
    coverage: "Cobertura de evidencia",
    confidence: "Confianza",
    policy: "Política",
    baseline: "Métricas financieras iniciales",
    pillars: "Pilares de preparación",
    blockers: "Bloqueos de mayor impacto",
    strengths: "Fortalezas verificadas",
    phases: "Plan de preparación en cinco fases",
    programs: "Oportunidades de programas",
    sources: "Fuentes y origen de los cálculos",
    unavailable: "Todavía no se ha calculado una línea base de preparación de capital para este expediente.",
    unavailableDetail: "La evidencia y la preparación de programas se mantienen separadas de esta puntuación.",
    calculate: "Calcular línea base",
    recalculate: "Recalcular con la evidencia actual",
    calculating: "Calculando…",
    confirm: "Confirmar línea base",
    revise: "Guardar revisión",
    note: "Nota de revisión opcional",
    empty: "Aún no hay información registrada en esta sección.",
    phaseNoActions: "Todavía no hay un hito asignado en esta fase.",
    sourcePeriod: "Período de origen",
    lastCalculated: "Calculado",
    financialIntelligence: "Inteligencia financiera",
    weight: "ponderación",
    evidenceCoverage: "cobertura de evidencia",
    confidenceLower: "confianza",
    trend: "tendencia",
    due: "Fecha límite",
    expectedImpact: "Impacto esperado",
    addAction: "Agregar acción",
    actionTitle: "Título de la acción",
    dueOptional: "Fecha límite (opcional)",
    saveAction: "Guardar acción",
    cancel: "Cancelar",
    startAction: "Iniciar",
    completeAction: "Completar",
    reopenAction: "Reabrir",
    evidenceSource: "Fuente de evidencia",
    hash: "Hash",
    needsReview: "Requiere revisión",
    history: "Historial",
    hideHistory: "Ocultar historial",
    loadingHistory: "Cargando historial…",
    historyUnavailable: "No se pudo cargar el historial de versiones.",
    noPriorSnapshot: "Esta es la primera línea base registrada.",
    materialChange: "Cambio material",
    noMaterialChange: "Sin cambio material",
    priorVersion: "Versión anterior",
    scoreChange: "Cambio de puntuación",
    coverageChange: "Cambio de cobertura",
    changedMetrics: "Métricas modificadas",
    sourcePeriods: "Períodos de origen",
    hideSourcePeriods: "Ocultar períodos",
    loadingPeriods: "Cargando períodos…",
    periodsUnavailable: "No se pudieron cargar los períodos financieros.",
    confirmPeriod: "Confirmar",
    rejectPeriod: "Rechazar",
    correctPeriod: "Corregir valores",
    saveCorrection: "Guardar corrección inmutable",
    correctionNotice: "La corrección crea un nuevo período confirmado, reemplaza esta versión y recalcula la preparación. Se conserva el origen de la evidencia.",
    metricOptional: "Métrica (opcional)",
    baselineOptional: "Línea base (opcional)",
    targetOptional: "Objetivo (opcional)",
    evidenceOptional: "Requisitos de evidencia (separados por comas)",
    dependencies: "Depende de",
    assignedToYou: "Responsable: usted",
    conflictRefreshed: "Esta línea base cambió en otra sesión. Ya se muestra la versión más reciente; revísela antes de volver a intentarlo.",
  },
} as const;

const METRIC_LABELS_ES: Record<string, string> = {
  gross_margin_pct: "Margen bruto",
  net_margin_pct: "Margen neto",
  revenue: "Ingresos",
  revenue_trend_pct: "Tendencia de ingresos",
  current_dscr: "DSCR actual",
  projected_dscr: "DSCR proyectado",
  average_daily_balance: "Saldo diario promedio",
  cash_runway_days: "Días de liquidez",
  monthly_debt_service: "Servicio de deuda mensual",
  debt_payment_pct: "Pagos de deuda / ingresos",
  property_noi: "Ingreso operativo neto de la propiedad",
  occupancy: "Ocupación",
  returned_items_90: "Partidas devueltas (90 días)",
  books_reconciled: "Libros conciliados",
  credit_score: "Puntaje de crédito",
  use_of_funds_complete: "Uso de fondos completo",
  internal_adjusted_ebitda: "EBITDA ajustado",
};

const METRIC_LABELS_EN: Record<string, string> = {
  gross_margin_pct: "Gross margin",
  net_margin_pct: "Net margin",
  revenue: "Revenue",
  revenue_trend_pct: "Revenue trend",
  current_dscr: "Current DSCR",
  projected_dscr: "Projected DSCR",
  average_daily_balance: "Average daily balance",
  cash_runway_days: "Cash runway days",
  monthly_debt_service: "Monthly debt service",
  debt_payment_pct: "Debt payments / revenue",
  property_noi: "Property net operating income",
  occupancy: "Occupancy",
  returned_items_90: "Returned items (90 days)",
  books_reconciled: "Books reconciled",
  credit_score: "Credit score",
  use_of_funds_complete: "Use of funds complete",
  internal_adjusted_ebitda: "Adjusted EBITDA",
};

const PHASE_LABELS_EN: Record<string, { label: string; detail: string }> = Object.fromEntries(
  CAPITAL_READINESS_PHASES.map((phase) => [phase.key, { label: phase.label, detail: phase.detail }]),
);

const PHASE_LABELS_ES: Record<string, { label: string; detail: string }> = {
  baseline_health_check: { label: "Diagnóstico inicial", detail: "Verificar las métricas financieras y bancarias iniciales." },
  financial_restructuring: { label: "Reestructuración financiera", detail: "Documentar ajustes legítimos y ordenar la presentación financiera." },
  system_tracking: { label: "Seguimiento del sistema", detail: "Monitorear hábitos, objetivos y progreso mensual." },
  pre_underwriting: { label: "Pre-suscripción", detail: "Verificar hitos y preparar el expediente para el suscriptor." },
  prime_capital: { label: "Preparación para capital preferencial", detail: "Alinear un expediente verificado con la opción de capital adecuada." },
};

const BAND_LABELS_ES: Record<string, string> = {
  ready_soon: "Listo pronto",
  three_to_six_months: "3–6 meses",
  six_to_twelve_months: "6–12 meses",
  one_plus_year: "1+ año",
  insufficient_evidence: "Evidencia insuficiente",
};
const REVIEW_LABELS_ES: Record<string, string> = { provisional: "Provisional", awaiting_review: "Pendiente de revisión de QC", confirmed: "Revisado por QC", revised: "Revisado y ajustado por QC" };
const METRIC_STATUS_ES: Record<string, string> = { concerning: "Preocupante", acceptable: "Aceptable", healthy: "Saludable", very_strong: "Muy sólido", unavailable: "No disponible" };
const PHASE_STATUS_ES: Record<string, string> = { not_started: "No iniciado", in_progress: "En progreso", ready: "Listo", completed: "Completado" };
const PILLAR_LABELS_ES: Record<string, string> = {
  revenue_earnings: "Ingresos y calidad de ganancias",
  debt_capital_structure: "Servicio de deuda y estructura de capital",
  liquidity_banking: "Liquidez y comportamiento bancario",
  bookkeeping_tax_integrity: "Contabilidad e integridad tributaria",
  credit_collateral: "Crédito y respaldo colateral",
  transaction_use_of_funds: "Transacción y uso de fondos",
};

const PILLAR_LABELS_EN: Record<string, string> = {
  revenue_earnings: "Revenue and earnings quality",
  debt_capital_structure: "Debt service and capital structure",
  liquidity_banking: "Liquidity and banking behavior",
  bookkeeping_tax_integrity: "Bookkeeping and tax integrity",
  credit_collateral: "Credit and collateral support",
  transaction_use_of_funds: "Transaction and use of funds",
};

const PRIORITY_METRICS = [
  "gross_margin_pct",
  "net_margin_pct",
  "revenue_trend_pct",
  "current_dscr",
  "average_daily_balance",
  "cash_runway_days",
  "monthly_debt_service",
  "debt_payment_pct",
];
const PROPERTY_PRIORITY_METRICS = [
  "property_noi",
  "current_dscr",
  "occupancy",
  "gross_margin_pct",
  "net_margin_pct",
  "average_daily_balance",
  "cash_runway_days",
  "monthly_debt_service",
];

export function CapitalReadinessPanel({
  profileId,
  initialSnapshot,
  locale = "en",
  canReview = false,
  clientSafe = false,
  title,
  onSnapshot,
}: Props) {
  const api = useAuthedApi();
  const { data: currentUser } = useCurrentUser();
  const [snapshot, setSnapshot] = useState<ApplicationCapitalReadinessSnapshot | null>(initialSnapshot ?? null);
  const [loading, setLoading] = useState(Boolean(profileId && initialSnapshot === undefined));
  const [busy, setBusy] = useState<"recalculate" | "confirm" | "revise" | "">("");
  const [error, setError] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [roadmapActions, setRoadmapActions] = useState<CapitalReadinessAction[] | null>(null);
  const [actionEditor, setActionEditor] = useState<ActionEditorState | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<ApplicationCapitalReadinessSnapshot[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const c = COPY[locale];

  const publish = useCallback((next: ApplicationCapitalReadinessSnapshot | null) => {
    setSnapshot(next);
    onSnapshot?.(next);
  }, [onSnapshot]);

  const load = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    setError(null);
    try {
      publish(await api<ApplicationCapitalReadinessSnapshot>(`/application-profiles/${profileId}/capital-readiness`));
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 404) publish(null);
      else setError(reason instanceof Error ? reason.message : "Capital Readiness could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [api, profileId, publish]);

  const loadActions = useCallback(async () => {
    if (!profileId || !canReview) return;
    try {
      setRoadmapActions(await api<CapitalReadinessAction[]>(`/application-profiles/${profileId}/capital-readiness/actions?include_history=false`));
      setActionError(null);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Readiness actions could not be loaded.");
    }
  }, [api, canReview, profileId]);

  useEffect(() => {
    if (initialSnapshot !== undefined) {
      publish(initialSnapshot);
      setLoading(false);
      return;
    }
    void load();
  }, [initialSnapshot, load, publish]);

  useEffect(() => {
    void loadActions();
  }, [loadActions]);

  async function createAction() {
    if (!profileId || !actionEditor?.title.trim()) return;
    setActionBusy(`create:${actionEditor.phaseKey}`);
    setActionError(null);
    try {
      const baselineValue = optionalNumber(actionEditor.baselineValue);
      const targetValue = optionalNumber(actionEditor.targetValue);
      await api<CapitalReadinessAction>(`/application-profiles/${profileId}/capital-readiness/actions`, {
        method: "POST",
        body: JSON.stringify({
          phase_key: actionEditor.phaseKey,
          title: actionEditor.title.trim(),
          baseline: actionEditor.metricKey && baselineValue != null ? { metric_key: actionEditor.metricKey, value: baselineValue } : {},
          target: actionEditor.metricKey && targetValue != null ? { metric_key: actionEditor.metricKey, value: targetValue } : {},
          owner_user_id: currentUser?.id || undefined,
          due_date: actionEditor.dueDate || undefined,
          dependencies: actionEditor.dependencies,
          required_evidence: actionEditor.requiredEvidence.split(",").map((item) => item.trim()).filter(Boolean),
          status: "not_started",
          idempotency_key: globalThis.crypto?.randomUUID?.() ?? `readiness-action-${Date.now()}`,
        }),
      });
      setActionEditor(null);
      await Promise.all([loadActions(), load()]);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "The readiness action could not be saved.");
    } finally {
      setActionBusy(null);
    }
  }

  async function updateActionStatus(action: CapitalReadinessAction, status: string) {
    const actionKey = action.action_key || action.key;
    if (!profileId || !actionKey || action.version == null) return;
    setActionBusy(actionKey);
    setActionError(null);
    try {
      await api<CapitalReadinessAction>(`/application-profiles/${profileId}/capital-readiness/actions/${encodeURIComponent(actionKey)}`, {
        method: "PATCH",
        body: JSON.stringify({
          expected_version: action.version,
          idempotency_key: globalThis.crypto?.randomUUID?.() ?? `readiness-action-${Date.now()}`,
          status,
        }),
      });
      await Promise.all([loadActions(), load()]);
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) {
        await Promise.all([loadActions(), load()]);
        setActionError(c.conflictRefreshed);
      } else {
        setActionError(reason instanceof Error ? reason.message : "The readiness action could not be updated.");
      }
    } finally {
      setActionBusy(null);
    }
  }

  async function toggleHistory() {
    const nextOpen = !historyOpen;
    setHistoryOpen(nextOpen);
    if (!nextOpen || history !== null || !profileId) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      setHistory(await api<ApplicationCapitalReadinessSnapshot[]>(`/application-profiles/${profileId}/capital-readiness/history?limit=20`));
    } catch (reason) {
      setHistoryError(reason instanceof Error ? reason.message : c.historyUnavailable);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function recalculate() {
    if (!profileId) return;
    setBusy("recalculate");
    setError(null);
    try {
      const next = await api<ApplicationCapitalReadinessSnapshot>(`/application-profiles/${profileId}/capital-readiness/recalculate`, {
        method: "POST",
        body: JSON.stringify({
          idempotency_key: globalThis.crypto?.randomUUID?.() ?? `readiness-${Date.now()}`,
          expected_snapshot_version: snapshot?.snapshot_version,
        }),
      });
      publish(next);
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) {
        await load();
        setError(c.conflictRefreshed);
      } else {
        setError(reason instanceof Error ? reason.message : "Capital Readiness could not be recalculated.");
      }
    } finally {
      setBusy("");
    }
  }

  async function review(status: "confirmed" | "revised") {
    if (!profileId || !snapshot) return;
    setBusy(status === "confirmed" ? "confirm" : "revise");
    setError(null);
    try {
      const next = await api<ApplicationCapitalReadinessSnapshot>(`/application-profiles/${profileId}/capital-readiness/review`, {
        method: "POST",
        body: JSON.stringify({
          expected_snapshot_version: snapshot.snapshot_version,
          status,
          note: reviewNote.trim() || undefined,
        }),
      });
      setReviewNote("");
      publish(next);
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) {
        await load();
        setError(c.conflictRefreshed);
      } else {
        setError(reason instanceof Error ? reason.message : "The readiness review could not be saved.");
      }
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return <section className="capital-readiness-card"><div className="empty">Loading Capital Readiness…</div></section>;
  }

  if (!snapshot) {
    if (clientSafe) return null;
    return (
      <section className="capital-readiness-card capital-readiness-empty">
        <div>
          <span className="lbl">Financial intelligence</span>
          <h3>{title || c.title}</h3>
          <p>{c.unavailable}</p>
          <span className="sub">{c.unavailableDetail}</span>
        </div>
        {profileId ? <Btn variant="pri" onClick={() => void recalculate()} disabled={Boolean(busy)}>{busy ? c.calculating : c.calculate}</Btn> : null}
        {error ? <div className="capital-readiness-inline-error">{error}</div> : null}
      </section>
    );
  }

  return (
    <CapitalReadinessSnapshotView
      snapshot={snapshot}
      locale={locale}
      clientSafe={clientSafe}
      title={title}
      error={error}
      actions={!clientSafe ? (
        <Btn onClick={() => void recalculate()} disabled={Boolean(busy)}>{busy === "recalculate" ? c.calculating : c.recalculate}</Btn>
      ) : undefined}
      review={canReview ? (
        <><div className="capital-readiness-review">
          <Textarea aria-label={c.note} rows={2} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder={c.note} />
          <div className="capital-readiness-review-actions">
            <Btn onClick={() => void review("revised")} disabled={Boolean(busy)}>{busy === "revise" ? c.calculating : c.revise}</Btn>
            <Btn variant="pri" onClick={() => void review("confirmed")} disabled={Boolean(busy)}>{busy === "confirm" ? c.calculating : c.confirm}</Btn>
          </div>
        </div>{actionError ? <div className="capital-readiness-inline-error">{actionError}</div> : null}</>
      ) : undefined}
      roadmapActions={roadmapActions}
      actionEditor={actionEditor}
      actionBusy={actionBusy}
      onEditAction={canReview && currentUser ? setActionEditor : undefined}
      onCreateAction={canReview && currentUser ? createAction : undefined}
      onUpdateActionStatus={canReview ? updateActionStatus : undefined}
      actionOwnerLabel={currentUser ? `${c.assignedToYou} · ${currentUser.name || currentUser.email}` : undefined}
      historyOpen={historyOpen}
      history={history}
      historyLoading={historyLoading}
      historyError={historyError}
      onToggleHistory={profileId ? toggleHistory : undefined}
      sourcePeriods={canReview && profileId ? <FinancialPeriodsDisclosure profileId={profileId} locale={locale} onRecalculate={recalculate} /> : undefined}
    />
  );
}

export function CapitalReadinessSnapshotView({
  snapshot,
  locale = "en",
  clientSafe = false,
  title,
  actions,
  review,
  error,
  roadmapActions,
  actionEditor,
  actionBusy,
  onEditAction,
  onCreateAction,
  onUpdateActionStatus,
  actionOwnerLabel,
  historyOpen = false,
  history,
  historyLoading = false,
  historyError,
  onToggleHistory,
  sourcePeriods,
}: {
  snapshot: ApplicationCapitalReadinessSnapshot;
  locale?: Locale;
  clientSafe?: boolean;
  title?: string;
  actions?: React.ReactNode;
  review?: React.ReactNode;
  error?: string | null;
  roadmapActions?: CapitalReadinessAction[] | null;
  actionEditor?: ActionEditorState | null;
  actionBusy?: string | null;
  onEditAction?: (value: ActionEditorState | null) => void;
  onCreateAction?: () => void;
  onUpdateActionStatus?: (action: CapitalReadinessAction, status: string) => void;
  actionOwnerLabel?: string;
  historyOpen?: boolean;
  history?: ApplicationCapitalReadinessSnapshot[] | null;
  historyLoading?: boolean;
  historyError?: string | null;
  onToggleHistory?: () => void;
  sourcePeriods?: React.ReactNode;
}) {
  // Client-safe surfaces preserve the file's communication language. Staff
  // surfaces use the signed-in operator's UI language and regenerate known
  // labels from stable keys rather than replaying persisted translated text.
  const staffLocale = snapshot.display_locale === "es" || snapshot.display_locale === "en" ? snapshot.display_locale : locale;
  const displayLocale = clientSafe && (snapshot.communication_locale === "es" || snapshot.communication_locale === "en")
    ? snapshot.communication_locale
    : staffLocale;
  const useStableNarratives = !clientSafe && snapshot.display_locale !== displayLocale;
  const c = COPY[displayLocale];
  const metrics = useMemo(() => {
    const priorities = snapshot.metrics.some((metric) => metric.source?.property_policy === "noi_dscr") ? PROPERTY_PRIORITY_METRICS : PRIORITY_METRICS;
    return [...snapshot.metrics].sort((left, right) => {
    const leftIndex = priorities.indexOf(left.key);
    const rightIndex = priorities.indexOf(right.key);
    return (leftIndex < 0 ? 999 : leftIndex) - (rightIndex < 0 ? 999 : rightIndex);
    }).slice(0, 8);
  }, [snapshot.metrics]);
  const phases = useMemo(() => snapshot.phases ?? [], [snapshot.phases]);
  const snapshotPhases = useMemo(() => new Map(phases.map((phase) => [phase.key, phase])), [phases]);
  const provisional = snapshot.review_status === "provisional" || snapshot.review_status === "awaiting_review";
  const visibleScore = snapshot.evidence_coverage_pct >= 60 ? snapshot.score : null;

  return (
    <section className="capital-readiness-card" aria-labelledby={`capital-readiness-${snapshot.id}`}>
      <div className="capital-readiness-head">
        <div>
          <span className="lbl">{c.financialIntelligence} · v{snapshot.snapshot_version}</span>
          <h3 id={`capital-readiness-${snapshot.id}`}>{title || c.title}</h3>
          <p className="sub">{c.lede}</p>
        </div>
        <div className="capital-readiness-head-actions">
            <CellChip tone={capitalReadinessReviewTone(snapshot.review_status)}>{displayLocale === "es" ? REVIEW_LABELS_ES[snapshot.review_status] : capitalReadinessReviewLabel(snapshot.review_status)}</CellChip>
          {actions}
        </div>
      </div>

      <Callout tone={provisional ? "warn" : "ok"}>{provisional ? c.provisional : c.reviewed}</Callout>
      {error ? <div className="capital-readiness-inline-error">{error}</div> : null}

      <div className="capital-readiness-overview">
        <div className="capital-readiness-score" style={{ "--readiness-score": `${visibleScore ?? 0}%` } as CSSProperties}>
          <div className="capital-readiness-score-ring">
            <strong>{visibleScore == null ? "—" : Math.round(visibleScore)}</strong>
            <span>{visibleScore == null ? "" : "/ 100"}</span>
          </div>
          <div>
            <span className="lbl">{c.score}</span>
            <CellChip tone={capitalReadinessBandTone(snapshot.band)}>{displayLocale === "es" ? BAND_LABELS_ES[snapshot.band] : capitalReadinessBandLabel(snapshot.band)}</CellChip>
          </div>
        </div>
        <ReadinessGauge label={c.coverage} value={snapshot.evidence_coverage_pct} />
        <ReadinessGauge label={c.confidence} value={snapshot.confidence_pct} />
        <div className="capital-readiness-policy">
          <span className="lbl">{c.policy}</span>
          <b>{snapshot.policy_key} v{snapshot.policy_version}{snapshot.formula_version ? ` · ${snapshot.formula_version}` : ""}</b>
          <small>{c.lastCalculated} {formatDate(snapshot.as_of)}</small>
        </div>
      </div>

      <ReadinessSection title={c.baseline} className="capital-readiness-metrics">
        {metrics.map((metric) => <MetricCard key={metric.key} metric={metric} locale={displayLocale} sourcePeriodLabel={c.sourcePeriod} />)}
        {!metrics.length ? <Empty text={c.empty} /> : null}
      </ReadinessSection>

      <ReadinessSection title={c.pillars} className="capital-readiness-pillars">
        {snapshot.pillars.map((pillar) => (
          <div className="capital-readiness-pillar" key={pillar.key}>
            <div><b>{localizedKnownLabel(pillar.key, displayLocale, PILLAR_LABELS_EN, PILLAR_LABELS_ES, pillar.label)}</b><span>{Math.round(pillar.weight)}% {c.weight}</span></div>
            <strong>{pillar.score == null ? "—" : Math.round(pillar.score)}</strong>
            <span className="capital-readiness-track"><span style={{ width: `${clamp(pillar.score ?? 0)}%` }} /></span>
            <small>{Math.round(pillar.coverage_pct)}% {c.evidenceCoverage}</small>
          </div>
        ))}
        {!snapshot.pillars.length ? <Empty text={c.empty} /> : null}
      </ReadinessSection>

      <div className="capital-readiness-two-column">
        <ReadinessSection title={c.blockers} className="capital-readiness-list is-blockers">
          {snapshot.blockers.slice(0, 6).map((item, index) => <NarrativeRow key={`${capitalReadinessItemTitle(item)}-${index}`} item={item} index={index + 1} locale={displayLocale} preferStable={useStableNarratives} kind="blocker" />)}
          {!snapshot.blockers.length ? <Empty text={c.empty} /> : null}
        </ReadinessSection>
        <ReadinessSection title={c.strengths} className="capital-readiness-list is-strengths">
          {snapshot.strengths.slice(0, 6).map((item, index) => <NarrativeRow key={`${capitalReadinessItemTitle(item)}-${index}`} item={item} locale={displayLocale} preferStable={useStableNarratives} kind="strength" />)}
          {!snapshot.strengths.length ? <Empty text={c.empty} /> : null}
        </ReadinessSection>
      </div>

      <ReadinessSection title={c.phases} className="capital-readiness-phases">
        {CAPITAL_READINESS_PHASES.map((phase) => {
          const serverPhase = snapshotPhases.get(phase.key);
          const translated = (displayLocale === "es" ? PHASE_LABELS_ES : PHASE_LABELS_EN)[phase.key];
          const items = roadmapActions == null
            ? serverPhase?.actions ?? []
            : roadmapActions.filter((action) => action.phase_key === phase.key);
          return (
            <div className="capital-readiness-phase" key={phase.key}>
              <span className="capital-readiness-phase-number">{phase.number}</span>
              <div>
                <div className="capital-readiness-phase-title"><b>{translated.label}</b>{serverPhase ? <CellChip tone={serverPhase.status === "completed" ? "ok" : serverPhase.status === "in_progress" || serverPhase.status === "ready" ? "acc" : "mut"}>{displayLocale === "es" ? PHASE_STATUS_ES[serverPhase.status] : serverPhase.status.replaceAll("_", " ")}</CellChip> : null}</div>
                <p>{translated.detail}</p>
                {items.map((item, index) => <PhaseActionRow key={item.id || item.action_key || item.key || `${phase.key}-${index}`} item={item} locale={displayLocale} busy={actionBusy === (item.action_key || item.key)} onStatus={onUpdateActionStatus} />)}
                {!items.length ? <small>{c.phaseNoActions}</small> : null}
                {actionEditor?.phaseKey === phase.key ? (
                  <div className="capital-readiness-action-editor">
                    <div className="capital-readiness-action-editor-grid">
                      <Field label={c.actionTitle} req><Input value={actionEditor.title} onChange={(event) => onEditAction?.({ ...actionEditor, title: event.target.value })} /></Field>
                      <Field label={c.dueOptional}><Input type="date" value={actionEditor.dueDate} onChange={(event) => onEditAction?.({ ...actionEditor, dueDate: event.target.value })} /></Field>
                      <Field label={c.metricOptional}>
                        <Select value={actionEditor.metricKey} onChange={(event) => onEditAction?.({ ...actionEditor, metricKey: event.target.value })}>
                          <option value="">—</option>
                          {snapshot.metrics.map((metric) => <option key={metric.key} value={metric.key}>{localizedKnownLabel(metric.key, displayLocale, METRIC_LABELS_EN, METRIC_LABELS_ES, metric.label)}</option>)}
                        </Select>
                      </Field>
                      <Field label={c.baselineOptional} error={!optionalFiniteNumberValid(actionEditor.baselineValue) ? (displayLocale === "es" ? "Ingrese un número válido." : "Enter a valid number.") : undefined}><Input type="number" step="any" value={actionEditor.baselineValue} disabled={!actionEditor.metricKey} onChange={(event) => onEditAction?.({ ...actionEditor, baselineValue: event.target.value })} /></Field>
                      <Field label={c.targetOptional} error={!optionalFiniteNumberValid(actionEditor.targetValue) ? (displayLocale === "es" ? "Ingrese un número válido." : "Enter a valid number.") : undefined}><Input type="number" step="any" value={actionEditor.targetValue} disabled={!actionEditor.metricKey} onChange={(event) => onEditAction?.({ ...actionEditor, targetValue: event.target.value })} /></Field>
                      <Field className="capital-readiness-action-evidence" label={c.evidenceOptional}><Input value={actionEditor.requiredEvidence} onChange={(event) => onEditAction?.({ ...actionEditor, requiredEvidence: event.target.value })} placeholder={displayLocale === "es" ? "Estados bancarios, estado de resultados" : "Bank statements, profit and loss statement"} /></Field>
                    </div>
                    <small>{actionOwnerLabel}</small>
                    {roadmapActions?.some((action) => action.id) ? <fieldset className="capital-readiness-action-dependencies"><legend>{c.dependencies}</legend>{roadmapActions.filter((action) => action.id).map((action) => <label key={action.id}><input type="checkbox" checked={actionEditor.dependencies.includes(action.id!)} onChange={() => onEditAction?.({ ...actionEditor, dependencies: toggleValue(actionEditor.dependencies, action.id!) })} /><span>{action.title || action.label || action.action_key}</span></label>)}</fieldset> : null}
                    <div className="capital-readiness-action-editor-actions"><Btn size="sm" onClick={onCreateAction} disabled={!actionEditor.title.trim() || !optionalFiniteNumberValid(actionEditor.baselineValue) || !optionalFiniteNumberValid(actionEditor.targetValue) || actionBusy === `create:${phase.key}`}>{actionBusy === `create:${phase.key}` ? c.calculating : c.saveAction}</Btn><Btn size="sm" onClick={() => onEditAction?.(null)} disabled={Boolean(actionBusy)}>{c.cancel}</Btn></div>
                  </div>
                ) : onEditAction ? <Btn size="sm" onClick={() => onEditAction({ phaseKey: phase.key, title: "", dueDate: "", metricKey: "", baselineValue: "", targetValue: "", requiredEvidence: "", dependencies: [] })}>{c.addAction}</Btn> : null}
              </div>
            </div>
          );
        })}
      </ReadinessSection>

      {snapshot.program_opportunities.length ? (
        <ReadinessSection title={c.programs} className="capital-readiness-programs">
          {snapshot.program_opportunities.slice(0, 4).map((program, index) => <ProgramOpportunityCard key={program.key || program.program_key || index} program={program} locale={displayLocale} needsReview={c.needsReview} />)}
          {snapshot.program_opportunities.length > 4 ? <details className="capital-readiness-program-more"><summary>{displayLocale === "es" ? `Ver ${snapshot.program_opportunities.length - 4} oportunidades adicionales` : `Show ${snapshot.program_opportunities.length - 4} more opportunities`}</summary><div>{snapshot.program_opportunities.slice(4).map((program, index) => <ProgramOpportunityCard key={program.key || program.program_key || index + 4} program={program} locale={displayLocale} needsReview={c.needsReview} />)}</div></details> : null}
        </ReadinessSection>
      ) : null}

      {snapshot.source_manifest.length ? (
        <details className="capital-readiness-sources">
          <summary>{c.sources} ({snapshot.source_manifest.length})</summary>
          <div>
            {snapshot.source_manifest.map((source, index) => (
              <div key={`${source.kind}-${source.content_hash}-${index}`}>
                <b>{source.label || source.file_name || source.kind || c.evidenceSource}</b>
                <span>{[source.period, source.review_status, source.content_hash ? `${c.hash} ${source.content_hash.slice(0, 10)}…` : null].filter(Boolean).join(" · ")}</span>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {onToggleHistory ? (
        <section className="capital-readiness-history">
          <Btn size="sm" onClick={onToggleHistory} aria-expanded={historyOpen}>{historyOpen ? c.hideHistory : c.history}</Btn>
          {historyOpen ? (
            <div className="capital-readiness-history-body">
              {historyLoading ? <Empty text={c.loadingHistory} /> : null}
              {historyError ? <div className="capital-readiness-inline-error">{historyError}</div> : null}
              {!historyLoading && !historyError && history ? <ReadinessHistory snapshots={history} locale={displayLocale} /> : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {!clientSafe ? sourcePeriods : null}

      {!clientSafe && review ? review : null}
    </section>
  );
}

function ReadinessHistory({ snapshots, locale }: { snapshots: ApplicationCapitalReadinessSnapshot[]; locale: Locale }) {
  const c = COPY[locale];
  return <div className="capital-readiness-history-list">
    {snapshots.map((item) => {
      const change = item.material_change;
      return <details key={item.id} className="capital-readiness-history-entry">
        <summary>
          <span><b>v{item.snapshot_version}</b><small>{formatDate(item.as_of)}</small></span>
          <span><CellChip tone={capitalReadinessBandTone(item.band)}>{capitalReadinessBandLabel(item.band, locale)}</CellChip><b>{item.score == null ? "—" : Math.round(item.score)}</b></span>
          <CellChip tone={change?.is_material ? "warn" : "mut"}>{change?.is_material ? c.materialChange : c.noMaterialChange}</CellChip>
        </summary>
        {change ? <div className="capital-readiness-history-comparison">
          <span><small>{c.priorVersion}</small><b>v{change.previous_snapshot_version}</b></span>
          <span><small>{c.scoreChange}</small><b>{formatDelta(change.score_delta)}</b></span>
          <span><small>{c.coverageChange}</small><b>{formatDelta(change.evidence_coverage_delta, " pp")}</b></span>
          <span><small>{c.changedMetrics}</small><b>{change.changed_metrics.length}</b></span>
          {change.changed_metrics.length ? <p>{change.changed_metrics.map((metric) => metric.key.replaceAll("_", " ")).join(" · ")}</p> : null}
        </div> : <p className="sub">{c.noPriorSnapshot}</p>}
      </details>;
    })}
    {!snapshots.length ? <Empty text={c.noPriorSnapshot} /> : null}
  </div>;
}

const FINANCIAL_VALUE_FIELDS = [
  "revenue",
  "cogs",
  "gross_profit",
  "operating_expenses",
  "operating_income",
  "net_income",
  "ebitda",
  "adjusted_ebitda",
  "confidence",
] as const;
type FinancialValueField = typeof FINANCIAL_VALUE_FIELDS[number];
type PeriodCorrectionDraft = { period: CapitalReadinessFinancialPeriod; values: Record<FinancialValueField, string>; idempotencyKey: string };

function FinancialPeriodsDisclosure({ profileId, locale, onRecalculate }: { profileId: string; locale: Locale; onRecalculate: () => Promise<void> }) {
  const api = useAuthedApi();
  const c = COPY[locale];
  const [open, setOpen] = useState(false);
  const [periods, setPeriods] = useState<CapitalReadinessFinancialPeriod[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [correction, setCorrection] = useState<PeriodCorrectionDraft | null>(null);

  const loadPeriods = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPeriods(await api<CapitalReadinessFinancialPeriod[]>(`/application-profiles/${profileId}/financial-periods`));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : c.periodsUnavailable);
    } finally {
      setLoading(false);
    }
  }, [api, c.periodsUnavailable, profileId]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && periods === null) await loadPeriods();
  }

  async function reviewPeriod(period: CapitalReadinessFinancialPeriod, status: "confirmed" | "rejected") {
    setBusy(`${status}:${period.id}`);
    setError(null);
    try {
      await api(`/application-profiles/${profileId}/financial-periods/${period.id}/review`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await loadPeriods();
      await onRecalculate();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : c.periodsUnavailable);
    } finally {
      setBusy(null);
    }
  }

  function editPeriod(period: CapitalReadinessFinancialPeriod) {
    setCorrection({
      period,
      values: Object.fromEntries(FINANCIAL_VALUE_FIELDS.map((field) => [field, period[field] == null ? "" : String(period[field])])) as Record<FinancialValueField, string>,
      idempotencyKey: globalThis.crypto?.randomUUID?.() ?? `financial-period-${Date.now()}`,
    });
  }

  async function saveCorrection() {
    if (!correction) return;
    const original = correction.period;
    setBusy(`correct:${original.id}`);
    setError(null);
    try {
      const values = Object.fromEntries(FINANCIAL_VALUE_FIELDS.map((field) => [field, optionalNumber(correction.values[field])])) as Record<FinancialValueField, number | null>;
      const replacement = await api<CapitalReadinessFinancialPeriod>(`/application-profiles/${profileId}/financial-periods`, {
        method: "POST",
        body: JSON.stringify({
          entity_name: original.entity_name,
          accounting_basis: original.accounting_basis,
          currency: original.currency,
          period_start: original.period_start,
          period_end: original.period_end,
          months_covered: original.months_covered,
          source_kind: original.source_kind,
          cogs_applicability: original.cogs_applicability,
          ...values,
          source_file_id: original.source_file_id,
          source_analysis_id: original.source_analysis_id,
          extractor_version: original.extractor_version,
          content_hash: original.content_hash,
          idempotency_key: correction.idempotencyKey,
        }),
      });
      await api(`/application-profiles/${profileId}/financial-periods/${replacement.id}/review`, {
        method: "PATCH",
        body: JSON.stringify({ status: "confirmed", note: `Immutable correction of period ${original.id}.` }),
      });
      await api(`/application-profiles/${profileId}/financial-periods/${original.id}/review`, {
        method: "PATCH",
        body: JSON.stringify({ status: "superseded", note: `Superseded by corrected period ${replacement.id}.` }),
      });
      setCorrection(null);
      await loadPeriods();
      await onRecalculate();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : c.periodsUnavailable);
    } finally {
      setBusy(null);
    }
  }

  return <section className="capital-readiness-source-periods">
    <Btn size="sm" onClick={() => void toggle()} aria-expanded={open}>{open ? c.hideSourcePeriods : c.sourcePeriods}</Btn>
    {open ? <div className="capital-readiness-source-period-list">
      {loading ? <Empty text={c.loadingPeriods} /> : null}
      {error ? <div className="capital-readiness-inline-error">{error}</div> : null}
      {!loading && periods?.map((period) => <article key={period.id} className="capital-readiness-source-period">
        <div className="capital-readiness-source-period-head">
          <span><b>{period.entity_name}</b><small>{formatDate(period.period_start)} – {formatDate(period.period_end)} · {period.accounting_basis}</small></span>
          <CellChip tone={period.review_status === "confirmed" ? "ok" : period.review_status === "rejected" || period.review_status === "superseded" ? "mut" : "warn"}>{financialPeriodStatusLabel(period.review_status, locale)}</CellChip>
        </div>
        <div className="capital-readiness-source-period-values">
          <span><small>{locale === "es" ? "Ingresos" : "Revenue"}</small><b>{formatFinancialValue(period.revenue, period.currency)}</b></span>
          <span><small>{locale === "es" ? "Ganancia bruta" : "Gross profit"}</small><b>{formatFinancialValue(period.gross_profit ?? period.derived_gross_profit, period.currency)}</b></span>
          <span><small>{locale === "es" ? "Ingreso neto" : "Net income"}</small><b>{formatFinancialValue(period.net_income, period.currency)}</b></span>
          <span><small>EBITDA</small><b>{formatFinancialValue(period.adjusted_ebitda ?? period.ebitda, period.currency)}</b></span>
        </div>
        {period.reconciliation_warnings.length ? <p className="capital-readiness-inline-error">{period.reconciliation_warnings.join(" · ")}</p> : null}
        <div className="row" style={{ gap: 7 }}>
          {period.review_status !== "confirmed" && period.review_status !== "superseded" ? <Btn size="sm" onClick={() => void reviewPeriod(period, "confirmed")} disabled={Boolean(busy)}>{c.confirmPeriod}</Btn> : null}
          {period.review_status !== "rejected" && period.review_status !== "superseded" ? <Btn size="sm" onClick={() => void reviewPeriod(period, "rejected")} disabled={Boolean(busy)}>{c.rejectPeriod}</Btn> : null}
          {period.review_status !== "superseded" ? <Btn size="sm" onClick={() => editPeriod(period)} disabled={Boolean(busy)}>{c.correctPeriod}</Btn> : null}
        </div>
        {correction?.period.id === period.id ? <div className="capital-readiness-period-correction">
          <Callout tone="warn">{c.correctionNotice}</Callout>
          <div className="capital-readiness-period-correction-grid">
            {FINANCIAL_VALUE_FIELDS.map((field) => <Field key={field} label={financialFieldLabel(field, locale)}><Input type="number" step="0.01" min={field === "confidence" ? "0" : undefined} max={field === "confidence" ? "1" : undefined} value={correction.values[field]} onChange={(event) => setCorrection({ ...correction, values: { ...correction.values, [field]: event.target.value } })} /></Field>)}
          </div>
          <div className="row" style={{ gap: 7 }}><Btn size="sm" variant="pri" onClick={() => void saveCorrection()} disabled={Boolean(busy)}>{c.saveCorrection}</Btn><Btn size="sm" onClick={() => setCorrection(null)} disabled={Boolean(busy)}>{c.cancel}</Btn></div>
        </div> : null}
      </article>)}
      {!loading && periods && !periods.length ? <Empty text={c.empty} /> : null}
    </div> : null}
  </section>;
}

function ReadinessGauge({ label, value }: { label: string; value: number }) {
  return <div className="capital-readiness-gauge"><span className="lbl">{label}</span><b>{Math.round(value)}%</b><span className="capital-readiness-track"><span style={{ width: `${clamp(value)}%` }} /></span></div>;
}

function ProgramOpportunityCard({ program, locale, needsReview }: { program: ApplicationCapitalReadinessSnapshot["program_opportunities"][number]; locale: Locale; needsReview: string }) {
  return <div>
    <b>{program.program_name || program.title || program.label || program.program_key || "Program"}</b>
    <CellChip tone={program.status === "ready" || program.status === "eligible" ? "ok" : "warn"}>{program.status ? programStatusLabel(program.status, locale) : needsReview}</CellChip>
    {program.detail || program.note ? <p>{program.detail || program.note}</p> : null}
    {program.gaps?.length ? <small>{program.gaps.join(" · ")}</small> : null}
  </div>;
}

function ReadinessSection({ title, className, children }: { title: string; className: string; children: React.ReactNode }) {
  return <section className={`capital-readiness-section ${className}`}><h4>{title}</h4><div>{children}</div></section>;
}

function MetricCard({ metric, locale, sourcePeriodLabel }: { metric: CapitalReadinessMetric; locale: Locale; sourcePeriodLabel: string }) {
  const c = COPY[locale];
  const label = localizedKnownLabel(metric.key, locale, METRIC_LABELS_EN, METRIC_LABELS_ES, metric.label);
  return (
    <article className={`capital-readiness-metric metric-${metric.status}`}>
      <div><span>{label}</span><CellChip tone={capitalReadinessMetricTone(metric.status)}>{locale === "es" ? METRIC_STATUS_ES[metric.status] : capitalReadinessMetricLabel(metric.status)}</CellChip></div>
      <strong>{formatReadinessMetric(metric)}</strong>
      {metric.numerator != null && metric.denominator != null ? <p>{formatPart(metric.numerator, metric.source?.currency)} ÷ {formatPart(metric.denominator, metric.source?.currency)}</p> : null}
      {metric.source?.trend_percentage_points != null ? <small>{metric.source.trend_percentage_points > 0 ? "+" : ""}{metric.source.trend_percentage_points.toFixed(1)} pp {c.trend}</small> : null}
      {metric.source_period_id ? <small>{sourcePeriodLabel}: {metricSourceLabel(metric)}</small> : null}
      {metric.confidence_pct != null ? <small>{Math.round(metric.confidence_pct)}% {c.confidenceLower}</small> : null}
    </article>
  );
}

function NarrativeRow({ item, index, locale, preferStable, kind }: { item: Parameters<typeof capitalReadinessItemTitle>[0]; index?: number; locale: Locale; preferStable: boolean; kind: "blocker" | "strength" }) {
  const generated = preferStable ? generatedNarrative(item, locale, kind) : null;
  const title = generated?.title || capitalReadinessItemTitle(item);
  const detail = generated ? generated.detail : capitalReadinessItemDetail(item);
  return <div className="capital-readiness-list-row">{index ? <span>{index}</span> : <span aria-hidden="true">✓</span>}<div><b>{title}</b>{detail ? <p>{detail}</p> : null}</div></div>;
}

function PhaseActionRow({ item, locale = "en", busy = false, onStatus }: { item: CapitalReadinessAction; locale?: Locale; busy?: boolean; onStatus?: (action: CapitalReadinessAction, status: string) => void }) {
  const c = COPY[locale];
  const status = item.status || "not_started";
  const next = status === "completed" ? "in_progress" : status === "in_progress" ? "completed" : "in_progress";
  const nextLabel = status === "completed" ? c.reopenAction : status === "in_progress" ? c.completeAction : c.startAction;
  const plan = actionPlanSummary(item, locale);
  return <div className="capital-readiness-roadmap-row"><span className={`roadmap-status status-${status}`} /> <div><b>{item.title || item.label || item.action_key?.replaceAll("_", " ") || item.key?.replaceAll("_", " ") || (locale === "es" ? "Hito de preparación" : "Readiness milestone")}</b>{item.detail ? <p>{item.detail}</p> : null}<small>{[item.owner_user_id ? (locale === "es" ? "Responsable asignado" : "Owner assigned") : null, item.due_date ? `${c.due} ${formatDate(item.due_date)}` : null, item.expected_impact != null ? `${c.expectedImpact}: ${item.expected_impact}` : null].filter(Boolean).join(" · ")}</small>{plan ? <small>{plan}</small> : null}{onStatus && (item.action_key || item.key) && item.version != null ? <Btn size="sm" onClick={() => onStatus(item, next)} disabled={busy}>{busy ? c.calculating : nextLabel}</Btn> : null}</div></div>;
}

function actionPlanSummary(item: CapitalReadinessAction, locale: Locale): string {
  const baselineMetric = typeof item.baseline?.metric_key === "string" ? item.baseline.metric_key : null;
  const targetMetric = typeof item.target?.metric_key === "string" ? item.target.metric_key : baselineMetric;
  const metricKey = targetMetric || baselineMetric;
  const metric = metricKey ? localizedKnownLabel(metricKey, locale, METRIC_LABELS_EN, METRIC_LABELS_ES, metricKey.replaceAll("_", " ")) : null;
  const baseline = typeof item.baseline?.value === "number" ? item.baseline.value : null;
  const target = typeof item.target?.value === "number" ? item.target.value : null;
  const parts = [
    metric && (baseline != null || target != null) ? `${metric}: ${baseline ?? "—"} → ${target ?? "—"}` : null,
    item.required_evidence?.length ? `${locale === "es" ? "Evidencia" : "Evidence"}: ${item.required_evidence.join(", ")}` : null,
    item.dependencies?.length ? `${item.dependencies.length} ${locale === "es" ? (item.dependencies.length === 1 ? "dependencia" : "dependencias") : (item.dependencies.length === 1 ? "dependency" : "dependencies")}` : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

function Empty({ text }: { text: string }) {
  return <p className="capital-readiness-section-empty">{text}</p>;
}

function formatPart(value: number, currency: unknown): string {
  return value.toLocaleString("en-US", { style: "currency", currency: validCurrency(currency), maximumFractionDigits: 0 });
}

function metricSourceLabel(metric: CapitalReadinessMetric): string {
  const source = metric.source;
  if (!source) return metric.source_period_id || "—";
  const period = source.period_start && source.period_end ? `${formatDate(source.period_start)} – ${formatDate(source.period_end)}` : null;
  return [source.entity_name, source.accounting_basis, period].filter(Boolean).join(" · ") || metric.source_period_id || "—";
}

function validCurrency(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value)) return "USD";
  try {
    new Intl.NumberFormat("en-US", { style: "currency", currency: value }).format(0);
    return value;
  } catch {
    return "USD";
  }
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatDelta(value: number | null, suffix = ""): string {
  if (value == null) return "—";
  return `${value > 0 ? "+" : ""}${Math.round(value * 10) / 10}${suffix}`;
}

function optionalNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error("Corrected financial values must be valid numbers.");
  return parsed;
}

function optionalFiniteNumberValid(value: string): boolean {
  return value.trim() === "" || Number.isFinite(Number(value));
}

function toggleValue(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function formatFinancialValue(value: number | null, currency: unknown): string {
  return value == null ? "—" : value.toLocaleString("en-US", { style: "currency", currency: validCurrency(currency), maximumFractionDigits: 0 });
}

function financialPeriodStatusLabel(status: string, locale: Locale): string {
  if (locale === "en") return status.replaceAll("_", " ");
  return ({ pending: "pendiente", awaiting_review: "pendiente de revisión", confirmed: "confirmado", rejected: "rechazado", superseded: "reemplazado" } as Record<string, string>)[status] || status.replaceAll("_", " ");
}

function financialFieldLabel(field: FinancialValueField, locale: Locale): string {
  const labels: Record<FinancialValueField, [string, string]> = {
    revenue: ["Revenue", "Ingresos"],
    cogs: ["Cost of goods sold", "Costo de ventas"],
    gross_profit: ["Gross profit", "Ganancia bruta"],
    operating_expenses: ["Operating expenses", "Gastos operativos"],
    operating_income: ["Operating income", "Ingreso operativo"],
    net_income: ["Net income", "Ingreso neto"],
    ebitda: ["EBITDA", "EBITDA"],
    adjusted_ebitda: ["Adjusted EBITDA", "EBITDA ajustado"],
    confidence: ["Confidence (0–1)", "Confianza (0–1)"],
  };
  return labels[field][locale === "es" ? 1 : 0];
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function programStatusLabel(status: string, locale: Locale): string {
  if (locale === "en") return status.replaceAll("_", " ");
  const labels: Record<string, string> = { ready: "Listo", eligible: "Elegible", needs_information: "Falta información", not_eligible: "No elegible", criteria_unavailable: "Criterios no disponibles" };
  return labels[status] || status.replaceAll("_", " ");
}

function localizedKnownLabel(key: string, locale: Locale, english: Record<string, string>, spanish: Record<string, string>, fallback: string): string {
  return (locale === "es" ? spanish : english)[key] || fallback;
}

function generatedNarrative(item: Parameters<typeof capitalReadinessItemTitle>[0], locale: Locale, kind: "blocker" | "strength"): { title: string; detail: null } | null {
  if (typeof item === "string") return null;
  const metricKey = item.metric_key;
  const stableKey = metricKey || item.key;
  if (!stableKey) return null;
  const metric = localizedKnownLabel(stableKey, locale, METRIC_LABELS_EN, METRIC_LABELS_ES, stableKey.replaceAll("_", " "));
  const impact = typeof item.impact === "string" ? localizedImpact(item.impact, locale) : null;
  if (kind === "strength") return { title: locale === "es" ? `${metric} · fortaleza verificada` : `${metric} · verified strength`, detail: null };
  return {
    title: locale === "es"
      ? `${metric}${impact ? ` · impacto ${impact}` : " · requiere atención"}`
      : `${metric}${impact ? ` · ${impact} impact` : " · needs attention"}`,
    detail: null,
  };
}

function localizedImpact(impact: string, locale: Locale): string {
  if (locale === "en") return impact.replaceAll("_", " ");
  return ({ low: "bajo", medium: "medio", high: "alto", critical: "crítico" } as Record<string, string>)[impact] || impact.replaceAll("_", " ");
}
