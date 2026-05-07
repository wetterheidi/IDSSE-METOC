#!/bin/bash
set -e

DOMAIN="idsse.wetterheidi.de"
APP_DIR="/apps/IDSSE-METOC"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== IDSSE-METOC Setup ==="

# App-Verzeichnis anlegen und Dateien kopieren
mkdir -p "$APP_DIR"
cp -r "$REPO_DIR/docs/." "$APP_DIR/"
chown -R www-data:www-data "$APP_DIR"

# nginx konfigurieren
cp "$REPO_DIR/deploy/nginx-idsse.conf" /etc/nginx/sites-available/$DOMAIN
ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN

# SSL via certbot (überschreibt die nginx-Config mit SSL-Block)
certbot --nginx -d $DOMAIN

nginx -t && systemctl reload nginx

echo "=== Setup abgeschlossen: https://$DOMAIN ==="
