# Development Guidelines für Claude Code

**Best Practices für professionelle Software-Entwicklung mit KI-Unterstützung**

**Version:** 1.1  
**Erstellt:** Oktober 2025  
**Zuletzt aktualisiert:** 2025-10-17 17:00

---

## 1. Überblick und Zielsetzung

Dieses Dokument definiert verbindliche Entwicklungsprinzipien für die Arbeit mit Claude Code. Ziel ist es, eine wartbare, zuverlässige Codebasis zu schaffen und typische Probleme der KI-gestützten Entwicklung zu vermeiden.

### Grundprinzipien

- **Qualität vor Geschwindigkeit** – Funktionierende Software ist wichtiger als schnelle Ergebnisse
- **Wartbarkeit ist Pflicht** – Code wird öfter gelesen als geschrieben
- **Transparenz** – Jede Änderung muss nachvollziehbar sein
- **Schrittweises Vorgehen** – Kleine, verifizierbare Änderungen statt großer Umbauten

---

## 2. Kernprinzipien der Software-Entwicklung

### 2.1 KISS – Keep It Simple, Stupid

Einfache Lösungen sind fast immer besser als komplexe.

**Regeln:**
- Die einfachste Lösung wählen, die das Problem löst
- Keine "cleveren" Abstraktionen ohne konkreten Bedarf
- Keine Optimierungen "auf Vorrat"
- Keine zusätzlichen Features ohne explizite Anforderung

**Beispiel:**
```python
# ❌ FALSCH: Überkompliziert
def get_user(user_id):
    cache = Cache()
    if cache.has(user_id):
        return cache.get(user_id)
    user = db.query().filter().first()
    cache.set(user_id, user)
    return user

# ✅ RICHTIG: Einfach und direkt (Caching erst wenn nötig)
def get_user(user_id):
    return db.query(User).filter(User.id == user_id).first()
```

### 2.2 Separation of Concerns

Jede Komponente hat genau eine Verantwortung.

**Regeln:**
- Ein Modul/Klasse = eine klare Aufgabe
- Keine Vermischung von Business-Logik und Präsentation
- Keine Datenbank-Queries in View-Code
- Keine UI-Logik in Datenmodellen

**Beispiel:**
```python
# ❌ FALSCH: Vermischung von Verantwortlichkeiten
class User:
    def save(self):
        db.session.add(self)
        db.session.commit()
        send_email(self.email, "Welcome!")  # Email-Logik gehört hier nicht hin!
        log_to_analytics(self.id)            # Analytics gehört hier nicht hin!

# ✅ RICHTIG: Getrennte Verantwortlichkeiten
class User:
    def save(self):
        db.session.add(self)
        db.session.commit()

class UserService:
    def register_user(self, user_data):
        user = User(**user_data)
        user.save()
        EmailService.send_welcome_email(user)
        AnalyticsService.track_registration(user)
```

### 2.3 Fail-Fast-Prinzip

**Fehler müssen sofort sichtbar werden, nicht durch Fallbacks versteckt.**

Das ist eines der kritischsten Prinzipien bei KI-gestützter Entwicklung. KI-Tools neigen dazu, "hilfreich" sein zu wollen und bauen oft ungefragt Fallbacks ein. Das führt dazu, dass Fehler verschleiert werden und man denkt, etwas funktioniert, obwohl nur der Fallback greift.

**Regeln:**
- **KEINE ungefragten Fallbacks**
- **KEINE stillen Fehler** – Wenn etwas fehlschlägt, muss es laut fehlschlagen
- **KEINE Default-Werte ohne explizite Anforderung**
- **KEINE try-except-Blöcke, die Fehler verschlucken**
- Fehler sofort an der Quelle erkennen, nicht später debuggen müssen

**Beispiele:**

```python
# ❌ FALSCH: Versteckter Fehler durch Fallback
def load_config(path):
    try:
        with open(path) as f:
            return json.load(f)
    except FileNotFoundError:
        return {}  # Stille Rückkehr zu leerem Dict!

# ✅ RICHTIG: Fehler wird explizit
def load_config(path):
    with open(path) as f:  # Lässt FileNotFoundError durchschlagen
        return json.load(f)

# Oder wenn Fallback gewünscht ist, dann EXPLIZIT:
def load_config(path, fallback=None):
    if not os.path.exists(path):
        if fallback is None:
            raise FileNotFoundError(f"Config file not found: {path}")
        return fallback
    with open(path) as f:
        return json.load(f)
```

```python
# ❌ FALSCH: API-Call mit stillem Fallback
def fetch_user_data(user_id):
    try:
        response = api.get(f"/users/{user_id}")
        return response.json()
    except Exception:
        return {"id": user_id, "name": "Unknown"}  # Täuscht Erfolg vor!

# ✅ RICHTIG: Fehler schlägt durch
def fetch_user_data(user_id):
    response = api.get(f"/users/{user_id}")
    response.raise_for_status()  # Wirft Exception bei Fehler
    return response.json()
```

```javascript
// ❌ FALSCH: Versteckte null-Werte
function getUserEmail(user) {
    return user?.profile?.email || "noreply@example.com";  // Täuscht Email vor!
}

// ✅ RICHTIG: Explizite Validierung
function getUserEmail(user) {
    if (!user?.profile?.email) {
        throw new Error("User has no email address");
    }
    return user.profile.email;
}
```

**Wann sind Fallbacks erlaubt?**

Nur wenn sie **explizit gefordert** wurden und **dokumentiert** sind:

```python
# ✅ AKZEPTABEL: Explizit dokumentierter Fallback
def get_setting(key, default=None):
    """
    Lädt eine Einstellung aus der Konfiguration.
    
    Args:
        key: Der Einstellungsschlüssel
        default: Optionaler Fallback-Wert, wenn Einstellung nicht existiert
        
    Returns:
        Den Einstellungswert oder default
        
    Raises:
        KeyError: Wenn key nicht existiert und kein default angegeben wurde
    """
    if key not in settings:
        if default is None:
            raise KeyError(f"Setting '{key}' not found and no default provided")
        return default
    return settings[key]
```

---

## 3. Arbeitsweise mit Claude Code

### 3.1 Keine ungefragten Erweiterungen

**Claude darf den Auftrag NICHT überschreiten.**

**Verboten:**
- Zusätzliche Features einbauen, die nicht gefordert wurden
- "Verbesserungen" ohne Rücksprache
- Refactoring von funktionierendem Code, das nicht angefragt wurde
- Optimierungen, die nicht gefordert wurden
- Format-Änderungen ohne Anfrage (z.B. Word statt Markdown)

**Beispiel:**
```
Auftrag: "Fixe den Bug in der Login-Funktion"

❌ FALSCH: 
- Bug fixen
- Dabei gleich die ganze Authentifizierung umbauen
- Ein neues Caching-System hinzufügen
- Die Passwort-Validierung "verbessern"

✅ RICHTIG:
- Nur den Bug fixen
- Wenn weitere Probleme gesehen werden: MELDEN, aber nicht fixen
```

**Wenn zusätzliche Verbesserungen sinnvoll erscheinen:**
1. Den Auftrag zunächst EXAKT ausführen
2. DANACH separate Vorschläge für Verbesserungen machen
3. Auf Freigabe warten

### 3.2 Erst planen, dann umsetzen

**Workflow für neue Features oder größere Änderungen:**

1. **Analyse-Phase**
   - Anforderungen verstehen
   - Betroffene Dateien identifizieren
   - Abhängigkeiten prüfen
   
2. **Planungs-Phase**
   - Schritt-für-Schritt-Plan erstellen
   - Plan vorlegen und Freigabe einholen
   - Offene Fragen klären

3. **Implementierungs-Phase**
   - Plan systematisch abarbeiten
   - Nach jedem Schritt testen
   - Bei Problemen: Plan anpassen, nicht improvisieren

4. **Verifikations-Phase**
   - Alle Tests laufen durch
   - Keine ungewollten Nebeneffekte
   - Code-Review durchführen

**Beispiel für guten Plan:**
```markdown
## Feature: User-Export als CSV

### Betroffene Dateien:
- `src/api/users.py` (neue Route)
- `src/services/export.py` (neue Datei)
- `tests/test_export.py` (neue Datei)

### Implementierungsschritte:
1. Export-Service erstellen mit CSV-Generierung
2. Tests für Export-Service schreiben
3. API-Route hinzufügen
4. Tests für API-Route schreiben
5. Integration testen

### Offene Fragen:
- Sollen alle User-Felder exportiert werden?
- Welches CSV-Format (Delimiter, Encoding)?
- Authentifizierung erforderlich?
```

### 3.3 Konzept vorlegen bei wesentlichen Änderungen

**Wann ist ein Konzept erforderlich?**

- Änderungen an der Architektur
- Neue externe Abhängigkeiten
- Refactoring von mehr als 2-3 Dateien
- Änderungen an der Datenbank-Struktur
- Änderungen an öffentlichen APIs
- Performance-kritische Optimierungen

**Das Konzept muss enthalten:**

1. **Problem-Beschreibung**
   - Was soll gelöst werden?
   - Warum ist die Änderung notwendig?

2. **Lösungsansatz**
   - Wie soll das Problem gelöst werden?
   - Welche Alternativen wurden betrachtet?
   - Warum diese Lösung?

3. **Impact-Analyse**
   - Welche Komponenten sind betroffen?
   - Gibt es Breaking Changes?
   - Welche Risiken gibt es?

4. **Migrations-Plan**
   - Wie kommen wir von A nach B?
   - Können wir inkrementell migrieren?
   - Gibt es einen Rollback-Plan?

**Erst nach Freigabe des Konzepts wird implementiert.**

### 3.4 Datei-Backup bei Überarbeitung – Operative Namen bleiben stabil

**⚠️ KRITISCHE REGEL: Operative Dateinamen dürfen bei Überarbeitung NICHT geändert werden!**

#### Das Problem

Wenn eine bestehende Datei überarbeitet wird und dabei umbenannt wird, entstehen massive Probleme:

```python
# Ursprüngliche Datei
correction.py

# ❌ FALSCH: Claude benennt um
correction-voice.py  # Neue Version
```

**Folge-Probleme:**
- Alle Imports brechen: `from utils import correction` → funktioniert nicht mehr
- Git zeigt "Datei gelöscht" + "Datei neu" → verliert History
- Merge-Konflikte in anderen Branches
- CI/CD-Pipelines brechen
- Dokumentation muss angepasst werden
- Deployment-Skripte müssen geändert werden

#### Die Lösung: Backup vor Änderung

**Operative Dateinamen bleiben IMMER gleich. Stattdessen: Backup mit beschreibendem Namen.**

**Naming Convention für Backups:**
```
<original-filename>_backup_before-<description>.<ext>
```

**Beispiele:**
- `correction.py` → `correction_backup_before-voice-feature.py`
- `user_service.py` → `user_service_backup_before-refactoring.py`
- `api.js` → `api_backup_before-rate-limiting.js`
- `config.yaml` → `config_backup_before-prod-settings.yaml`

#### Workflow bei Datei-Überarbeitung

```bash
# 1. Vor Änderung: Backup erstellen
cp src/utils/correction.py src/utils/correction_backup_before-voice-feature.py

# 2. Original-Datei bearbeiten (Name bleibt correction.py!)
vim src/utils/correction.py
# → Voice-Feature einbauen

# 3. Tests laufen lassen
pytest tests/test_correction.py

# 4. Beides committen
git add src/utils/correction.py
git add src/utils/correction_backup_before-voice-feature.py
git commit -m "feat(correction): Add voice feature

- Added voice input/output
- Backup created before changes
- All tests passing"
```

#### Beispiel: Größere Refactoring

```bash
# Mehrere Dateien werden überarbeitet
cp src/models/user.py src/models/user_backup_before-repository-pattern.py
cp src/api/users.py src/api/users_backup_before-repository-pattern.py
cp src/services/user_service.py src/services/user_service_backup_before-repository-pattern.py

# Dann alle Original-Dateien überarbeiten (Namen bleiben!)
# Nach Fertigstellung: Alle committen
git add src/models/user.py src/models/user_backup_before-repository-pattern.py
git add src/api/users.py src/api/users_backup_before-repository-pattern.py
git add src/services/user_service.py src/services/user_service_backup_before-repository-pattern.py
git commit -m "refactor: Implement repository pattern"
```

#### Wann werden Backups erstellt?

**Backup IMMER bei:**
- Refactoring bestehender Dateien
- Größeren Feature-Additions zu bestehenden Dateien
- Architektur-Änderungen
- Risiko-reichen Änderungen

**Backup OPTIONAL bei:**
- Kleineren Bug-Fixes (< 10 Zeilen)
- Rein kosmetischen Änderungen
- Kommentar-Updates

**Im Zweifelsfall: Backup erstellen!**

#### Backup-Dateien in Git?

**Ja, Backups committen!**

Warum?
- Dokumentiert den Zustand vor der Änderung
- Ermöglicht einfaches Zurückrollen
- Zeigt Evolution der Datei
- Bei Problemen: Schneller Vergleich möglich

**Wann Backups aufräumen:**
```bash
# Nach erfolgreichem Release und wenn sicher, dass Änderung funktioniert
git rm src/utils/correction_backup_before-voice-feature.py
git commit -m "chore: Remove backup after successful voice feature release"
```

Oder Backups im Verzeichnis `backups/` sammeln:
```
src/
├── utils/
│   ├── correction.py
│   └── backups/
│       ├── correction_backup_before-voice-feature.py
│       └── correction_backup_before-refactoring.py
```

#### Claude Code Anweisung

**In CLAUDE.md explizit festhalten:**

```markdown
## Datei-Änderungen

**KRITISCH:** Operative Dateinamen NIEMALS ändern!

Vor Überarbeitung bestehender Dateien:
1. Backup erstellen: `cp file.py file_backup_before-<feature>.py`
2. Original-Datei bearbeiten (Name bleibt!)
3. Backup und Änderungen zusammen committen

Format: `filename_backup_before-<description>.ext`
```

#### Zusammenfassung

✅ **RICHTIG:**
- Original-Dateiname bleibt stabil
- Backup mit beschreibendem Namen
- Imports funktionieren weiter
- Git-History sauber

❌ **FALSCH:**
- Datei umbenennen bei Änderungen
- Neue Datei mit neuem Namen erstellen
- "Verbesserte" Dateinamen

---

## 4. Projekt-Struktur und Dokumentation

Eine durchdachte Projektstruktur ist essentiell für langfristige Wartbarkeit. **Besonders wichtig ist das Dokumentationssystem mit Live-Development-Dokumenten.**

### 4.1 Standard-Verzeichnisstruktur

```
project-root/
├── README.md                                    # Projektübersicht
├── CLAUDE.md                                    # Claude Code-spezifische Anweisungen
├── CHANGELOG_2025-10-17-1630.md                 # ⭐ Versionshistorie mit Timestamp!
├── LICENSE                                      # Lizenz
├── .gitignore                                  # Git-Ausschlüsse
├── requirements.txt                            # Python-Dependencies
├── package.json                                # Node-Dependencies
│
├── PROJECT-NAME_initial-development_2025-10-17-1430.md  # ⭐ AKTIVES Development Doc (Root!)
├── FEATURE-export_development_2025-10-18-0920.md        # ⭐ AKTIVES Feature Doc (Root!)
│
├── src/                                        # Produktionscode
│   ├── api/                                   # API-Endpoints
│   ├── models/                                # Datenmodelle
│   ├── services/                              # Business-Logik
│   ├── utils/                                 # Hilfsfunktionen
│   └── config/                                # Konfiguration
│
├── tests/                                      # Tests
│   ├── unit/                                  # Unit-Tests
│   ├── integration/                           # Integrationstests
│   └── fixtures/                              # Test-Daten
│
├── docs/                                       # ⭐ WICHTIG: Zentrale Dokumentation
│   ├── DEVELOPMENT-GUIDELINES.md              # Diese Guidelines (!)
│   │
│   ├── lessons-learned/                       # Schwierige Probleme & Lösungen
│   │   ├── dependency-conflicts.md            # Z.B. Dependency-Hell-Fixes
│   │   ├── performance-optimizations.md       # Performance-Learnings
│   │   └── deployment-issues.md               # Deployment-Probleme
│   │
│   ├── archive/                               # ⭐ Abgeschlossene Development Docs
│   │   ├── PROJECT-NAME_initial-development_2025-10-15-1000.md
│   │   ├── PROJECT-NAME_initial-development_2025-10-16-1545.md (superseded)
│   │   └── FEATURE-login_development_2025-10-17-0830.md
│   │
│   ├── api/                                   # API-Dokumentation
│   ├── architecture/                          # Architektur-Diagramme
│   └── guides/                                # Anleitungen
│
├── scripts/                                    # Build- und Deployment-Skripte
├── tools/                                      # Entwickler-Tools
└── data/                                       # Daten (nicht in Git)
    ├── raw/                                   # Rohdaten
    └── processed/                             # Verarbeitete Daten
```

### 4.2 Development Documentation System

**⭐ KRITISCH: Dieses System ist PFLICHT für jede Entwicklung!**

#### Das Konzept

Jede nennenswerte Entwicklung braucht ein **Live-Development-Document** im Root-Verzeichnis. Dieses Dokument ist das "Logbuch" der aktuellen Entwicklung und wird kontinuierlich aktualisiert.

**Warum ist das so wichtig?**
- Man weiß immer, wo man gerade steht
- Bei Unterbrechungen kann man sofort weitermachen
- Entscheidungen und deren Begründungen sind dokumentiert
- Claude Code kann sich am Dokument orientieren
- Nach Abschluss ist die Historie komplett dokumentiert

#### Naming Convention

```
<PROJECT-NAME>_<type>_<YYYY-MM-DD-HHMM>.md
```

**Beispiele:**
- `user-management_initial-development_2025-10-17-1430.md`
- `user-management_feature-export_2025-10-18-0920.md`
- `user-management_refactoring-database_2025-10-19-1105.md`
- `user-management_bugfix-auth_2025-10-20-1630.md`

**Types:**
- `initial-development` – Erste Projektentwicklung
- `feature-<name>` – Neues Feature
- `refactoring-<area>` – Refactoring
- `bugfix-<issue>` – Bug-Fix
- `optimization-<aspect>` – Performance/Code-Optimierung

#### Timestamp-Regeln

**Format:** `YYYY-MM-DD-HHMM` (Jahr-Monat-Tag-Stunde-Minute)

**Wann wird der Timestamp aktualisiert?**
- Bei JEDER inhaltlichen Änderung am Dokument
- Wenn ein Schritt abgeschlossen wurde
- Wenn der Plan geändert wurde
- Wenn neue Erkenntnisse hinzugefügt wurden

**⚠️ WICHTIG:** Timestamp wird aktualisiert **BEVOR** committet wird!

**Workflow:**
```bash
# 1. Schritt im Development Doc abschließen
vim PROJECT-NAME_initial-development_2025-10-17-1430.md
# → Status von Schritt 3 auf "✅ Abgeschlossen" setzen

# 2. Dokument mit neuem Timestamp speichern
mv PROJECT-NAME_initial-development_2025-10-17-1430.md \
   PROJECT-NAME_initial-development_2025-10-17-1545.md

# 3. Alte Version löschen (neue Version ersetzt alte)
# Die alte bleibt in Git-History, wenn nötig

# 4. Erst JETZT committen
git add PROJECT-NAME_initial-development_2025-10-17-1545.md
git commit -m "docs: Complete step 3 of initial development"
```

#### Template: Initial Development Document

```markdown
# PROJECT-NAME - Initial Development

**Typ:** Initial Development  
**Erstellt:** 2025-10-17 14:30  
**Zuletzt aktualisiert:** 2025-10-17 14:30  
**Status:** 🔄 In Arbeit

---

## Projektziel

[Kurze Beschreibung: Was soll das Projekt am Ende können?]

Beispiel:
> Eine REST API für User-Management mit Authentifizierung, die User registrieren,
> einloggen und ihre Profile verwalten können.

---

## Vorentscheidungen

### Technologie-Stack
- **Backend:** Python 3.11 + Flask
- **Datenbank:** PostgreSQL 15
- **ORM:** SQLAlchemy
- **Tests:** pytest
- **Warum?** [Begründung für diese Wahl]

### Architektur-Entscheidungen
- Repository-Pattern für Datenbank-Zugriff
- Service-Layer für Business-Logik
- JWT für Authentifizierung

### Infrastruktur
- Deployment: Docker + Docker Compose
- CI/CD: GitHub Actions

---

## Implementierungsplan

### Phase 1: Setup ✅
- [✅] Repository initialisieren
- [✅] Projekt-Struktur anlegen
- [✅] Dependencies installieren
- [✅] Development-Environment aufsetzen
- [✅] Git-Workflow definieren

**Abgeschlossen:** 2025-10-17 15:00  
**Notizen:** PostgreSQL läuft in Docker, lokales Dev-Setup funktioniert

---

### Phase 2: Database Layer 🔄
- [✅] SQLAlchemy Setup
- [✅] User-Model definieren
- [⏳] Migration-System aufsetzen (in progress)
- [⏸️] Repository-Pattern implementieren (waiting)
- [ ] Tests für Repository schreiben

**Aktueller Schritt:** Migration-System (Alembic)  
**Gestartet:** 2025-10-17 15:30  
**Notizen:** 
- Alembic initialisiert
- Erste Migration für User-Tabelle erstellt
- Problem: Foreign Key Constraints → siehe docs/lessons-learned/database-migrations.md

---

### Phase 3: API Endpoints ⏸️
- [ ] Flask-Blueprints Setup
- [ ] POST /auth/register
- [ ] POST /auth/login
- [ ] GET /users/me
- [ ] PUT /users/me
- [ ] Tests für alle Endpoints

**Status:** Wartet auf Phase 2

---

### Phase 4: Authentication ⏸️
- [ ] JWT Token-Generierung
- [ ] Token-Validierung Middleware
- [ ] Refresh-Token-Mechanismus
- [ ] Tests für Auth-Flow

**Status:** Wartet auf Phase 3

---

### Phase 5: Testing & Refinement ⏸️
- [ ] Integration-Tests
- [ ] Code-Coverage prüfen (Ziel: >80%)
- [ ] Error-Handling verfeinern
- [ ] API-Dokumentation (OpenAPI)

**Status:** Wartet auf Phase 4

---

## Entscheidungs-Log

### 2025-10-17 14:30 - Initial Plan
- Entschieden für Flask statt FastAPI wegen Team-Erfahrung
- PostgreSQL wegen besserer JSON-Support als MySQL

### 2025-10-17 15:45 - Migration zu Alembic
- **Problem:** SQLAlchemy create_all() nicht gut für Production
- **Lösung:** Alembic für Migrations
- **Impact:** Zusätzlicher Setup-Aufwand, aber sauberere Migrations

---

## Probleme & Lösungen

### Problem: Alembic Foreign Key Constraints
**Zeitpunkt:** 2025-10-17 16:00  
**Beschreibung:** Alembic generiert keine Foreign Keys automatisch  
**Lösung:** Dokumentiert in `docs/lessons-learned/database-migrations.md`  
**Impact:** 30 Minuten Debugging

---

## Nächste Schritte

1. ⏳ **Aktuell:** Alembic-Migration abschließen
2. Repository-Pattern implementieren
3. Tests für Repository schreiben
4. Mit API-Endpoints starten

---

## Zeitaufwand

- **Phase 1:** 2 Stunden (Setup)
- **Phase 2:** 1.5 Stunden (in progress)
- **Geschätzt gesamt:** ~12-15 Stunden

---

## Referenzen

- CLAUDE.md: Projekt-spezifische Regeln
- docs/architecture/database-schema.md: Schema-Diagramm
- docs/lessons-learned/database-migrations.md: Migration-Probleme
```

#### Template: Feature Development Document

```markdown
# FEATURE: User Export als CSV

**Typ:** Feature Development  
**Erstellt:** 2025-10-18 09:20  
**Zuletzt aktualisiert:** 2025-10-18 09:20  
**Status:** 🔄 In Arbeit  
**Basis:** main branch @ commit abc123

---

## Feature-Beschreibung

Administratoren sollen alle User-Daten als CSV-Datei exportieren können.

### Anforderungen
- Export aller User mit allen Feldern
- Format: UTF-8 CSV mit Header
- Nur für Admins verfügbar
- Performance: Sollte mit 100k+ Users funktionieren

### Out of Scope
- Excel-Export
- Filterung/Selektion von Feldern
- Zeitgesteuerte Exports

---

## Technische Entscheidungen

### Ansatz
- Streaming CSV (nicht alles im Memory)
- Python csv-Modul
- Chunk-Size: 1000 User pro Iteration

### API Design
```
GET /api/admin/users/export
Authorization: Bearer <admin-token>
Response: text/csv
```

### Warum so?
- Streaming → Skaliert auf beliebig viele User
- Standard-CSV → Universell kompatibel

---

## Implementierungsplan

### Schritt 1: Export-Service ✅
- [✅] Service-Klasse erstellen
- [✅] Streaming-Logik implementieren
- [✅] CSV-Header definieren

**Abgeschlossen:** 2025-10-18 10:15  
**Code:** `src/services/user_export.py`

---

### Schritt 2: Tests für Service 🔄
- [✅] Test mit 0 Users
- [⏳] Test mit 100 Users (in progress)
- [ ] Test mit 10k Users (Performance)
- [ ] Test CSV-Format Validierung

**Aktueller Schritt:** Test mit 100 Users  
**Gestartet:** 2025-10-18 10:20

---

### Schritt 3: API-Endpoint ⏸️
- [ ] Route erstellen
- [ ] Admin-Check Middleware
- [ ] Error-Handling
- [ ] Response-Headers (Content-Type, etc.)

**Status:** Wartet auf Schritt 2

---

### Schritt 4: Integration Tests ⏸️
- [ ] End-to-End Test Export-Flow
- [ ] Test mit echtem Admin-User
- [ ] Test ohne Admin-Rechte (should fail)

**Status:** Wartet auf Schritt 3

---

### Schritt 5: Dokumentation ⏸️
- [ ] API-Docs updaten
- [ ] README mit Beispiel
- [ ] CHANGELOG.md Entry

**Status:** Wartet auf Schritt 4

---

## Änderungen am Plan

### 2025-10-18 11:00 - Performance-Überlegung
- **Original:** Alles in Memory laden
- **Neu:** Streaming-Ansatz
- **Grund:** Skaliert besser, funktioniert auch mit 100k+ Users
- **Impact:** Service neu schreiben, aber besseres Ergebnis

---

## Offene Fragen

- [✅] ~~Welche Felder exportieren?~~ → Alle (geklärt 2025-10-18 09:30)
- [⏳] Sollen Passwort-Hashes exportiert werden? → Warte auf Feedback
- [ ] Brauchen wir Logging für jeden Export?

---

## Zeitaufwand

- **Schritt 1:** 45 Minuten
- **Schritt 2:** 30 Minuten (in progress)
- **Geschätzt gesamt:** 3-4 Stunden
```

#### Workflow: Development Document Lifecycle

```
1. NEUE ENTWICKLUNG STARTEN
   ├─> Development Document im Root anlegen
   ├─> Initial-Timestamp setzen
   ├─> Plan mit allen Schritten erstellen
   └─> Mit erster Phase beginnen

2. WÄHREND ENTWICKLUNG (kontinuierlich)
   ├─> Nach jedem abgeschlossenen Schritt
   │   ├─> Status auf ✅ setzen
   │   ├─> Notizen hinzufügen
   │   ├─> Neuen Timestamp setzen
   │   └─> Dokument mit neuem Namen speichern
   │
   ├─> Bei Planänderungen
   │   ├─> "Änderungen am Plan" dokumentieren
   │   ├─> Neuen Timestamp setzen
   │   └─> Alten Plan durchstreichen (~~text~~)
   │
   └─> Bei Problemen/Learnings
       ├─> In "Probleme & Lösungen" dokumentieren
       ├─> Optional: Separate Datei in docs/lessons-learned/
       └─> Timestamp aktualisieren

3. ENTWICKLUNG ABGESCHLOSSEN
   ├─> Status auf ✅ Abgeschlossen setzen
   ├─> Final-Timestamp setzen
   ├─> Dokument nach docs/archive/ verschieben
   └─> README/CHANGELOG aktualisieren

4. NÄCHSTES FEATURE STARTEN
   └─> Neues Development Document im Root anlegen
```

#### Beispiel: Kontinuierliche Updates

```bash
# Morgen 09:00 - Feature starten
touch user-management_feature-export_2025-10-18-0900.md
# → Plan erstellen, erste Schritte definieren

# 10:15 - Schritt 1 fertig
vim user-management_feature-export_2025-10-18-0900.md
# → Status aktualisieren
mv user-management_feature-export_2025-10-18-0900.md \
   user-management_feature-export_2025-10-18-1015.md

# 11:30 - Plan geändert (Performance-Überlegung)
vim user-management_feature-export_2025-10-18-1015.md
# → "Änderungen am Plan" Abschnitt hinzufügen
mv user-management_feature-export_2025-10-18-1015.md \
   user-management_feature-export_2025-10-18-1130.md

# 14:00 - Schritt 2 fertig
vim user-management_feature-export_2025-10-18-1130.md
mv user-management_feature-export_2025-10-18-1130.md \
   user-management_feature-export_2025-10-18-1400.md

# Nachmittag - Feature komplett fertig
vim user-management_feature-export_2025-10-18-1400.md
# → Status: ✅ Abgeschlossen
mv user-management_feature-export_2025-10-18-1400.md \
   docs/archive/user-management_feature-export_2025-10-18-1630.md
```

### 4.3 docs/lessons-learned/ – Schwierige Probleme dokumentieren

**Zweck:** Probleme, die viel Zeit gekostet haben, dokumentieren, damit sie nicht nochmal auftreten.

**Beispiele für Inhalte:**
- Dependency-Konflikte und deren Lösung
- Performance-Probleme und Optimierungen
- Deployment-Issues
- Schwierige Debugging-Sessions
- Workarounds für Library-Bugs

**Template:**

```markdown
# Alembic Foreign Key Constraints Problem

**Datum:** 2025-10-17  
**Zeit investiert:** 30 Minuten  
**Kontext:** Initial Development, Database Migrations

---

## Problem

Alembic auto-generiert keine Foreign Key Constraints, wenn man `create_foreignkey=True` nicht explizit setzt.

### Symptom
```python
# Migration generiert nur:
sa.Column('user_id', sa.Integer())

# Aber keine Foreign Key Constraint!
```

### Impact
- Tests schlugen fehl
- Referenzielle Integrität nicht gegeben

---

## Root Cause

Alembic's `autogenerate` erkennt Foreign Keys nur, wenn:
1. Im Model mit `ForeignKey()` definiert
2. In alembic.ini compare_type = True

Unsere Config hatte compare_type = False.

---

## Lösung

**In alembic.ini:**
```ini
[alembic]
compare_type = True
compare_server_default = True
```

**Migration neu generieren:**
```bash
alembic revision --autogenerate -m "Add foreign keys"
```

---

## Verification

```sql
-- Prüfen ob FK existiert:
SELECT constraint_name 
FROM information_schema.table_constraints 
WHERE table_name='posts' AND constraint_type='FOREIGN KEY';
```

---

## Learnings

- ✅ Immer compare_type = True in Alembic
- ✅ Foreign Keys explizit testen
- ✅ SQLAlchemy Models mit relationship() UND ForeignKey()

---

## Referenzen

- Alembic Docs: https://alembic.sqlalchemy.org/en/latest/autogenerate.html
- Stack Overflow: [Link zur Lösung]
```

### 4.2 CLAUDE.md – Das Gedächtnis des Projekts

**Die wichtigste Datei für Claude Code!**

`CLAUDE.md` wird automatisch von Claude Code gelesen und sollte alle projektspezifischen Regeln enthalten:

```markdown
# CLAUDE.md

## Projekt-Kontext
Dies ist eine Flask-basierte REST API für User-Management.

## Bash-Befehle
- `make test` - Alle Tests ausführen
- `make lint` - Code-Style prüfen
- `make run` - Development-Server starten
- `python -m pytest tests/unit` - Nur Unit-Tests

## Code-Style
- Python: PEP 8, max. 88 Zeichen pro Zeile (Black-Standard)
- Imports: stdlib, third-party, local (durch Leerzeilen getrennt)
- Type-Hints sind Pflicht für alle Funktionen
- Docstrings im Google-Style

## Workflow-Regeln
- **KRITISCH**: Vor jeder Änderung Tests laufen lassen
- Bei Änderungen an Models: Migration erstellen
- Nie direkt auf `main` pushen, immer Feature-Branch
- Commit-Messages: "type(scope): description" (Conventional Commits)

## Architektur-Patterns
- Services für Business-Logik (keine Logik in Routes)
- Models sind nur Datenstrukturen (keine Business-Logik)
- Dependency Injection über Flask Extensions

## Testing-Anforderungen
- Neue Features brauchen Tests
- Test-Coverage muss über 80% bleiben
- Fixtures in `tests/fixtures/` ablegen

## Häufige Fehler zu vermeiden
- ❌ Keine hardcoded Secrets (immer environment variables)
- ❌ Keine SQL-Queries in Routes (nur in Models/Repositories)
- ❌ Keine synchronen HTTP-Calls in Request-Handler (async verwenden)
```

**Wichtig:** Wenn Claude Fehler macht, die CLAUDE.md aktualisieren, damit derselbe Fehler nicht wieder passiert!

### 4.3 CHANGELOG – Versionshistorie mit Timestamp

**Die CHANGELOG-Datei im Root dokumentiert alle wesentlichen Änderungen am Projekt.**

**Format:** `CHANGELOG_YYYY-MM-DD-HHMM.md`

**Wann aktualisieren:**
- Nach jedem Release/Tag
- Nach Major Features
- Nach Breaking Changes
- Bei wichtigen Bug-Fixes

**Workflow:**
```bash
# CHANGELOG aktualisieren
vim CHANGELOG_2025-10-17-1630.md
# → Neue Einträge hinzufügen

# Mit neuem Timestamp speichern
mv CHANGELOG_2025-10-17-1630.md CHANGELOG_2025-10-17-1645.md

# Committen
git add CHANGELOG_2025-10-17-1645.md
git commit -m "docs: Update CHANGELOG for v1.2.0"
```

**Template:**

```markdown
# Changelog

Alle wichtigen Änderungen an diesem Projekt werden in dieser Datei dokumentiert.

Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.0.0/).

**Zuletzt aktualisiert:** 2025-10-17 16:45

---

## [Unreleased]

### Added
- Neue Features, die noch nicht released sind

### Changed
- Änderungen an bestehenden Features

### Deprecated
- Features, die bald entfernt werden

### Removed
- Entfernte Features

### Fixed
- Bug-Fixes

### Security
- Sicherheits-Fixes

---

## [1.2.0] - 2025-10-18

### Added
- User-Export als CSV-Feature
- Admin-Dashboard

### Changed
- Login-Flow optimiert (30% schneller)

### Fixed
- Bug #123: Session-Timeout korrigiert
- Speicherleck in Export-Funktion behoben

---

## [1.1.0] - 2025-10-15

### Added
- Email-Benachrichtigungen
- Password-Reset-Funktion

### Changed
- Datenbank-Schema optimiert

---

## [1.0.0] - 2025-10-10

### Added
- Initial Release
- User-Registration
- User-Login
- Profile-Management
```

**Kategorien:**
- **Added** – Neue Features
- **Changed** – Änderungen an existierenden Features
- **Deprecated** – Bald zu entfernende Features
- **Removed** – Entfernte Features
- **Fixed** – Bug-Fixes
- **Security** – Sicherheits-relevante Änderungen

### 4.4 docs/lessons-learned/ – Schwierige Probleme dokumentieren

**Zweck:** Probleme, die viel Zeit gekostet haben, dokumentieren, damit sie nicht nochmal auftreten.

**Beispiele für Inhalte:**
- Dependency-Konflikte und deren Lösung
- Performance-Probleme und Optimierungen
- Deployment-Issues
- Schwierige Debugging-Sessions
- Workarounds für Library-Bugs

**Template:** Siehe Abschnitt 4.2 im Full-Document für vollständiges lessons-learned Template.

---

## 5. Version Control mit Git

### 5.1 Commit-Strategie

**Kleine, atomare Commits**

Jeder Commit sollte:
- Genau eine logische Änderung enthalten
- Funktionierende Tests haben
- Eine klare Commit-Message haben

```bash
# ❌ FALSCH: Alles in einem Commit
git add .
git commit -m "verschiedene fixes"

# ✅ RICHTIG: Separate Commits für separate Änderungen
git add src/api/users.py tests/test_users.py
git commit -m "fix(api): Korrigiere User-Validierung"

git add src/services/email.py
git commit -m "refactor(email): Entferne unused imports"
```

**Commit-Message-Format (Conventional Commits):**

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

Types:
- `feat`: Neues Feature
- `fix`: Bug-Fix
- `docs`: Dokumentation
- `refactor`: Code-Umstrukturierung ohne Funktionsänderung
- `test`: Tests hinzufügen/ändern
- `chore`: Build-System, Dependencies

**Beispiele:**
```
feat(auth): Add password reset functionality
fix(api): Handle null values in user endpoint
docs(readme): Update installation instructions
refactor(database): Extract query logic to repository
test(auth): Add tests for token expiration
```

### 5.2 Branch-Strategie

**Feature-Branch-Workflow:**

```
main (production-ready)
  └── develop (integration branch)
       ├── feature/user-export
       ├── feature/email-notifications
       └── bugfix/login-timeout
```

**Regeln:**
- `main`: Nur produktionsfertiger Code
- `develop`: Integration aller Features
- `feature/*`: Neue Features
- `bugfix/*`: Bug-Fixes
- `hotfix/*`: Dringende Production-Fixes

**Workflow:**
```bash
# Feature starten
git checkout -b feature/user-export develop

# Entwickeln, committen
git add ...
git commit -m "..."

# Feature fertig: Zurück in develop
git checkout develop
git merge --no-ff feature/user-export

# Nach Tests: In main mergen
git checkout main
git merge --no-ff develop
git tag -a v1.2.0 -m "Release 1.2.0"
```

### 5.3 Was gehört NICHT in Git

**.gitignore richtig konfigurieren:**

```gitignore
# Lokale Environment
.env
.env.local
venv/
node_modules/

# Build-Artefakte
__pycache__/
*.pyc
dist/
build/
*.egg-info/

# IDEs
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db

# Daten
data/raw/*
data/processed/*
*.csv
*.db

# Logs
*.log
logs/

# Secrets
secrets/
credentials.json
*.pem
*.key
```

### 5.4 Code Review vor Merge

**Jeder Merge in `develop` oder `main` braucht Review:**

Checkliste für Reviews:
- [ ] Tests laufen durch
- [ ] Code folgt Style-Guide
- [ ] Keine offensichtlichen Bugs
- [ ] Keine Sicherheitsprobleme
- [ ] Dokumentation aktualisiert
- [ ] KEINE ungefragten zusätzlichen Änderungen
- [ ] Fail-Fast-Prinzip beachtet (keine stillen Fallbacks)

---

## 6. Testing-Strategie

### 6.1 Test-Pyramide

```
       /\
      /  \     Unit Tests (70%)
     /----\    
    /      \   Integration Tests (20%)
   /--------\  
  /__________\ E2E Tests (10%)
```

**Unit Tests:**
- Testen einzelne Funktionen isoliert
- Schnell, keine externen Dependencies
- Mocks für Datenbank, API, etc.

**Integration Tests:**
- Testen Zusammenspiel mehrerer Komponenten
- Mit echter Datenbank (Test-DB)
- Langsamer, aber realistischer

**E2E Tests:**
- Testen komplette User-Flows
- Teuer in Wartung
- Nur für kritische Pfade

### 6.2 Test-Driven Development (TDD) bei Claude Code

**Workflow:**

1. **Test schreiben (rot)**
   ```bash
   claude "Schreibe Tests für User-Export basierend auf diesen Anforderungen"
   ```

2. **Test ausführen (muss fehlschlagen)**
   ```bash
   pytest tests/test_export.py
   ```

3. **Implementation (grün)**
   ```bash
   claude "Implementiere die Export-Funktion, sodass die Tests durchlaufen"
   ```

4. **Tests laufen**
   ```bash
   pytest tests/test_export.py
   ```

5. **Refactoring (bleibt grün)**
   - Code aufräumen
   - Tests müssen weiter durchlaufen

**Wichtig:** Claude explizit anweisen, dass es TDD ist, sonst implementiert es Mock-Code!

---

## 7. Fehler vermeiden

### 7.1 Typische KI-Coding-Probleme

**Problem 1: Zu viele Änderungen auf einmal**
```
❌ FALSCH: "Refaktiere die ganze App auf eine neue Architektur"
✅ RICHTIG: "Refaktiere nur das User-Model auf Repository-Pattern"
```

**Problem 2: Ungetestete Änderungen**
```
❌ FALSCH: Code ändern → Pushen
✅ RICHTIG: Code ändern → Tests schreiben → Tests laufen → Commit
```

**Problem 3: Lost Context**
```
❌ FALSCH: Lange Session mit vielen verschiedenen Aufgaben
✅ RICHTIG: Nach jedem Feature `/clear` → Neue Session starten
```

**Problem 4: Keine Verifikation**
```
❌ FALSCH: Claude sagt "fertig" → Man glaubt es
✅ RICHTIG: Tests laufen lassen, Code reviewen, selbst testen
```

**Problem 5: Stille Fallbacks (Fail-Fast Verletzung)**
```python
❌ FALSCH:
try:
    result = api_call()
except Exception:
    result = default_value  # Fehler versteckt!

✅ RICHTIG:
result = api_call()  # Exception schlägt durch
```

### 7.2 Context Management

**Problem:** Claude verliert bei langen Sessions den Kontext und vergisst Projekt-Regeln.

**Lösung:**

1. **`/clear` oft verwenden**
   - Nach jedem abgeschlossenen Feature
   - Spätestens alle 30-45 Minuten
   - Wenn Claude anfängt, gegen Guidelines zu verstoßen

2. **CLAUDE.md aktuell halten**
   - Alle wichtigen Regeln dokumentieren
   - Häufige Fehler als "Don'ts" aufnehmen

3. **Kleine, fokussierte Aufgaben**
   ```
   ❌ FALSCH: "Baue das komplette User-Management"
   ✅ RICHTIG: "Implementiere User-Registration" → /clear → "Implementiere Login"
   ```

---

## 8. Notfall-Prozeduren

### 8.1 Wenn Code kaputt ist

**Nach ungeplanten Änderungen oder fehlgeschlagenen Merges:**

1. **Panik vermeiden** – Ruhig bleiben
2. **Tests laufen lassen** – Was ist kaputt?
3. **Git-Status prüfen** – Was wurde geändert?
   ```bash
   git status
   git diff
   ```
4. **Zurück zu letztem funktionierenden Stand**
   ```bash
   git log --oneline  # Letzten guten Commit finden
   git reset --hard <commit-hash>
   ```
5. **Oder: Änderungen verwerfen**
   ```bash
   git checkout -- <file>  # Einzelne Datei
   git reset --hard HEAD   # Alle Änderungen
   ```

### 8.2 Wenn keine gute Commit-History existiert

**Problem:** Große ungeplante Änderungen ohne Commits → schwer zurückzurollen.

**Prävention:**
- Vor jeder Claude-Session: Aktuellen Stand committen
- Während Entwicklung: Regelmäßig committen
- Feature-Branches nutzen

**Emergency-Recovery:**
```bash
# Backup erstellen
cp -r project-root project-root-backup

# Versuchen, selektiv zurückzusetzen
git checkout <last-good-commit> -- src/path/to/broken/file.py

# Wenn alles verloren: Von Backup wiederherstellen
```

---

## 9. Checkliste für jede Entwicklungs-Session

Vor Start:
- [ ] **Development Document angelegt?** (im Root mit Timestamp!)
- [ ] CLAUDE.md aktuell?
- [ ] Aktueller Stand committet?
- [ ] Tests laufen durch?

Während Entwicklung:
- [ ] **Development Document nach jedem Schritt aktualisiert?**
- [ ] **Timestamp bei jeder Änderung erneuert?**
- [ ] **Bei Datei-Überarbeitung: Backup erstellt? (Name bleibt gleich!)**
- [ ] Claude bleibt beim Auftrag?
- [ ] Keine ungefragten Erweiterungen?
- [ ] Fail-Fast wird beachtet?
- [ ] Nach jedem Feature: Tests laufen?
- [ ] Regelmäßige Commits?

Beim Aktualisieren des Development Documents:
- [ ] Status der abgeschlossenen Schritte auf ✅
- [ ] Notizen zu Problemen hinzugefügt?
- [ ] Änderungen am Plan dokumentiert?
- [ ] Neuer Timestamp im Dateinamen?
- [ ] **Update BEVOR committet wird!**

Nach Fertigstellung:
- [ ] Alle Tests grün?
- [ ] Code-Review gemacht?
- [ ] Keine ungewollten Änderungen?
- [ ] Dokumentation aktualisiert?
- [ ] Commit-Message aussagekräftig?
- [ ] **Development Document auf "✅ Abgeschlossen"?**
- [ ] **Development Document nach docs/archive/ verschoben?**
- [ ] Schwierige Probleme in docs/lessons-learned/ dokumentiert?

---

## 10. Zusammenfassung der kritischsten Regeln

### Die 13 Gebote der Claude-Code-Entwicklung

1. **KISS** – Einfache Lösungen bevorzugen
2. **Separation of Concerns** – Jedes Modul hat eine Verantwortung
3. **Fail-Fast** – KEINE stillen Fallbacks, Fehler müssen sichtbar sein
4. **Nicht überschreiten** – Nur das tun, was gefragt wurde
5. **Erst planen** – Bei größeren Änderungen: Plan erstellen → Freigabe → Umsetzen
6. **Konzept vorlegen** – Architektur-Änderungen brauchen Freigabe
7. **Dateinamen bleiben stabil** – Bei Überarbeitung: Backup erstellen, operativer Name bleibt gleich
8. **Development Document PFLICHT** – Jede Entwicklung braucht Live-Dokument im Root
9. **Timestamp immer aktuell** – Bei jedem Update neuer Timestamp, BEVOR committet wird
10. **Kleine Commits** – Atomare, getestete Änderungen
11. **Tests sind Pflicht** – Keine Änderung ohne Test
12. **CLAUDE.md nutzen** – Projektregeln dokumentieren
13. **Context Management** – `/clear` oft verwenden, fokussierte Aufgaben

### Dokumentations-Workflow in 5 Schritten

1. **Start:** Development Document im Root anlegen mit Timestamp
2. **Während:** Nach JEDEM Schritt updaten + neuer Timestamp
3. **Probleme:** Schwierige Issues in docs/lessons-learned/ dokumentieren
4. **Fertig:** Status auf ✅, Document nach docs/archive/ verschieben
5. **Nächstes:** Neues Development Document für nächstes Feature

### Wenn Claude eine dieser Regeln verletzt:

1. **Stoppen** – Änderungen nicht übernehmen
2. **CLAUDE.md updaten** – Regel explizit aufnehmen
3. **Neu starten** – `/clear` und Aufgabe neu formulieren
4. **Expliziter sein** – Regel im Prompt erwähnen

### Development Document = Pflicht

**Es gibt KEINE nennenswerte Entwicklung ohne Development Document!**

- ❌ Ohne Dokument anfangen
- ❌ Dokument vergessen zu updaten
- ❌ Timestamp nicht aktualisieren
- ❌ Direkt committen ohne Document-Update
- ✅ Dokument anlegen → Entwickeln → Nach jedem Schritt updaten → Bei Fertigstellung archivieren

---

## Anhang: Nützliche Links und Ressourcen

- **Claude Code Docs:** https://docs.claude.com/en/docs/claude-code
- **Anthropic Best Practices:** https://www.anthropic.com/engineering/claude-code-best-practices
- **Conventional Commits:** https://www.conventionalcommits.org/
- **Git Best Practices:** https://about.gitlab.com/topics/version-control/version-control-best-practices/

---

**Versionierung dieses Dokuments:**
- v1.1.1 (Oktober 2025): Hinzugefügt: Datei-Backup-Regel bei Überarbeitung (operative Namen bleiben stabil)
- v1.1 (Oktober 2025): Hinzugefügt: Development Documentation System mit Live-Dokumenten, Timestamps, docs/lessons-learned/, docs/archive/, CHANGELOG
- v1.0 (Oktober 2025): Initial Release mit KISS, Separation of Concerns, Fail-Fast, Projekt-Struktur, Git-Workflow

**⚠️ Hinweis:** Auch dieses Dokument sollte mit Timestamp versehen werden, wenn es aktualisiert wird:
```
docs/DEVELOPMENT-GUIDELINES-FULL_2025-10-17-1700.md
```