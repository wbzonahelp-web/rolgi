"""
Базовый класс для всех Python-анализаторов rolgi.

Контракт:
    Каждый анализатор наследует BaseAnalyzer, имеет уникальное `name`,
    реализует синхронный compute(team_history, **params) -> AnalyzerResult.
    Параметры (n_window, league_filter, venue, ...) принимаются явно
    в FastAPI-роутах, прокидываются в compute через **params.

    Регистрация: автоматическая через `register_analyzer` декоратор —
    при импорте модуля анализатор появляется в ANALYZER_REGISTRY,
    FastAPI читает реестр и автоматически создаёт endpoint
    POST /analyzers/{name} (см. core/router.py).

Принцип: ни один анализатор не должен знать про FastAPI, БД, кэш или сеть.
Он принимает чистые данные (List[TeamGameRecord]) и возвращает чистый результат.
Всё IO — снаружи, в core/.
"""
from __future__ import annotations

import time
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional, Type

logger = logging.getLogger(__name__)


@dataclass
class TeamGameRecord:
    """
    Одна строка истории команды (после загрузки и нормализации).
    Совместимо с тем, что грузит Node.js compute-prediction.js → loadGames.
    """
    date: str                     # ISO8601 (последний матч → первый в списке)
    outcome: Optional[str]        # 'W' | 'D' | 'L' | None
    gf: Optional[int]             # голы команды
    ga: Optional[int]             # голы соперника
    gd: Optional[int]             # gf - ga
    xg_for: Optional[float]
    xg_against: Optional[float]
    xg_diff: Optional[float]
    shots_for: Optional[int] = None
    shots_against: Optional[int] = None
    possession: Optional[float] = None
    is_home: Optional[bool] = None

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "TeamGameRecord":
        return cls(
            date=str(d.get('date')),
            outcome=d.get('outcome'),
            gf=d.get('gf'),
            ga=d.get('ga'),
            gd=d.get('gd'),
            xg_for=d.get('xg_for'),
            xg_against=d.get('xg_against'),
            xg_diff=d.get('xg_diff'),
            shots_for=d.get('shots_for'),
            shots_against=d.get('shots_against'),
            possession=d.get('possession'),
            is_home=d.get('is_home'),
        )


@dataclass
class AnalyzerResult:
    """
    Унифицированный результат анализатора. Совместим по смыслу с JS-аналогами:
        value      ∈ [0, 1] или другая численная метрика
        confidence ∈ [0, 1] — уверенность в результате (зависит от размера выборки)
        details    — произвольный словарь с подробностями (для UI / отладки)

    Кроме того, мы добавляем meta для оркестрации:
        analyzer   — name анализатора
        n_used     — сколько матчей реально пошло в расчёт
        elapsed_ms — время вычисления (без IO)
        version    — версия модели/формулы (для будущего рефакторинга)
    """
    analyzer: str
    value: Optional[float]
    confidence: float
    details: Dict[str, Any] = field(default_factory=dict)
    n_used: int = 0
    elapsed_ms: float = 0.0
    version: str = "1.0"
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class BaseAnalyzer(ABC):
    """
    Базовый класс. Наследник должен:
        - объявить class-level: name (str), version (str), min_games (int)
        - реализовать compute(history: List[TeamGameRecord], **params) -> Dict
          (возвращает dict с value/confidence/details, всё остальное обернёт обвязка)
    """
    name: str = ""
    version: str = "1.0"
    min_games: int = 10
    description: str = ""

    def __init__(self) -> None:
        if not self.name:
            raise ValueError(f"{self.__class__.__name__}: class-level 'name' must be set")

    def analyze(self, history: List[TeamGameRecord], **params: Any) -> AnalyzerResult:
        """
        Обвязка: валидация min_games, замер времени, перехват ошибок.
        Сам compute — synchronous, чистая математика.
        """
        t0 = time.perf_counter()
        n = len(history)
        if n < self.min_games:
            return AnalyzerResult(
                analyzer=self.name,
                value=None,
                confidence=0.0,
                details={"reason": "insufficient_history", "n_required": self.min_games, "n_provided": n},
                n_used=n,
                elapsed_ms=(time.perf_counter() - t0) * 1000,
                version=self.version,
            )
        try:
            payload = self.compute(history, **params)
        except Exception as e:
            logger.exception("Analyzer %s failed", self.name)
            return AnalyzerResult(
                analyzer=self.name,
                value=None,
                confidence=0.0,
                details={},
                n_used=n,
                elapsed_ms=(time.perf_counter() - t0) * 1000,
                version=self.version,
                error=f"{type(e).__name__}: {e}",
            )
        elapsed = (time.perf_counter() - t0) * 1000
        return AnalyzerResult(
            analyzer=self.name,
            value=payload.get("value"),
            confidence=float(payload.get("confidence", 0.0)),
            details=payload.get("details", {}),
            n_used=n,
            elapsed_ms=elapsed,
            version=self.version,
        )

    @abstractmethod
    def compute(self, history: List[TeamGameRecord], **params: Any) -> Dict[str, Any]:
        """
        Чистая математика. Возвращает dict с обязательным ключом 'value'
        и опциональными 'confidence', 'details'.
        Не должна делать IO. Не должна использовать time/random без seed.
        """
        raise NotImplementedError


# ──────────────────────────────────────────────────────────────────────────
# Registry
# ──────────────────────────────────────────────────────────────────────────

ANALYZER_REGISTRY: Dict[str, BaseAnalyzer] = {}


def register_analyzer(cls: Type[BaseAnalyzer]) -> Type[BaseAnalyzer]:
    """
    Декоратор для авто-регистрации. Использование:

        @register_analyzer
        class MyHMM(BaseAnalyzer):
            name = "hmm"
            ...
    """
    if not issubclass(cls, BaseAnalyzer):
        raise TypeError(f"{cls.__name__} must inherit BaseAnalyzer")
    instance = cls()
    if not instance.name:
        raise ValueError(f"{cls.__name__}.name must be set")
    if instance.name in ANALYZER_REGISTRY:
        logger.warning("Analyzer %s already registered, overwriting", instance.name)
    ANALYZER_REGISTRY[instance.name] = instance
    logger.info("Registered analyzer: %s v%s", instance.name, instance.version)
    return cls


def get_analyzer(name: str) -> Optional[BaseAnalyzer]:
    return ANALYZER_REGISTRY.get(name)


def list_analyzers() -> List[Dict[str, Any]]:
    return [
        {
            "name": a.name,
            "version": a.version,
            "min_games": a.min_games,
            "description": a.description,
        }
        for a in ANALYZER_REGISTRY.values()
    ]
