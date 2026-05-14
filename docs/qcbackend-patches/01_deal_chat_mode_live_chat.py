#!/usr/bin/env python3
"""
01_deal_chat_mode_live_chat.py

Idempotent patch: adds DealChatMode.LIVE_CHAT and DealChatRole.BROKER
to qcbackend/app/enums.py.

Run from the qcbackend source repo root:

    python3 docs/qcbackend-patches/01_deal_chat_mode_live_chat.py app/enums.py

(adjust the path arg if your tree layout differs).
"""

from __future__ import annotations
import sys
from pathlib import Path

DEFAULT = Path("app/enums.py")


def patch(p: Path) -> str:
    src = p.read_text()
    changed = False

    # 1) DealChatMode += LIVE_CHAT
    if 'LIVE_CHAT = "live_chat"' in src:
        result = "DealChatMode.LIVE_CHAT: already present"
    else:
        marker = '    BROKER_SUGGESTION = "broker_suggestion"'
        assert marker in src, "DealChatMode.BROKER_SUGGESTION line not found"
        src = src.replace(
            marker,
            marker + '\n    LIVE_CHAT = "live_chat"',
        )
        changed = True
        result = "DealChatMode.LIVE_CHAT: added"

    # 2) DealChatRole += BROKER
    if 'BROKER = "broker"' in src:
        result += " | DealChatRole.BROKER: already present"
    else:
        marker = '    BROKER_INTERNAL = "broker_internal"'
        assert marker in src, "DealChatRole.BROKER_INTERNAL line not found"
        src = src.replace(
            marker,
            marker + '\n    BROKER = "broker"',
        )
        changed = True
        result += " | DealChatRole.BROKER: added"

    if changed:
        p.write_text(src)
    return result


def main() -> int:
    p = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT
    if not p.exists():
        print(f"error: {p} not found", file=sys.stderr)
        return 2
    print(patch(p))
    return 0


if __name__ == "__main__":
    sys.exit(main())
