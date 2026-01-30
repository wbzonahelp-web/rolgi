#!/bin/bash
#
# Quick SSH Connect Script
# Быстрое подключение к серверу
#

SERVER_HOST="${DEPLOY_HOST:-158.69.195.140}"
SERVER_USER="${DEPLOY_USER:-sshauto}"
SERVER_PORT="${DEPLOY_PORT:-22}"

echo "Connecting to $SERVER_USER@$SERVER_HOST:$SERVER_PORT..."
ssh -p $SERVER_PORT $SERVER_USER@$SERVER_HOST
