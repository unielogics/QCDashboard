#!/usr/bin/env python3
"""
02_loan_workspace_human_takeover.py

Idempotent patch: makes the workspace chat handler treat LIVE_CHAT (sent
by a broker) the same way it treats CHAT (sent by super_admin/loan_exec)
— persist message client-visible, pause AI for 1h, set from_role=BROKER.

Also widens _MODE_ALLOWED_ROLES so LIVE_CHAT is reachable for brokers.

Run from qcbackend source root:

    python3 docs/qcbackend-patches/02_loan_workspace_human_takeover.py app/routers/loan_workspace.py
"""

from __future__ import annotations
import sys
from pathlib import Path

DEFAULT = Path("app/routers/loan_workspace.py")

HELPER = (
    "def _is_human_takeover(mode: DealChatMode, role: Role) -> bool:\n"
    "    '''CHAT (super_admin/loan_exec) or LIVE_CHAT (broker/super_admin/loan_exec).\n"
    "    Both branches persist the message client-visible and pause the AI.'''\n"
    "    if mode == DealChatMode.CHAT and role in (Role.SUPER_ADMIN, Role.LOAN_EXEC):\n"
    "        return True\n"
    "    if mode == DealChatMode.LIVE_CHAT and role in (Role.BROKER, Role.SUPER_ADMIN, Role.LOAN_EXEC):\n"
    "        return True\n"
    "    return False\n\n\n"
)


def patch(p: Path) -> list[str]:
    src = p.read_text()
    notes: list[str] = []

    # 1) Inject _is_human_takeover helper
    if "_is_human_takeover" in src:
        notes.append("helper: already present")
    else:
        marker = "_MODE_ALLOWED_ROLES: dict[DealChatMode, set[Role]] = {"
        assert marker in src, "_MODE_ALLOWED_ROLES anchor not found"
        src = src.replace(marker, HELPER + marker)
        notes.append("helper: inserted")

    # 2) Add LIVE_CHAT to _MODE_ALLOWED_ROLES
    if "DealChatMode.LIVE_CHAT:" in src:
        notes.append("LIVE_CHAT allowed-roles: already present")
    else:
        anchor = "    DealChatMode.BROKER_SUGGESTION: {Role.BROKER},"
        assert anchor in src
        src = src.replace(
            anchor,
            anchor + "\n    DealChatMode.LIVE_CHAT: {Role.BROKER, Role.SUPER_ADMIN, Role.LOAN_EXEC},",
        )
        notes.append("LIVE_CHAT allowed-roles: added")

    # 3) Rewrite the takeover branch
    old_branch = "    if payload.mode == DealChatMode.CHAT and user.role == Role.SUPER_ADMIN:"
    new_branch = "    if _is_human_takeover(payload.mode, Role(user.role)):"
    if new_branch in src:
        notes.append("takeover branch: already rewritten")
    elif old_branch in src:
        src = src.replace(old_branch, new_branch)
        notes.append("takeover branch: rewritten")
    else:
        notes.append("takeover branch: skipped (anchor not found; manual review)")

    # 4) from_role assignment — pick BROKER vs SUPER_ADMIN by actor role
    old_role = "            from_role=DealChatRole.SUPER_ADMIN,"
    new_role = "            from_role=(DealChatRole.BROKER if Role(user.role) == Role.BROKER else DealChatRole.SUPER_ADMIN),"
    if new_role in src:
        notes.append("from_role assignment: already updated")
    elif old_role in src:
        src = src.replace(old_role, new_role)
        notes.append("from_role assignment: updated")
    else:
        notes.append("from_role assignment: skipped (anchor not found)")

    # 5) Activity.kind — pick by actor role
    old_kind = '                kind="ai.paused_by_super_admin",'
    new_kind = '                kind=("ai.paused_by_broker" if Role(user.role) == Role.BROKER else "ai.paused_by_super_admin"),'
    if new_kind in src:
        notes.append("activity kind: already updated")
    elif old_kind in src:
        src = src.replace(old_kind, new_kind)
        notes.append("activity kind: updated")
    else:
        notes.append("activity kind: skipped (anchor not found)")

    # 6) Activity.summary — include actor email + role
    old_sum = '                summary=f"Super-admin sent manual reply; AI paused until {paused_until.isoformat()}",'
    new_sum = '                summary=f"{user.email} ({user.role}) took over the chat; AI paused until {paused_until.isoformat()}",'
    if new_sum in src:
        notes.append("activity summary: already updated")
    elif old_sum in src:
        src = src.replace(old_sum, new_sum)
        notes.append("activity summary: updated")
    else:
        notes.append("activity summary: skipped (anchor not found)")

    p.write_text(src)
    return notes


def main() -> int:
    p = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT
    if not p.exists():
        print(f"error: {p} not found", file=sys.stderr)
        return 2
    for note in patch(p):
        print(note)
    return 0


if __name__ == "__main__":
    sys.exit(main())
