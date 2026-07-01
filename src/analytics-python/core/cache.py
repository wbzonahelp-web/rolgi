"""
Двухуровневый кэш для Python-анализаторов.

L1: PostgreSQL.analytics_python_cache — переживает рестарты, доступен в SQL.
L2: Redis — быстрый горячий доступ, TTL=ttl_seconds от L1.

Принципы:
    - Чтение: L2 → L1 → MISS.
    - При hit L1 + miss L2: pre-warm L2 для следующего раза.
    - Запись: одновременно в L1 (UPSERT) и L2 (SETEX).
    - Expired в L1 (computed_at + ttl < now): игнорируются на чтении.
    - Если Redis недоступен — graceful degradation: только L1 работает,
      пишем warn в лог, не падаем.
    - Все ошибки чтения кэша считаются MISS, не пробрасываются вызывающему.

Ключ формируется как: f"{analyzer}:{team_id}:{n_window}:{league_filter}:{venue}:{params_hash}"
"""
from __future__ import annotations

import os
import json
import hashlib
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

import redis.asyncio as aioredis

from .db import get_pool

logger = logging.getLogger(__name__)

_redis_client: Optional[aioredis.Redis] = None
_redis_disabled = False  # становится True если Redis невозможно достучаться


async def _get_redis() -> Optional[aioredis.Redis]:
    """Lazy-инициализация Redis-клиента; None если Redis отключён или недоступен."""
    global _redis_client, _redis_disabled
    if _redis_disabled:
        return None
    if _redis_client is not None:
        return _redis_client
    try:
        host = os.getenv("REDIS_HOST", "redis")
        port = int(os.getenv("REDIS_PORT", "6379"))
        client = aioredis.Redis(
            host=host, port=port, db=0,
            decode_responses=True,
            socket_connect_timeout=2.0,
            socket_timeout=2.0,
        )
        await client.ping()
        _redis_client = client
        logger.info("Redis connected: %s:%d", host, port)
        return _redis_client
    except Exception as e:
        _redis_disabled = True
        logger.warning("Redis unavailable, falling back to L1-only: %s", e)
        return None


def params_hash(extra: Optional[Dict[str, Any]]) -> str:
    """sha256 от любого extra-параметра (для будущих анализаторов с custom настройками)."""
    if not extra:
        return ""
    s = json.dumps(extra, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def make_key(analyzer: str, team_id: int, n_window: int,
             league_filter: int, venue: str, ph: str) -> str:
    return f"anl:{analyzer}:{team_id}:{n_window}:{league_filter}:{venue}:{ph or '_'}"


async def get(
    analyzer: str,
    team_id: int,
    n_window: int,
    league_filter: int = 0,
    venue: str = "any",
    extra: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """
    Возвращает payload (то, что было записано через set) или None при MISS.
    Никогда не бросает исключения — на любую ошибку кэша возвращает None.
    """
    ph = params_hash(extra)
    key = make_key(analyzer, team_id, n_window, league_filter, venue, ph)

    # L2: Redis
    rc = await _get_redis()
    if rc is not None:
        try:
            raw = await rc.get(key)
            if raw is not None:
                return json.loads(raw)
        except Exception as e:
            logger.warning("Redis GET failed (key=%s): %s", key, e)

    # L1: Postgres
    try:
        pool = await get_pool()
        row = await pool.fetchrow(
            """
            SELECT payload, computed_at, ttl_seconds
            FROM analytics_python_cache
            WHERE analyzer = $1 AND team_id = $2 AND n_window = $3
              AND league_filter = $4 AND venue = $5 AND params_hash = $6
              AND computed_at + (ttl_seconds || ' seconds')::INTERVAL > now()
            """,
            analyzer, team_id, n_window, league_filter, venue, ph,
        )
        if row is not None:
            payload = row["payload"]
            # Pre-warm L2 (best-effort, не блокируем)
            if rc is not None:
                age = datetime.utcnow() - row["computed_at"]
                ttl_left = max(60, int(row["ttl_seconds"]) - int(age.total_seconds()))
                try:
                    await rc.setex(key, ttl_left, json.dumps(payload))
                except Exception as e:
                    logger.debug("L2 pre-warm failed (key=%s): %s", key, e)
            return payload
    except Exception as e:
        logger.warning("L1 GET failed (key=%s): %s", key, e)

    return None


async def set(
    analyzer: str,
    team_id: int,
    n_window: int,
    payload: Dict[str, Any],
    league_filter: int = 0,
    venue: str = "any",
    extra: Optional[Dict[str, Any]] = None,
    ttl_seconds: int = 3600,
) -> None:
    """
    Записывает в L1 (UPSERT) и L2 (SETEX). Best-effort: если L2 упал —
    пишем хотя бы в L1.
    """
    ph = params_hash(extra)
    key = make_key(analyzer, team_id, n_window, league_filter, venue, ph)
    raw = json.dumps(payload, default=str)

    # L1
    try:
        pool = await get_pool()
        await pool.execute(
            """
            INSERT INTO analytics_python_cache
                (analyzer, team_id, n_window, league_filter, venue, params_hash,
                 payload, computed_at, ttl_seconds)
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, now(), $8)
            ON CONFLICT (analyzer, team_id, n_window, league_filter, venue, params_hash)
            DO UPDATE SET payload = EXCLUDED.payload,
                          computed_at = now(),
                          ttl_seconds = EXCLUDED.ttl_seconds
            """,
            analyzer, team_id, n_window, league_filter, venue, ph,
            raw, ttl_seconds,
        )
    except Exception as e:
        logger.warning("L1 SET failed (key=%s): %s", key, e)

    # L2
    rc = await _get_redis()
    if rc is not None:
        try:
            await rc.setex(key, ttl_seconds, raw)
        except Exception as e:
            logger.warning("L2 SET failed (key=%s): %s", key, e)


async def invalidate_team(team_id: int) -> int:
    """
    Полная инвалидация всех анализаторов для одной команды.
    Вызывается, например, после verify_predictions (новая finished-игра).
    Возвращает число удалённых L1-строк.
    """
    n_deleted = 0
    try:
        pool = await get_pool()
        n_deleted = await pool.fetchval(
            """
            WITH deleted AS (
                DELETE FROM analytics_python_cache WHERE team_id = $1 RETURNING 1
            )
            SELECT count(*) FROM deleted
            """,
            team_id,
        )
    except Exception as e:
        logger.warning("L1 invalidate_team(%d) failed: %s", team_id, e)

    rc = await _get_redis()
    if rc is not None:
        try:
            # Scan + delete по pattern (мало записей, безопасно)
            pattern = f"anl:*:{team_id}:*"
            async for key in rc.scan_iter(match=pattern, count=500):
                await rc.delete(key)
        except Exception as e:
            logger.warning("L2 invalidate_team(%d) failed: %s", team_id, e)

    return int(n_deleted or 0)


async def healthcheck() -> Dict[str, Any]:
    """Краткий статус двух уровней."""
    out: Dict[str, Any] = {"l1": {"ok": False}, "l2": {"ok": False, "disabled": _redis_disabled}}
    try:
        pool = await get_pool()
        n = await pool.fetchval("SELECT count(*) FROM analytics_python_cache")
        out["l1"] = {"ok": True, "rows": int(n or 0)}
    except Exception as e:
        out["l1"] = {"ok": False, "error": f"{type(e).__name__}: {e}"}
    rc = await _get_redis()
    if rc is not None:
        try:
            await rc.ping()
            out["l2"] = {"ok": True}
        except Exception as e:
            out["l2"] = {"ok": False, "error": f"{type(e).__name__}: {e}"}
    return out
