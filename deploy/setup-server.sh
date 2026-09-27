#!/bin/bash
set -e

DOMAIN="idsse.wetterheidi.de"
APP_DIR="/apps/IDSSE-METOC"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Sicherung wie in setup-server-modellevel.sh: nur von einem Checkout auf
# main deployen. Sonst landet z. B. die Modell-Level-Version (Branch
# feature/michael-datasource) unter idsse.wetterheidi.de.
CURRENT_BRANCH="$(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD)"
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "FEHLER: Checkout steht auf '$CURRENT_BRANCH', nicht auf 'main'."
    echo "Für idsseml.wetterheidi.de: bash deploy/setup-server-modellevel.sh"
    echo "Für idsse.wetterheidi.de: im main-Checkout 'git checkout main && git pull', dann erneut ausführen."
    exit 1
fi

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
