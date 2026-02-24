# Technische Dokumentation: Bestimmung der Wolkenuntergrenze

**Modul:** IDSSE-M Cockpit  
**Betroffene Dateien:** `utils.js`, `weather.js`, `metricsConfig.js`  
**Stand:** Februar 2026  

---

## Übersicht

Die Bestimmung der Wolkenuntergrenze ist eine abgeleitete Metrik (`paramType: 'derived_pressure'`), die nicht direkt aus der API gelesen wird, sondern aus Druckstufen-Rohdaten berechnet wird. Das Verfahren läuft in vier aufeinanderfolgenden Schritten ab und liefert zwei unabhängige Ausgaben:

| Metrik | `summaryKey` | Bedeutung |
|---|---|---|
| **Tiefste Wolken (FEW/SCT)** | `cloudBase` | Niedrigste Wolkenschicht ab 1–2 Achtel (FEW) |
| **Ceiling (BKN/OVC)** | `cloudCeiling` | Niedrigste Schicht mit ≥ 5 Achtel (BKN) |

Beide Metriken durchlaufen identische Schritte 1–3. Die Unterscheidung erfolgt erst in Schritt 4.

---

## Eingangsdaten (API-Parameter)

Die folgenden Parameter werden pro Sampling-Punkt von der Open-Meteo Forecast-API angefordert. Die Druckstufen richten sich nach den in `metricsConfig.js` definierten `pressureLevels` (1000–200 hPa), gefiltert auf die Fähigkeiten des gewählten Modells:

| Parametergruppe | API-Felder |
|---|---|
| Geopotentielle Höhe | `geopotential_height_{p}hPa` |
| Temperatur | `temperature_{p}hPa` |
| Relative Feuchte | `relative_humidity_{p}hPa` |
| Wolkenbedeckung | `cloud_cover_{p}hPa` |
| Wind | `wind_speed_{p}hPa`, `wind_direction_{p}hPa` |
| Oberflächenwerte | `surface_pressure`, `temperature_2m`, `relative_humidity_2m`, `wind_speed_10m`, `wind_direction_10m`, `cloud_cover` |

> **Hinweis zu Modellunterschieden:** Nicht jedes Modell liefert alle Druckstufen. ICON-D2 hat z. B. 1000–200 hPa vollständig, ECMWF IFS hat keine 975/950/925/900 hPa. Fehlende Stufen werden automatisch aus den Berechnungen ausgeschlossen.

---

## Schritt 1 – Dynamische RH-Schwellenwerte (`analyzeCloudLayers`)

**Funktion:** `analyzeCloudLayers(weatherData)` in `utils.js`

Da die relative Feuchte (`rh`) allein kein zuverlässiges Wolkenkriterium ist (warme Luft bei 80% rh ist wolkenfrei, Eiswolken entstehen schon bei 65%), werden zunächst für jede Stunde der gesamten Vorhersage dynamische RH-Schwellenwerte berechnet.

### 1a – Druckstufen den Stockwerken zuordnen

Die tatsächlich vorhandenen Druckstufen werden aus den API-Daten gelesen (dynamisch, nicht hardcodiert) und anhand von Temperatur und Höhe einem von drei meteorologischen Stockwerken zugeordnet:

**Normalfall (Bodentemperatur > 0 °C):**

| Stockwerk | Kriterium |
|---|---|
| Unteres (`low`) | Temperatur auf dem Druckniveau > 0 °C |
| Mittleres (`mid`) | Temperatur auf dem Druckniveau zwischen −30 °C und 0 °C |
| Hohes (`high`) | Temperatur auf dem Druckniveau ≤ −30 °C |

**Sonderfall Kaltluft (Bodentemperatur ≤ 0 °C):**

| Stockwerk | Kriterium |
|---|---|
| Unteres (`low`) | Geopotentielle Höhe ≤ 2000 m |
| Mittleres (`mid`) | Höhe > 2000 m und Temperatur > −30 °C |
| Hohes (`high`) | Höhe > 2000 m und Temperatur ≤ −30 °C |

### 1b – RH-Schwelle pro Stockwerk berechnen

Für jedes Stockwerk wird die maximale Wolkenbedeckung (`cloud_cover_{p}hPa`) über alle zugehörigen Druckniveaus ermittelt. Der Schwellenwert richtet sich danach, ob signifikante Bewölkung vorhanden ist:

| Stockwerk | Bewölkung > 50 % | Bewölkung ≤ 50 % | Kein Level vorhanden |
|---|---|---|---|
| Unteres | 90 % | 75 % | 80 % (Fallback) |
| Mittleres | 85 % | 70 % | 80 % (Fallback) |
| Hohes | 65 % (fix) | 65 % (fix) | 80 % (Fallback) |

> **Hintergrund:** Der adaptive Schwellenwert verhindert, dass bei stark bewölkten Situationen die RH-Schwelle zu hoch angesetzt wird und Wolken übersehen werden. Modelle mit weniger Druckstufen profitieren vom moderaten Fallback von 80 % statt dem früheren konservativen Wert von 95 %.

**Ausgabe:** Array von `{ low, mid, high }` Schwellenwert-Objekten, eines pro Vorhersagestunde.

---

## Schritt 2 – Interpolation auf 50-m-Raster (`interpolateWeatherData`)

**Funktion:** `interpolateWeatherData(weatherData, sliderIndex, interpStep, baseHeight, heightUnit, currentThresholds)` in `utils.js`

Die API liefert Daten nur auf diskreten Druckniveaus (z. B. 1000, 925, 850 hPa), die typischerweise mehrere hundert Meter auseinanderliegen. Um die Wolkenbasis auf 50-m-Genauigkeit zu bestimmen, werden alle Variablen auf ein äquidistantes Höhenraster von **50 m AGL** interpoliert.

### 2a – Valide Druckniveaus bestimmen

Aus den Standarddruckstufen (`STANDARD_PRESSURE_LEVELS`) werden nur jene verwendet, für die **Höhe, Windgeschwindigkeit und Windrichtung** gleichzeitig vorhanden sind. Diese drei Parameter sind für die Bodeninterpolation (Schritt 2b) kritisch.

Für die **Wolkenbedeckung** gilt ein separater, weniger strenger Filter: Ein Niveau wird für die CC-Interpolation einbezogen, wenn Höhe **und** `cloud_cover` vorhanden sind – auch wenn Winddaten fehlen. So gehen keine Bewölkungsdaten verloren, nur weil ein Modell auf einem Niveau keinen Wind liefert.

### 2b – Bodennahe Schicht synthetisch auffüllen

Falls der Bodendruck (`surface_pressure`) höher ist als das niedrigste verfügbare Druckniveau (z. B. in Berglagen), wird die Schicht zwischen Geländeoberkante und dem untersten Druckniveau durch Interpolation aufgefüllt:

- **Druck:** Logarithmische Interpolation zwischen Bodendruck und unterstem Niveau
- **Temperatur / rh:** Lineare Interpolation zwischen 2-m-Wert und unterstem Niveau
- **Wind:** Logarithmische Interpolation der U/V-Komponenten (Windprofil-Annäherung)

### 2c – Wolkenbedeckung: API-Interpolation

Die `cloud_cover_{p}hPa`-Werte der API werden durch **lineare Interpolation** zwischen den tatsächlich vorhandenen CC-Druckniveaus auf jeden 50-m-Schritt übertragen. Außerhalb des Wertebereichs wird der jeweilige Randwert gehalten (Clamp). Das Ergebnis wird auf 0–100 % begrenzt.

> **Frühere Fehlerquelle (behoben):** Vor der aktuellen Version wurde die Wolkenbedeckung durch "nearest neighbor" (nächstgelegener Drucklevel) zugewiesen. Das führte dazu, dass im bodennahen Bereich stets der 1000-hPa-Wert verwendet wurde, unabhängig von der tatsächlichen Höhe.

### 2d – Wolkenbedeckung: RH-basierte Korrektur

Da NWP-Modelle den `cloud_cover`-Wert teils systematisch unterschätzen (bekannt z.B. für bodennahen Stratus in ICON), wird der API-Wert mit einem physikalisch abgeleiteten RH-Schätzwert kombiniert.

**Schritt 1 – Stockwerkabhängigen RH-Schwellenwert bestimmen**

Für jeden interpolierten Höhenpunkt wird der RH-Schwellenwert aus den in Schritt 1 berechneten `currentThresholds` gelesen, je nach Stockwerk (tief/mittel/hoch) und Temperatur:

| Stockwerk | Bewölkung > 50 % | Bewölkung ≤ 50 % |
|---|---|---|
| Unteres | 90 % | 75 % |
| Mittleres | 85 % | 70 % |
| Hohes | 65 % (fix) | 65 % (fix) |

**Schritt 2 – RH-basierten CC-Schätzwert berechnen**

Unterhalb der Schwelle ist die Luft zu trocken für stabile Kondensation → `cc_rh = 0`. Oberhalb der Schwelle steigt `cc_rh` linear bis auf 100 % bei vollständiger Sättigung:

```
cc_rh = max(0, (rh - rhThreshold) / (100 - rhThreshold) × 100)
```

Beispiele mit `rhThreshold = 75 %` (unteres Stockwerk, wenig Bewölkung):

| rh | cc_rh |
|---|---|
| 74 % | 0 % (unter Schwelle) |
| 80 % | 20 % (FEW) |
| 88 % | 52 % (SCT/BKN-Grenze) |
| 95 % | 80 % (BKN) |
| 100 % | 100 % (OVC) |

Die temperaturabhängige Schwelle berücksichtigt implizit die Phasenabhängigkeit der Kondensation: Eis (hohes Stockwerk) kondensiert bei niedrigerer relativer Feuchte als Wasser (unteres Stockwerk).

**Schritt 3 – Kombination mit API-Wert**

Das finale `cc` für jeden Höhenpunkt ist das **Maximum** aus API-Wert und RH-Schätzwert:

```
cc_final = max(cc_api, cc_rh)
```

- Wo die API zuverlässige Daten liefert, dominiert sie unverändert
- Wo die API 0 % meldet aber die RH auf Wolken hindeutet, springt `cc_rh` ein
- Kein harter Sprung, keine Überschreibung – stetige Funktion

Zur Nachvollziehbarkeit werden `cc_api` und `cc_rh` zusätzlich als Debugging-Felder im Datenpunkt gespeichert.

### 2d – Ausgabe

Ein Array von Datenpunkten, je einer pro 50-m-Schicht von 0 m AGL bis zur Obergrenze (höchstes verfügbares Druckniveau). Jeder Punkt enthält:

```
{
  height,        // Höhe ASL in Metern
  displayHeight, // Höhe AGL in Metern (oder Fuß, je nach heightUnit)
  pressure,      // Luftdruck (hPa)
  temp,          // Temperatur (°C)
  rh,            // Relative Feuchte (%)
  cc,            // Wolkenbedeckung final (%, max aus cc_api und cc_rh)
  cc_api,        // Wolkenbedeckung laut API (%, vor RH-Korrektur)
  cc_rh,         // RH-basierter Schätzwert (%, für Debugging)
  spd,           // Windgeschwindigkeit (km/h)
  dir,           // Windrichtung (°)
  dew            // Taupunkt (°C)
}
```

---

## Schritt 3 – Wolkenschichten identifizieren (`findCloudLayers`)

**Funktion:** `findCloudLayers(interpolatedData)` in `utils.js`

Das interpolierte 50-m-Profil wird von unten nach oben durchsucht. Jeder Punkt wird anhand seiner Wolkenbedeckung einer METAR-Kategorie zugeordnet:

| Bedeckung | Kategorie | Achtel | `isCeiling` |
|---|---|---|---|
| ≤ 5 % | SKC | 0 | — (wird übersprungen) |
| 6–25 % | FEW | 1–2 | `false` |
| 26–50 % | SCT | 3–4 | `false` |
| 51–87 % | BKN | 5–7 | `true` |
| > 87 % | OVC | 8 | `true` |

### Schichtlogik

Eine neue Schicht wird **nur gemeldet**, wenn ihre Kategorie höher als die zuletzt gemeldete ist (aufsteigende Reihenfolge: FEW → SCT → BKN → OVC). Das verhindert, dass eine einzelne durchgehende Wolkenschicht mehrfach gemeldet wird, wenn die Bedeckung über mehrere 50-m-Schritte leicht schwankt.

Maximal **drei Schichten** werden gemeldet (METAR-Standard).

Der erste Punkt (Index 0, Bodenniveau) wird übersprungen – dort steht der Gesamtbedeckungswert `cloud_cover`, nicht ein Druckniveauwert.

**Ausgabe:**
```javascript
[
  { cover: 'FEW', base: 350, isCeiling: false },
  { cover: 'BKN', base: 1200, isCeiling: true }
]
```

---

## Schritt 4 – Metriken ableiten (`calculateDerivedValue`)

**Funktion:** `calculateDerivedValue(metric, hourly, h, elevation)` in `weather.js`

Aus dem Layer-Array aus Schritt 3 werden die beiden Metriken abgeleitet:

### `cloudBase` – Tiefste Wolken (FEW/SCT/BKN/OVC)

Nimmt die **Basis des ersten Eintrags** im Layer-Array (= niedrigste gemeldete Schicht, unabhängig von der Kategorie).

```
Keine Layer vorhanden → 99999 m  (= SKC, wolkenfrei)
```

### `cloudCeiling` – Ceiling (BKN/OVC)

Filtert das Layer-Array auf Einträge mit `isCeiling === true` und nimmt die **Basis des ersten Treffers** (= niedrigstes Ceiling).

```
Kein BKN/OVC vorhanden → 99999 m  (= kein Ceiling, z.B. CAVOK oder nur FEW/SCT)
```

Der Wert 99999 m ist bewusst sehr hoch gewählt, damit er in einem `checkType: 'min'` niemals einen Alarm auslöst.

---

## Ampel-Logik und Grenzwerte

Beide Metriken verwenden `checkType: 'min'` – ein Alarm wird ausgelöst, wenn der berechnete Wert **unter** den konfigurierten Grenzwert fällt. Die Grenzwerte sind vollständig unabhängig voneinander:

| Metrik | `ruleName` | Alarm-Regel | Warn-Regel |
|---|---|---|---|
| `cloudBase` | `minCloudBase` | `minCloudBase_alarm` | `minCloudBase_warn` |
| `cloudCeiling` | `minCloudCeiling` | `minCloudCeiling_alarm` | `minCloudCeiling_warn` |

**Beispiel:** Alarm wenn Ceiling unter 300 m, Warnung wenn Wolkenbasis (FEW+) unter 500 m – beides unabhängig konfigurierbar.

Die Ausgabe erfolgt über `formatAltitude_FT`, d.h. in Metern (Metric-Modus) oder Fuß (Aviation-Modus, gerundet auf 100 ft).

---

## Bekannte Einschränkungen

**Modellabhängigkeit:** Die Qualität der Wolkenbasiserkennung hängt stark von der vertikalen Auflösung des gewählten Modells ab. ICON-D2 (2,2 km, viele Druckstufen) liefert deutlich präzisere Ergebnisse als ECMWF IFS (25 km, weniger Stufen im Untergeschoss). Bei Modellen mit sehr wenigen Tiefdruckstufen kann die tatsächliche Wolkenbasis um mehrere hundert Meter abweichen.

**Interpolationsgenauigkeit:** Das 50-m-Raster ist eine Annäherung. Die tatsächliche Wolkenbasis liegt irgendwo innerhalb des 50-m-Intervalls, in dem die Bedeckungsschwelle überschritten wird.

**Keine RH-basierte Wolkenerkennung:** Der `rhThreshold` aus Schritt 1 wird in `interpolateWeatherData` zwar berechnet, aber im aktuellen Stand nicht für die Wolkenerkennung ausgewertet (der Block ist vorhanden aber ohne Rückgabewert). Die Wolkenerkennung basiert ausschließlich auf den `cloud_cover_{p}hPa` Werten der API.

---

## Datenfluss (Zusammenfassung)

```
API-Rohdaten (Druckniveaus)
        │
        ▼
analyzeCloudLayers()
→ RH-Schwellenwerte pro Stunde { low, mid, high }
        │
        ▼
interpolateWeatherData()
→ 50-m-Profil mit interpoliertem cc-Wert pro Schicht
        │
        ▼
findCloudLayers()
→ Layer-Array: [ { cover, base, isCeiling }, ... ]
        │
        ├──► cloudBase:    layers[0].base          (niedrigste Wolke ab FEW)
        └──► cloudCeiling: ceilingLayers[0].base   (niedrigstes BKN/OVC)
```
