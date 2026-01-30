#!/bin/bash

# Массовое исправление импортов в проекте

echo 'Исправление импортов в src/monitoring/prometheus/...'
find src/monitoring/prometheus/ -name '*.js' -exec sed -i "s|require('../core/|require('../../core/|g" {} +
find src/monitoring/prometheus/ -name '*.js' -exec sed -i "s|require('../database/|require('../../database/|g" {} +

echo 'Исправление импортов logger на pino...'
find src/ -name '*.js' -exec sed -i "s|const logger = require.*logger.*|const pino = require('pino'); const logger = pino();|g" {} +

echo 'Исправление версионных маршрутов...'
find src/api/versions/ -name '*.js' -exec sed -i "s|require('../routes/|require('../../routes/|g" {} +
find src/api/versions/ -name '*.js' -exec sed -i "s|require('../database/|require('../../../database/|g" {} +
find src/api/versions/ -name '*.js' -exec sed -i "s|require('../loader/|require('../../../loader/|g" {} +

echo '✓ Все импорты исправлены'
