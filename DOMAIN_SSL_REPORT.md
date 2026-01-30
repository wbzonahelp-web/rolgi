# 🌐 ROLGI.COM - SSL СЕРТИФИКАТ УСТАНОВЛЕН

**Дата:** 2026-01-30  
**Домен:** rolgi.com, www.rolgi.com  
**SSL Провайдер:** Let's Encrypt  
**Статус:** ✅ ПОЛНОСТЬЮ НАСТРОЕН

---

## ✅ Что настроено

### 1. Домен rolgi.com
- ✅ DNS записи указывают на 158.69.195.140
- ✅ HTTP (порт 80) настроен и работает
- ✅ HTTPS (порт 443) настроен и работает
- ✅ Автоматический редирект HTTP → HTTPS

### 2. SSL Сертификат
- **Провайдер:** Let's Encrypt
- **Тип:** Domain Validated (DV)
- **Домены:** rolgi.com, www.rolgi.com
- **Выдан:** 2026-01-30
- **Истекает:** 2026-04-30 (90 дней)
- **Автопродление:** ✅ Настроено через Certbot

### 3. Безопасность
- ✅ TLS 1.2 и TLS 1.3
- ✅ Современные шифры
- ✅ HSTS включен (max-age=31536000)
- ✅ HTTP/2 поддержка

---

## 🔗 Доступные эндпоинты

### HTTPS (основной)
- **Health Check:** https://rolgi.com/health
- **API Docs:** https://rolgi.com/docs
- **API Versions:** https://rolgi.com/api/versions
- **Metrics:** https://rolgi.com/metrics

### HTTP (редирект)
- http://rolgi.com → https://rolgi.com

---

## 📋 Обновленные конфигурации

### .env
```bash
FRONTEND_URL=https://rolgi.com
```

### docker-compose.prod.yml
- Добавлены volumes для Let's Encrypt сертификатов
- Добавлен volume /var/www/certbot для ACME challenge

### nginx/conf.d/rolgi.conf
- HTTP блок с редиректом на HTTPS
- HTTPS блок с SSL сертификатами
- Проксирование на API
- HSTS заголовки

---

## 🔄 Автоматическое продление SSL

Certbot автоматически настроен на продление сертификата:

```bash
# Проверка статуса автопродления
sudo systemctl status certbot.timer

# Тестовое продление (без фактического продления)
sudo certbot renew --dry-run

# Ручное продление (если нужно)
sudo certbot renew
```

**Certbot будет автоматически проверять и обновлять сертификат за 30 дней до истечения.**

---

## 🧪 Проверка работоспособности

### HTTP редирект
```bash
curl -I http://rolgi.com/health
# Ожидается: 301 Moved Permanently, Location: https://rolgi.com/health
```

### HTTPS работа
```bash
curl -I https://rolgi.com/health
# Ожидается: HTTP/2 200
```

### SSL сертификат
```bash
echo | openssl s_client -servername rolgi.com -connect rolgi.com:443 2>/dev/null | openssl x509 -noout -dates
# Ожидается: notBefore и notAfter даты
```

### Онлайн проверка SSL
- **SSL Labs:** https://www.ssllabs.com/ssltest/analyze.html?d=rolgi.com
- **Security Headers:** https://securityheaders.com/?q=rolgi.com

---

## 📂 Расположение файлов

### SSL сертификаты
- **Fullchain:** /etc/letsencrypt/live/rolgi.com/fullchain.pem
- **Private Key:** /etc/letsencrypt/live/rolgi.com/privkey.pem
- **Certificate:** /etc/letsencrypt/live/rolgi.com/cert.pem
- **Chain:** /etc/letsencrypt/live/rolgi.com/chain.pem

### Конфигурация Nginx
- **Main config:** /home/ubuntu/rolgi/nginx/nginx.conf
- **Site config:** /home/ubuntu/rolgi/nginx/conf.d/rolgi.conf
- **Certbot webroot:** /var/www/certbot

### Логи
- **Certbot:** /var/log/letsencrypt/letsencrypt.log
- **Nginx:** docker logs rolgi-nginx

---

## ⚠️ Важные замечания

1. **Автопродление SSL**
   - Сертификат автоматически обновляется Certbot
   - Проверка происходит дважды в день
   - Nginx автоматически перезагружается после обновления

2. **Firewall**
   - Порт 80 должен быть открыт для ACME challenge
   - Порт 443 для HTTPS трафика
   - Порт 3000 для прямого доступа к API (опционально)

3. **Резервное копирование**
   - Рекомендуется делать backup /etc/letsencrypt
   - При миграции сервера сохраните этот каталог

---

## 🎉 Статус: ГОТОВО

- [x] Домен rolgi.com настроен
- [x] DNS записи указывают на сервер
- [x] SSL сертификат получен и установлен
- [x] HTTP → HTTPS редирект работает
- [x] HTTPS полностью функционален
- [x] Автопродление сертификата настроено
- [x] Безопасность (HSTS, TLS 1.2+) включена
- [x] Все изменения закоммичены на GitHub

**Домен rolgi.com полностью готов к production использованию!** 🚀
