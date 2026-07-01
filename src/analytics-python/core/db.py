"""
Управление пулом подключений к PostgreSQL через asyncpg.

Особенности:
    - Lazy initialization через get_pool(): pool создаётся при первом вызове
      и кэшируется на всё время жизни процесса (asyncpg.Pool сам thread-safe).
    - Retry на старте: если БД ещё не готова при первом ping (бывает в Docker
      Compose до того как postgres healthcheck станет 'healthy') — до 10 попыток
      с экспоненциальной паузой.
    - statement_cache_size=0 — отключает prepared statements в pgbouncer-friendly
      режиме (даже если pgbouncer не используется, это безопасный дефолт
      при долгоживущих соединениях с разнотипными запросами).
    - command_timeout=10s — защита от зависших SQL.

ENV переменные (читаются один раз при первом вызове):
    DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
    DB_POOL_MIN (default 1), DB_POOL_MAX (default 10)
    DB_CONNECT_TIMEOUT_SEC (default 30)
"""
from __future__ import annotations

import os
import asyncio
import logging
from typing import Optional

import asyncpg

logger = logging.getLogger(__name__)

_pool: Optional[asyncpg.Pool] = None
_pool_lock = asyncio.Lock()


def _read_config() -> dict:
    return {
        "host": os.getenv("DB_HOST", "postgres"),
        "port": int(os.getenv("DB_PORT", "5432")),
        "database": os.getenv("DB_NAME", "rolgi_v6"),
        "user": os.getenv("DB_USER", "postgres"),
        "password": os.getenv("DB_PASSWORD", "postgres"),
        "min_size": int(os.getenv("DB_POOL_MIN", "1")),
        "max_size": int(os.getenv("DB_POOL_MAX", "10")),
        "connect_timeout": float(os.getenv("DB_CONNECT_TIMEOUT_SEC", "30")),
    }


async def _create_pool_with_retry(max_attempts: int = 10, base_delay: float = 1.0) -> asyncpg.Pool:
    cfg = _read_config()
    last_err: Optional[Exception] = None
    for attempt in range(1, max_attempts + 1):
        try:
            pool = await asyncpg.create_pool(
                host=cfg["host"],
                port=cfg["port"],
                database=cfg["database"],
                user=cfg["user"],
                password=cfg["password"],
                min_size=cfg["min_size"],
                max_size=cfg["max_size"],
                timeout=cfg["connect_timeout"],
                command_timeout=10,
                statement_cache_size=0,
            )
            # Ping
            async with pool.acquire() as conn:
                await conn.fetchval("SELECT 1")
            logger.info(
                "DB pool created: host=%s db=%s min=%d max=%d (attempt %d)",
                cfg["host"], cfg["database"], cfg["min_size"], cfg["max_size"], attempt,
            )
            return pool
        except Exception as e:
            last_err = e
            delay = min(base_delay * (2 ** (attempt - 1)), 15.0)
            logger.warning(
                "DB pool init attempt %d/%d failed: %s; sleeping %.1fs",
                attempt, max_attempts, e, delay,
            )
            await asyncio.sleep(delay)
    raise RuntimeError(f"Failed to create DB pool after {max_attempts} attempts: {last_err}")


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is not None:
        return _pool
    async with _pool_lock:
        if _pool is None:
            _pool = await _create_pool_with_retry()
    return _pool


async def close_pool() -> None:
    """Вызывать на shutdown FastAPI."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        logger.info("DB pool closed")


async def healthcheck() -> dict:
    """Проверка здоровья БД для /health endpoint."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            v = await conn.fetchval("SELECT 1")
        return {"ok": v == 1, "pool_size": pool.get_size() if pool else 0}
    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}
