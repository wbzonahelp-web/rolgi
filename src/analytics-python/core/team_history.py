"""
Загрузка истории команды из PostgreSQL.

Порт логики из src/analytics/compute-prediction.js → loadGames.
КРИТИЧНО: SQL должен 1:1 совпадать с Node.js, чтобы Python-анализаторы видели
те же данные, что и JS. Любое расхождение = метрики несопоставимы.

Канонический паттерн резолва ID (см. AGENT_PROMPT.md):
    WHERE sstats_id = $1 OR id = $1
    ORDER BY (sstats_id = $1) DESC, id ASC
    LIMIT 1

Это исключает баги с конфликтами id↔sstats_id (945k для games, 4.6k для teams).
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from .base import TeamGameRecord
from .db import get_pool

logger = logging.getLogger(__name__)


async def resolve_team_id(any_id: int) -> Optional[int]:
    """sstats_id или internal id команды → internal id или None."""
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT id FROM teams
        WHERE sstats_id = $1 OR id = $1
        ORDER BY (sstats_id = $1) DESC, id ASC
        LIMIT 1
        """,
        any_id,
    )
    return row["id"] if row else None


async def resolve_league_id(any_id: int) -> Optional[int]:
    """sstats_id или internal id лиги → internal id или None."""
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT id FROM leagues
        WHERE sstats_id = $1 OR id = $1
        ORDER BY (sstats_id = $1) DESC, id ASC
        LIMIT 1
        """,
        any_id,
    )
    return row["id"] if row else None


async def resolve_team_meta(any_id: int) -> Optional[Dict[str, Any]]:
    """Полные метаданные команды (для ответа API)."""
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT id, sstats_id, name, short_name, logo, country_name
        FROM teams
        WHERE sstats_id = $1 OR id = $1
        ORDER BY (sstats_id = $1) DESC, id ASC
        LIMIT 1
        """,
        any_id,
    )
    return dict(row) if row else None


async def load_team_history(
    team_internal_id: int,
    n: int = 20,
    league_internal_id: Optional[int] = None,
    venue: str = "any",
    before_date: Optional[datetime] = None,
) -> List[TeamGameRecord]:
    """
    Загружает последние N finished матчей команды.

    Args:
        team_internal_id: internal id команды (после резолва).
        n: размер окна (6..100).
        league_internal_id: если не None — фильтр по лиге.
        venue: 'any' | 'home' | 'away'.
        before_date: ограничить датой матча (для prediction-loading без leakage).

    Returns:
        Список TeamGameRecord в порядке newest→oldest (как в JS).
        Каждый элемент уже нормализован: gf/ga/gd рассчитаны с точки зрения команды
        (а не дома/гостей), xg_for/xg_against тоже.
    """
    n = max(6, min(100, int(n)))
    pool = await get_pool()

    # venue condition (зеркалит JS-логику)
    if venue == "home":
        venue_cond = "g.home_team_id = $1"
    elif venue == "away":
        venue_cond = "g.away_team_id = $1"
    else:
        venue_cond = "(g.home_team_id = $1 OR g.away_team_id = $1)"

    # date upper bound (для prediction-loading)
    date_cond = ""
    params: List[Any] = [team_internal_id, n, league_internal_id]
    if before_date is not None:
        params.append(before_date)
        date_cond = f"AND g.date < ${len(params)}"

    sql = f"""
        SELECT g.id, g.date,
               g.home_team_id, g.away_team_id,
               g.home_score, g.away_score,
               gs.expected_goals_home, gs.expected_goals_away,
               gs.shots_home, gs.shots_away,
               gs.possession_home, gs.possession_away
        FROM games g
        LEFT JOIN game_statistics gs ON gs.game_id = g.id
        WHERE {venue_cond}
          AND g.is_deleted = false
          AND g.status = 'finished'
          AND ($3::int IS NULL OR g.league_id = $3)
          {date_cond}
        ORDER BY g.date DESC
        LIMIT $2
    """

    rows = await pool.fetch(sql, *params)

    out: List[TeamGameRecord] = []
    for r in rows:
        is_home = r["home_team_id"] == team_internal_id
        gf = r["home_score"] if is_home else r["away_score"]
        ga = r["away_score"] if is_home else r["home_score"]

        outcome: Optional[str] = None
        if gf is not None and ga is not None:
            if gf > ga:   outcome = "W"
            elif gf < ga: outcome = "L"
            else:         outcome = "D"

        xg_h = r["expected_goals_home"]
        xg_a = r["expected_goals_away"]
        xg_for = float(xg_h) if (is_home and xg_h is not None) else (float(xg_a) if (not is_home and xg_a is not None) else None)
        xg_against = float(xg_a) if (is_home and xg_a is not None) else (float(xg_h) if (not is_home and xg_h is not None) else None)
        xg_diff = (xg_for - xg_against) if (xg_for is not None and xg_against is not None) else None

        sh_for = r["shots_home"] if is_home else r["shots_away"]
        sh_against = r["shots_away"] if is_home else r["shots_home"]

        poss_h = r["possession_home"]
        poss_a = r["possession_away"]
        possession = float(poss_h) if (is_home and poss_h is not None) else (float(poss_a) if (not is_home and poss_a is not None) else None)

        out.append(TeamGameRecord(
            date=r["date"].isoformat() if r["date"] else "",
            outcome=outcome,
            gf=gf, ga=ga,
            gd=(gf - ga) if (gf is not None and ga is not None) else None,
            xg_for=xg_for, xg_against=xg_against, xg_diff=xg_diff,
            shots_for=sh_for, shots_against=sh_against,
            possession=possession,
            is_home=is_home,
        ))
    return out
