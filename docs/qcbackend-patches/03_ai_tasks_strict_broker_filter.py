#!/usr/bin/env python3
"""
03_ai_tasks_strict_broker_filter.py

Idempotent patch: tightens the broker AI Inbox filter in
qcbackend/app/routers/ai_tasks.py — broker now sees ONLY tasks tied to
loans in their book. Removes the prior `loan_id IS NULL` widening that
leaked firm-wide pipeline alerts into broker inboxes.

Run from qcbackend source root:

    python3 docs/qcbackend-patches/03_ai_tasks_strict_broker_filter.py app/routers/ai_tasks.py
"""

from __future__ import annotations
import sys
from pathlib import Path

DEFAULT = Path("app/routers/ai_tasks.py")

OLD = """    if user.role == Role.BROKER and user.broker is not None:
        # Brokers see tasks tied to their own loans + firm-wide
        # null-loan tasks. The `loan_id IS NULL` widening is
        # intentional — today's null-loan AITasks are firm-wide
        # alerts (credit-pull expiry, prequal review queues) that
        # ALL operators including brokers should see. If we ever
        # introduce broker-confidential null-loan tasks, add a
        # `visible_to_role` field on AITask rather than tightening
        # this filter; otherwise we'd hide legitimate work the
        # broker needs.
        stmt = stmt.where(
            or_(
                AITask.loan_id.is_(None),
                AITask.loan_id.in_(
                    select(Loan.id).where(Loan.broker_id == user.broker.id)
                ),
            )
        )"""

NEW = """    if user.role == Role.BROKER and user.broker is not None:
        # Strict isolation (product decision 2026-05-14): broker sees
        # ONLY tasks tied to loans in their book. Firm-wide null-loan
        # alerts belong to super_admin / loan_exec. Add a
        # `visible_to_role` field on AITask if a specific firm-wide
        # alert needs broker visibility in the future.
        stmt = stmt.where(
            AITask.loan_id.in_(
                select(Loan.id).where(Loan.broker_id == user.broker.id)
            )
        )"""


def patch(p: Path) -> str:
    src = p.read_text()
    if "Strict isolation" in src:
        return "already patched"
    if OLD not in src:
        return "original block not found — manual review needed"
    p.write_text(src.replace(OLD, NEW))
    return "patched"


def main() -> int:
    p = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT
    if not p.exists():
        print(f"error: {p} not found", file=sys.stderr)
        return 2
    print(patch(p))
    return 0


if __name__ == "__main__":
    sys.exit(main())
