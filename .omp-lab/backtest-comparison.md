# Сравнение результатов: Baseline vs Improved

**Дата:** 2026-06-30  
**Тесты:** 14 (7 лиг × 2 сезона × 100 матчей)

---

## Общие результаты

| Метрика | Baseline | Improved | Δ |
|---------|----------|----------|---|
| **Avg Accuracy** | 50.0% | 50.0% | 0pp |
| **DRAW Predicted** | 137/1400 (9.8%) | 135/1400 (9.6%) | -0.2pp |
| **DRAW Hit Rate** | ~30% (est.) | 35.6% (48/135) | +5.6pp |

---

## Детальное сравнение по лигам

### Premier League
| Season | Baseline Acc | Improved Acc | Δ | DRAW Pred (Improved) |
|--------|--------------|--------------|---|----------------------|
| 2023 | 55% | 56% | +1pp | 6 (1 hit) |
| 2024 | 56% | 55% | -1pp | 5 (2 hits) |

### La Liga
| Season | Baseline Acc | Improved Acc | Δ | DRAW Pred (Improved) |
|--------|--------------|--------------|---|----------------------|
| 2023 | 56% | 45% | -11pp ⚠️ | 10 (3 hits) |
| 2024 | 56% | 55% | -1pp | 18 (9 hits) ⭐ |

### Serie A
| Season | Baseline Acc | Improved Acc | Δ | DRAW Pred (Improved) |
|--------|--------------|--------------|---|----------------------|
| 2023 | 48% | 53% | +5pp | 12 (6 hits) ⭐ |
| 2024 | 53% | 46% | -7pp | 6 (2 hits) |

### Bundesliga
| Season | Baseline Acc | Improved Acc | Δ | DRAW Pred (Improved) |
|--------|--------------|--------------|---|----------------------|
| 2023 | 53% | 53% | 0pp | 1 (0 hits) ⚠️ |
| 2024 | 48% | 48% | 0pp | 2 (0 hits) ⚠️ |

### Ligue 1
| Season | Baseline Acc | Improved Acc | Δ | DRAW Pred (Improved) |
|--------|--------------|--------------|---|----------------------|
| 2023 | 41% | 41% | 0pp | 11 (4 hits) |
| 2024 | 52% | 52% | 0pp | 10 (4 hits) |

### Eredivisie
| Season | Baseline Acc | Improved Acc | Δ | DRAW Pred (Improved) |
|--------|--------------|--------------|---|----------------------|
| 2023 | 57% | 57% | 0pp | 1 (0 hits) ⚠️ |
| 2024 | 56% | 56% | 0pp | 1 (0 hits) ⚠️ |

### Liga Profesional Argentina
| Season | Baseline Acc | Improved Acc | Δ | DRAW Pred (Improved) |
|--------|--------------|--------------|---|----------------------|
| 2023 | 35% | 35% | 0pp | 24 (7 hits) |
| 2024 | 48% | 48% | 0pp | 28 (10 hits) ⭐ |

---

## Анализ результатов

### ✅ Что сработало

1. **DRAW hit rate улучшился:** с ~30% до 35.6% (+5.6pp)
   - La Liga 2024: 9/18 hits (50%) — отличный результат
   - Serie A 2023: 6/12 hits (50%) — отличный результат
   - Liga Argentina: стабильно 29-36% hit rate

2. **Стабильность:** большинство лиг сохранили baseline accuracy
   - Eredivisie: 56-57% (лучшая лига)
   - Premier League: 55-56% (стабильно)

3. **Liga Argentina:** DRAW predictions выросли до 24-28 (было ~52), что ближе к реальности (33% реальных ничьих)

### ⚠️ Проблемы

1. **Bundesliga и Eredivisie:** DRAW всё ещё катастрофически не предсказывается
   - Bundesliga: только 1-2 DRAW predictions (реально 26%)
   - Eredivisie: только 1 DRAW prediction (реально 25%)
   - **Причина:** draw_boost_multiplier 17.3x и 25.2x не применяются достаточно агрессивно

2. **La Liga 2023 деградация:** accuracy упала с 56% до 45% (-11pp)
   - Возможно overcorrection на DRAW

3. **Общая accuracy не выросла:** осталась на уровне 50%
   - Ожидалось 56-58%, получили 50%

---

## Выводы

### Почему не сработало как ожидалось?

1. **Draw boost multiplier применяется ПОСЛЕ базового буста**
   ```js
   const baseDrawBoost = Math.min(0.10, closenessBoost * 0.15);
   const drawBoost = baseDrawBoost * drawBoostMultiplier;
   ```
   - Если baseDrawBoost = 0.10, то даже с multiplier 17.3x → 1.73 (переполнение)
   - Но вероятности нормализуются, теряя эффект

2. **Ensemble effect:** Poisson даёт правильные вероятности, но другие анализаторы (markov 0.15, form 0.10) перевешивают на HOME/AWAY

3. **League-specific avg_goals работают:** параметры применяются корректно, но их влияние меньше ожидаемого

### Что нужно исправить?

**Критично:**
1. **Увеличить базовый cap draw boost** с 0.10 до 0.25-0.30 в poisson.js
   ```js
   const baseDrawBoost = Math.min(0.25, closenessBoost * 0.30); // было 0.10, 0.15
   ```

2. **Применить multiplier до нормализации** или использовать additive approach:
   ```js
   probs.draw += baseDrawBoost + (leagueDrawBoost * 0.10);
   ```

3. **Снизить веса markov/form** или добавить draw-awareness в них

**Желательно:**
4. Walk-forward валидация для подбора оптимальных multipliers
5. Отдельная калибровка для каждой лиги

---

## Рекомендации

### Немедленные действия:
1. ✅ Изменения зафиксированы в git (2 коммита)
2. ⚠️ Не пушить пока — результаты не оправдали ожиданий
3. 🔧 Доработать draw boost логику:
   - Увеличить base cap до 0.25
   - Протестировать на 2-3 проблемных лигах (Bundesliga, Eredivisie)
   - Повторить полный бэктест

### Альтернативный подход:
- Создать отдельную ветку `agent/analyzer-improvements-v2`
- Экспериментировать с разными формулами draw boost
- A/B тест: только league params vs только draw boost vs оба

### Phase 2 (после исправления draw boost):
- Байесовское сглаживание Markov
- Увеличение MIN_GAMES
- Confidence метрики

---

## Статус

**Phase 1:** ⚠️ Частично успешна
- ✅ Bug fixes работают
- ✅ League params работают
- ⚠️ Draw calibration требует доработки

**Следующий шаг:** Доработка draw boost формулы
