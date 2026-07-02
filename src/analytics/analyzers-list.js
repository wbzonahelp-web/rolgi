'use strict';

/**
 * Список всех доступных анализаторов с id, name и description.
 * Используется в GET /api/strategies/analyzers и в других компонентах UI.
 */

const ANALYZERS = [
    {
        id: 'markov_outcome',
        name: 'Markov-прогноз',
        description: 'Прогноз W/D/L по цепи Маркова. ↑ вес = больше доверия к сериям',
    },
    {
        id: 'markov_state',
        name: 'Предсказуемость',
        description: 'Стабильность результатов. ↑ вес = сильнее влияние стабильных команд',
    },
    {
        id: 'shannon_entropy',
        name: 'Энтропия тоталов',
        description: 'Разнообразие тоталов. ↑ вес = больше штраф хаотичным командам',
    },
    {
        id: 'form_inertia',
        name: 'Инерция формы',
        description: 'Сохраняет ли форма. ↑ вес = тренд-команды получают бонус',
    },
    {
        id: 'multipeak',
        name: 'Мультимодальность',
        description: 'Биполярность. ↑ вес = сильнее штраф непредсказуемым командам',
    },
    {
        id: 'hmm',
        name: 'HMM состояние',
        description: 'ML-модель скрытых состояний. ↑ вес = больше влияние машинного обучения',
    },
    {
        id: 'poisson',
        name: 'Poisson',
        description: 'Poisson-модель',
    },
    {
        id: 'valenzetti',
        name: 'Уравнение Валенцетти',
        description: 'Poisson-модель с 6 факторами. ↑ вес = больше влияния Valenzetti',
    },
];

module.exports = ANALYZERS;