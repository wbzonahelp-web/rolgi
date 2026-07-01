"""
FastAPI приложение rolgi-analytics.

Архитектура:
    /health            — статус БД, кэша, реестра анализаторов
    /analyzers         — список зарегистрированных (auto-discovery из ANALYZER_REGISTRY)
    /analyzers/{name}/team/{team_id}
                       — расчёт анализатора для команды (с кэшем)
    POST /admin/cache/invalidate-team/{team_id}
                       — ручная инвалидация (опционально для будущего вызова из Node)

Параметры запроса (query string):
    n_window     int 6..100   (default 20)
    league_id    int          (опц., sstats_id или internal id лиги)
    venue        any|home|away (default any)
    no_cache     true|false   (default false; принудительно пересчитать)
    n_states     int          (опц., прокинется в analyzer.params)

Ответ:
    {success, source: 'cache'|'live', data: AnalyzerResult.to_dict()}
"""
from __future__ import annotations

import logging
import os
import time
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse

from .core.base import ANALYZER_REGISTRY, list_analyzers, get_analyzer
from .core.db import healthcheck as db_healthcheck, close_pool
from .core.cache import healthcheck as cache_healthcheck, get as cache_get, set as cache_set, invalidate_team
from .core.team_history import resolve_team_id, resolve_league_id, resolve_team_meta, load_team_history

# Триггер регистрации анализаторов (import side-effect)
from . import analyzers  # noqa: F401

# ───── Логирование ─────
log_level = os.getenv("LOG_LEVEL", "info").upper()
logging.basicConfig(
    level=getattr(logging, log_level, logging.INFO),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("analytics")

app = FastAPI(
    title="rolgi-analytics",
    version="1.0.0",
    description="Python analyzers (HMM and future ML) for the rolgi platform",
)


@app.on_event("startup")
async def _on_startup() -> None:
    logger.info("Starting up: %d analyzers registered: %s",
                len(ANALYZER_REGISTRY), list(ANALYZER_REGISTRY.keys()))


@app.on_event("shutdown")
async def _on_shutdown() -> None:
    await close_pool()
    logger.info("Shutdown complete")


@app.get("/health")
async def health() -> dict:
    db = await db_healthcheck()
    cache = await cache_healthcheck()
    return {
        "ok": bool(db.get("ok")) and bool(cache.get("l1", {}).get("ok")),
        "db": db,
        "cache": cache,
        "analyzers": len(ANALYZER_REGISTRY),
    }


@app.get("/analyzers")
async def analyzers_list() -> dict:
    return {"success": True, "data": list_analyzers()}


@app.get("/analyzers/{name}/team/{team_id}")
async def analyze_team(
    name: str,
    team_id: int,
    n_window: int = Query(20, ge=6, le=100),
    league_id: Optional[int] = Query(None),
    venue: str = Query("any", pattern="^(any|home|away)$"),
    no_cache: bool = Query(False),
    n_states: Optional[int] = Query(None, ge=2, le=8),
) -> dict:
    analyzer = get_analyzer(name)
    if analyzer is None:
        raise HTTPException(status_code=404, detail=f"Analyzer '{name}' not found")

    # Резолв команды
    internal_team_id = await resolve_team_id(team_id)
    if internal_team_id is None:
        raise HTTPException(status_code=404, detail=f"Team {team_id} not found")

    # Резолв лиги (опц.)
    league_filter_internal = 0
    if league_id is not None:
        resolved = await resolve_league_id(league_id)
        if resolved is None:
            raise HTTPException(status_code=404, detail=f"League {league_id} not found")
        league_filter_internal = int(resolved)

    extra = {}
    if n_states is not None:
        extra["n_states"] = n_states

    # Cache lookup
    if not no_cache:
        cached = await cache_get(
            analyzer=name,
            team_id=internal_team_id,
            n_window=n_window,
            league_filter=league_filter_internal,
            venue=venue,
            extra=extra,
        )
        if cached is not None:
            return {"success": True, "source": "cache", "data": cached}

    # Загрузка истории и расчёт
    history = await load_team_history(
        team_internal_id=internal_team_id,
        n=n_window,
        league_internal_id=(league_filter_internal or None),
        venue=venue,
    )

    t0 = time.perf_counter()
    params = {**extra}
    result = analyzer.analyze(history, **params)
    elapsed_total_ms = (time.perf_counter() - t0) * 1000

    payload = result.to_dict()
    payload["history_size"] = len(history)
    payload["total_ms"] = elapsed_total_ms

    # Cache write (только если результат не error и есть value)
    if result.error is None and result.value is not None:
        # TTL: 1ч для свежих, 24ч если value=None reasoning (NO_DATA)
        ttl = int(os.getenv("ANALYZER_CACHE_TTL_SEC", "3600"))
        await cache_set(
            analyzer=name,
            team_id=internal_team_id,
            n_window=n_window,
            payload=payload,
            league_filter=league_filter_internal,
            venue=venue,
            extra=extra,
            ttl_seconds=ttl,
        )

    return {"success": True, "source": "live", "data": payload}


@app.post("/admin/cache/invalidate-team/{team_id}")
async def admin_invalidate_team(team_id: int) -> dict:
    """Инвалидация кэша для одной команды (для будущего вызова из Node.js verify-hook)."""
    internal_id = await resolve_team_id(team_id)
    if internal_id is None:
        raise HTTPException(status_code=404, detail=f"Team {team_id} not found")
    n_deleted = await invalidate_team(internal_id)
    return {"success": True, "team_id": internal_id, "l1_deleted": n_deleted}


# ───── Логирование ошибок ─────
@app.exception_handler(Exception)
async def _global_exception_handler(_request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error")
    return JSONResponse(
        status_code=500,
        content={"success": False, "error": f"{type(exc).__name__}: {exc}"},
    )
