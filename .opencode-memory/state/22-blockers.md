# Blockers

> Append-only. Worker добавляет блокеры когда застрял на 2 попытках fix.
> Orchestrator читает и разблокирует.

---

## [2026-06-25T22:00:00Z] BLOCKER: SSH Connection Unavailable

**Task:** Bootstrap — initial memory upload to server
**Step:** bifrost_connect / bifrost_upload
**Error:** SSH connect timed out after 15000ms
**Tried:**
1. Waited and retried bifrost_connect with 60s timeout
2. Checked bifrost_status — showed disconnected

**Why blocked:** Server SSH port (49222) not responding from ~21:00 UTC. Likely network/firewall issue on Hetzner side or server reboot.

**Need from Orchestrator:** None — this is infrastructure. Worker will retry periodically. When SSH restores, run `/bootstrap` to complete upload.

**Status:** RESOLVED (2026-06-25T22:40:00Z) — SSH restored, bootstrap completed.

---

*No active blockers currently.*