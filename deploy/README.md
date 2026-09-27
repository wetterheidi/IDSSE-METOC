# Deploy: zwei parallele Instanzen

Diese App läuft in zwei Varianten parallel auf demselben Server, unter
zwei verschiedenen Domains:

| Variante              | Branch                      | Domain                       | Datenquelle                                    |
|------------------------|------------------------------|-------------------------------|--------------------------------------------------|
| **main**               | `main`                       | https://idsse.wetterheidi.de   | öffentliche Open-Meteo API, alle Modelle          |
| **Modell-Level**       | `feature/michael-datasource` | https://idsseml.wetterheidi.de | ratenlimitfreie ICON-Instanzen (bevorzugt open-meteo.wetterheidi.de, Fallback Michaels Instanzen, dann public), native Modell-Level-Wolken statt Druckstufen, nur icon_d2/icon_eu/icon_global |

Es gibt **keinen Build-Schritt** — `docs/` wird 1:1 auf den Server kopiert.
Deployen heißt also: Branch auschecken, `docs/`-Ordner in das passende
App-Verzeichnis kopieren, nginx neu laden.

## Datenquellen der Modell-Level-Variante

Host-Ketten stehen zentral in `docs/config.js` (`MODEL_API_BASES`,
`ELEVATION_API_BASES`), die Umschaltlogik in `docs/apifetch.js` (Kopie aus
meteokit) bzw. `docs/apiClient.js`:

1. https://open-meteo.wetterheidi.de (ICON-D2, -EU, Global)
2. https://open-meteo.mah.priv.at (D2/EU) bzw. https://open-meteo-temp.mah.priv.at (Global)
3. https://api.open-meteo.com (öffentlich, gedrosselt über die RequestQueue)

Ein Host wird übersprungen bei Netzwerkfehler/Timeout, HTTP ≠ 2xx, kaputtem
JSON oder Antworten mit lauter `null`; danach 5 min lang je Endpunkt und
Modell ans Ende gestellt. Unter der Modellauswahl zeigt die App, welcher
Server geliefert hat (rot bei Fallback). Bodenwerte bleiben auf Modellhöhe
(`elevation=nan`), die DEM90-Höhe dient nur dem Orographie-Hinweis im
Prüfbericht. Für curl-Tests gegen open-meteo.mah.priv.at einen
`Referer`-Header mitschicken, sonst 403.

## Einmalige Einrichtung (bereits erledigt, nur zur Erinnerung)

Auf dem Server liegen zwei getrennte Git-Checkouts, damit man nicht
versehentlich den falschen Branch in die falsche Domain kopiert:

```
/srv/repos/IDSSE-METOC-main/         (Branch: main)
/srv/repos/IDSSE-METOC-modellevel/   (Branch: feature/michael-datasource)
```

Jeder Checkout hat sein eigenes `setup-server*.sh`-Skript, das automatisch
prüft, ob der richtige Branch ausgecheckt ist, bevor es etwas kopiert.

## Routine-Update: main

```bash
cd /srv/repos/IDSSE-METOC-main
git pull
bash deploy/setup-server.sh
```

Deployt nach `/apps/IDSSE-METOC` → https://idsse.wetterheidi.de

Das Skript bricht mit einer Fehlermeldung ab, falls der Checkout NICHT auf
`main` steht — Sicherung dagegen, dass die Modell-Level-Version
versehentlich unter idsse.wetterheidi.de landet.

## Routine-Update: Modell-Level

```bash
cd /srv/repos/IDSSE-METOC-modellevel
git checkout feature/michael-datasource   # falls nicht schon aktiv
git pull
bash deploy/setup-server-modellevel.sh
```

Deployt nach `/apps/IDSSE-METOC-modellevel` → https://idsseml.wetterheidi.de

Das Skript bricht mit einer Fehlermeldung ab, falls der Checkout NICHT auf
`feature/michael-datasource` steht — Sicherung dagegen, dass main-Inhalte
versehentlich unter der Modell-Level-Domain landen.

## Faustregel

> **main-Änderung → main-Checkout aktualisieren → `setup-server.sh`**
> **Modell-Level-Änderung → modellevel-Checkout aktualisieren → `setup-server-modellevel.sh`**

Beide Checkouts sind komplett unabhängig voneinander (verschiedene
Verzeichnisse, verschiedene Branches, verschiedene App- und nginx-
Verzeichnisse) — man kann sie in beliebiger Reihenfolge und unabhängig
voneinander aktualisieren.

## Login/Zugriff

Beide Domains sind über den zentralen "Pförtner"-Login geschützt (siehe Repo
`Nutzerverwaltung`, `pfoertner-offene-punkte.md`) -- nicht mehr über das
frühere `auth_basic`/`.htpasswd-wetterheidi`. Tool-Namen im Pförtner-Panel
(https://verwaltung.wetterheidi.de): `idsse` bzw. `idsseml`. Neue Nutzer
brauchen dort das jeweilige Häkchen, bevor sie Zugriff bekommen -- das ist
unabhängig von den beiden nginx-Configs hier im Repo.

## Falls certbot bei einer neuen Domain meckert

- `NXDOMAIN`: DNS-Eintrag fehlt oder ist falsch (z.B. Domain im Hostnamen-
  Feld doppelt angehängt) — mit `dig +short A <domain>` prüfen, ob er
  überhaupt auflöst.
- `Could not find a matching server block`: Der nginx-Server-Block für die
  Domain existiert noch nicht — erst `setup-server*.sh` laufen lassen
  (legt den Server-Block an), dann certbot nochmal.
- Zertifikat schon vorhanden, aber nicht installiert: `certbot install
  --cert-name <domain>` reinstalliert ein bereits ausgestelltes Zertifikat,
  ohne ein neues zu beantragen (schont das Let's-Encrypt-Rate-Limit).
