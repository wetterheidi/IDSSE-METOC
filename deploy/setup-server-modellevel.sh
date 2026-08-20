#!/bin/bash
set -e

# Deployt die "Modell-Level"-Instanz (Branch feature/michael-datasource:
# Datenquelle ist Michaels ratenlimitfreie Instanz mit nativen Modell-Level-
# Wolkendaten statt Druckstufen) parallel zur regulären main-Instanz. Muss
# von einem Checkout laufen, das auf feature/michael-datasource steht --
# kopiert 1:1 den lokalen docs/-Stand, wie setup-server.sh es für main tut.

DOMAIN="idsseml.wetterheidi.de"
APP_DIR="/apps/IDSSE-METOC-modellevel"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

CURRENT_BRANCH="$(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD)"
if [ "$CURRENT_BRANCH" != "feature/michael-datasource" ]; then
    echo "FEHLER: Checkout steht auf '$CURRENT_BRANCH', nicht auf 'feature/michael-datasource'."
    echo "git checkout feature/michael-datasource && git pull, dann erneut ausführen."
    exit 1
fi

echo "=== IDSSE-METOC (Modell-Level) Setup ==="

# App-Verzeichnis anlegen und Dateien kopieren
mkdir -p "$APP_DIR"
cp -r "$REPO_DIR/docs/." "$APP_DIR/"
chown -R www-data:www-data "$APP_DIR"

# nginx konfigurieren
cp "$REPO_DIR/deploy/nginx-idsse-modellevel.conf" /etc/nginx/sites-available/$DOMAIN
ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN
nginx -t && systemctl reload nginx

# SSL via certbot (überschreibt die nginx-Config mit SSL-Block).
# Zertifikat wurde ggf. schon ausgestellt -- certbot ist idempotent und
# installiert es dann einfach in den neuen Server-Block.
certbot --nginx -d $DOMAIN

nginx -t && systemctl reload nginx

echo "=== Setup abgeschlossen: https://$DOMAIN ==="
