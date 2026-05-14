# qcbackend patches that must land in the source repo

The patches in this directory are the backend changes the front-end work
on QCDashboard + QCMobile relies on. They have been applied to the
running `qcbackend` container on this EC2, but because that container is
rebuilt from the image on every deploy, **they revert every time the
image gets rebuilt**. We've already lost them once (2026-05-15 — caused
a 422 Unprocessable Entity on broker Live Chat sends that surfaced to
the user as "402 on send").

**Action required:** apply each patch in this directory to the qcbackend
source repo and ship a new image. Until that happens, every deploy will
silently break broker Live Chat + the AI Inbox isolation again.

## Patches

Each patch is an **idempotent Python script** rather than a unified diff,
since I don't have the qcbackend source on this EC2 to produce a real
diff. Each script can be run multiple times safely — it self-checks and
no-ops if the change is already in place.

### `01_deal_chat_mode_live_chat.py`
Adds `DealChatMode.LIVE_CHAT` and `DealChatRole.BROKER` enum values to
`app/enums.py`. Required by:
- `QCDashboard/src/lib/enums.generated.ts` (LIVE_CHAT used in DealChatInput)
- `QCMobile/src/lib/enums.generated.ts` (same)
- Broker Live Chat flow on both surfaces

### `02_loan_workspace_human_takeover.py`
Extends `_MODE_ALLOWED_ROLES` and the `send_chat` handler in
`app/routers/loan_workspace.py` so brokers can trigger the
operator-takeover branch via `LIVE_CHAT` (same semantics super_admin
gets via `CHAT`). Adds `_is_human_takeover()` helper.
- Persists message with `from_role=DealChatRole.BROKER` (vs SUPER_ADMIN)
  when the actor is a broker
- Emits Activity kind `ai.paused_by_broker`
- AI pause for 1h (unchanged from super_admin path)

### `03_ai_tasks_strict_broker_filter.py`
Tightens the broker AI Inbox filter in `app/routers/ai_tasks.py` to
**only** show tasks tied to loans where the broker is assigned. Removes
the prior `loan_id IS NULL` widening that leaked firm-wide pipeline
alerts into broker inboxes (40 leaked rows in prod as of 2026-05-14).

## How to apply (qcbackend repo side)

```bash
cd /path/to/qcbackend
python3 /path/to/QCDashboard/docs/qcbackend-patches/01_deal_chat_mode_live_chat.py
python3 /path/to/QCDashboard/docs/qcbackend-patches/02_loan_workspace_human_takeover.py
python3 /path/to/QCDashboard/docs/qcbackend-patches/03_ai_tasks_strict_broker_filter.py

# Re-gen TS enums so QCDashboard + QCMobile pick up DealChatMode.LIVE_CHAT
# and DealChatRole.BROKER from the source-of-truth enums.py. Skip this
# step if your front-end enums.generated.ts already has both members
# (verifiable with: grep -E "LIVE_CHAT|^.*BROKER:.*broker" enums.generated.ts).
python scripts/gen_ts_enums.py

# Commit
git add app/enums.py app/routers/loan_workspace.py app/routers/ai_tasks.py
git commit -m "feat(chat): live_chat broker takeover + strict ai-inbox isolation"

# Rebuild + restart. NOTE the deploy on this EC2 is systemd, NOT
# docker-compose — the compose file in qcbackend only defines postgres.
# qcbackend itself is launched by /etc/systemd/system/qcbackend.service,
# which `docker run`s the `qcbackend:current` image.
docker build -t qcbackend:current .
sudo systemctl restart qcbackend

# Verify
sudo docker exec qcbackend python3 -c "from app.enums import DealChatMode, DealChatRole; \
  assert 'live_chat' in [m.value for m in DealChatMode]; \
  assert 'broker'    in [r.value for r in DealChatRole]; \
  print('OK')"
```

## How to verify after deploy

```bash
docker exec qcbackend python3 -c "from app.enums import DealChatMode, DealChatRole; \
  assert 'live_chat' in [m.value for m in DealChatMode], 'LIVE_CHAT missing'; \
  assert 'broker'    in [r.value for r in DealChatRole], 'BROKER missing'; \
  print('OK')"
```

If that prints `OK`, the chat path is functional. If it raises
`AssertionError`, the patches were lost again — re-apply.
