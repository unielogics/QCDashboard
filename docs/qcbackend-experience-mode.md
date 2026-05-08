# Backend handoff: Client experience mode

**Status:** Front-ends (QCDashboard, QCMobile) are already shipping with these
fields treated as optional. They tolerate the columns being absent and fall
back to deriving the mode from `client.broker_id`. This doc is the contract
qcbackend should land to make the field authoritative.

## Schema

Add three nullable columns to the `clients` table.

```
clients.client_experience_mode             TEXT NULL
  -- enum: 'guided' | 'self_directed' | 'hybrid'
  -- 'hybrid' is reserved for future use; UIs treat it as a fallback to derivation.

clients.client_experience_mode_reason      TEXT NULL
  -- enum: 'agent_referred' | 'self_signup' | 'funding_team_required'
  --     | 'underwriting_conditions' | 'user_preference' | 'super_admin_override'

clients.client_experience_mode_locked_by   TEXT NULL
  -- enum: 'system' | 'agent' | 'funding_team' | 'super_admin'
  -- NULL means no lock.
```

All three are NULL on existing rows. The front-end derivation handles NULL
(see `src/lib/experienceMode.ts` in both repos).

## Defaults at client creation

```
broker_id IS NOT NULL → mode='guided',         reason='agent_referred',  locked_by=NULL
broker_id IS NULL     → mode='self_directed',  reason='self_signup',     locked_by=NULL
```

## Endpoints

### Read — already exist, just include the new fields

```
GET /clients/me        → include the 3 new fields in the Client payload
GET /clients/{id}      → include the 3 new fields in the Client payload
```

### Write — new endpoint

```
PATCH /clients/{id}/experience-mode

body: {
  mode:       'guided' | 'self_directed',
  reason:     <one of the reason enum values>,
  locked_by?: 'system' | 'agent' | 'funding_team' | 'super_admin' | null
}

response: 200 with the updated Client object.
```

#### Authorization

The dashboard already gates the toggle UX (see
`src/lib/experienceModePermissions.ts`), but the server MUST enforce — UX
gates are bypassable via DevTools.

| Caller role  | Allowed when                                                                                                  |
|--------------|----------------------------------------------------------------------------------------------------------------|
| super_admin  | always; may set/clear any `locked_by`                                                                          |
| loan_exec    | always (Funding Team); may set `locked_by='funding_team'` or NULL                                              |
| broker       | `client.broker_id = <caller's user id>` AND existing `locked_by IN (NULL, 'system', 'agent')`. May not lock.    |
| client       | denied                                                                                                         |

A broker attempting to override a `funding_team` or `super_admin` lock should
get a 403.

## Interim shim (until the endpoint lands)

The dashboard currently writes via `PATCH /clients/{id}` (the existing
`useUpdateClient` pattern), passing the three fields as a partial update. When
`/clients/{id}/experience-mode` ships, swap the dashboard call to the new hook
and the backend can stop accepting these fields on the generic PATCH route.

## Verification checklist for qcbackend

- [ ] Migration adds the three nullable columns.
- [ ] `GET /clients/me` and `GET /clients/{id}` include the fields (NULL for backfill).
- [ ] `POST /clients` (and any internal client-create code path) sets defaults from `broker_id`.
- [ ] `PATCH /clients/{id}/experience-mode` exists and enforces the auth matrix above.
- [ ] Broker writing on a `funding_team`-locked client returns 403.
- [ ] Field changes appear in the engagement / audit log (alongside stage changes).
