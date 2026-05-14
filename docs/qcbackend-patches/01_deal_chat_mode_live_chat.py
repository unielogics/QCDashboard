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


def _slice_class_body(src: str, class_name: str) -> tuple[int, int]:
    """Return (start, end) char offsets of the body of `class <class_name>`.
    End = the index of the next top-level `class ` declaration (or EOF).
    Used to scope idempotency checks so 'BROKER = "broker"' on the Role
    enum doesn't cause us to skip patching DealChatRole."""
    marker = f"class {class_name}("
    start = src.find(marker)
    if start == -1:
        raise AssertionError(f"class {class_name} not found")
    nxt = src.find("\nclass ", start + 1)
    return start, nxt if nxt != -1 else len(src)


def patch(p: Path) -> str:
    src = p.read_text()
    changed = False

    # 1) DealChatMode += LIVE_CHAT — check inside the DealChatMode body
    mode_start, mode_end = _slice_class_body(src, "DealChatMode")
    if 'LIVE_CHAT = "live_chat"' in src[mode_start:mode_end]:
        result = "DealChatMode.LIVE_CHAT: already present"
    else:
        marker = '    BROKER_SUGGESTION = "broker_suggestion"'
        assert marker in src[mode_start:mode_end], "BROKER_SUGGESTION line not found in DealChatMode"
        # Replace only inside the class body so we don't bleed.
        new_body = src[mode_start:mode_end].replace(
            marker,
            marker + '\n    LIVE_CHAT = "live_chat"',
            1,
        )
        src = src[:mode_start] + new_body + src[mode_end:]
        changed = True
        result = "DealChatMode.LIVE_CHAT: added"

    # 2) DealChatRole += BROKER — check inside the DealChatRole body
    role_start, role_end = _slice_class_body(src, "DealChatRole")
    if 'BROKER = "broker"' in src[role_start:role_end]:
        result += " | DealChatRole.BROKER: already present"
    else:
        marker = '    BROKER_INTERNAL = "broker_internal"'
        assert marker in src[role_start:role_end], "BROKER_INTERNAL line not found in DealChatRole"
        new_body = src[role_start:role_end].replace(
            marker,
            marker + '\n    BROKER = "broker"',
            1,
        )
        src = src[:role_start] + new_body + src[role_end:]
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
