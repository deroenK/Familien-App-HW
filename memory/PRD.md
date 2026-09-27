# Familien-App PWA — PRD

## Original Problem Statement
Vollständige deutsche Familien-App (PWA) mit Anmeldung (Benutzername+Passwort, WebAuthn-Fingerabdruck), Profil, Admin-Panel, Dashboard, Essensplan, Einkaufsliste, Kalender, Notizbuch, Whiteboard, Haushaltsplan, Postkarten-Karte und Push-Benachrichtigungen. Dark Mode, installierbar, Dropdown-Navigation + Mobile Bottom-Nav.

## User Choices (MVP)
- Module: Grundgerüst (Login/Dashboard/Profil/Admin) + **Essensplan + Einkaufsliste + Kalender**
- Speicherung: echtes Backend (FastAPI + MongoDB), geräteübergreifend synchron
- WebAuthn: voll integriert (py_webauthn)
- Feiertage: **Mecklenburg-Vorpommern**
- Push: echter VAPID Server-Push (pywebpush)
- Sprache: Deutsch

## Architecture
- Backend: FastAPI (`/app/backend/server.py`), MongoDB (motor), UUID-String-IDs
- Auth: JWT Bearer Token (localStorage), Login per **Benutzername**, bcrypt
- Frontend: React 19 + Tailwind + shadcn/ui, react-router, sonner Toasts
- PWA: manifest.json + service worker (`/public/sw.js`), dark theme
- Design: Obsidian Dark (#0B0F17) + Bernstein-Akzent (#F59E0B), Outfit/IBM Plex Sans

## User Personas
- Admin (Christian): verwaltet Familienkonten und Daten
- Familienmitglieder (Mama u.a.): planen Essen, Einkauf, Termine

## Implemented (2026-06)
- **Haushaltsplan** (2. Iteration): Wochen-/Monatsplan, Fortschrittsbalken + grünes Aufleuchten bei 100%, Erlediger-Name gespeichert/angezeigt, Aufgaben hinzufügen/löschen, Plan zurücksetzen, Push bei Erledigung
- **Whiteboard** (2. Iteration): Werkzeuge (Stift/Marker/Radierer/Linie/Rechteck/Kreis), Stiftfarbe=Profilfarbe + Farbwähler, Stärke, Undo/Redo (30), Echtzeit-Sync via Polling, PNG-Export, Leeren mit Bestätigung, Familie-Benachrichtigung
- **Notizbuch** (2. Iteration): mehrere Bücher mit Icon, Seiten in A4, Rich-Text (Fett/Kursiv/Unterstrichen/Listen), Handschrift-Canvas, Tesseract.js OCR (de+en), Teilen pro Buch, Zugriffsschutz (eigene+geteilte; Admin alle; Seiten-Endpunkte 403-geschützt)
- Login + WebAuthn Fingerabdruck (register/authenticate), Fingerabdruck-Anmeldung auf Login-Seite
- Profil: Daten, Avatar-Upload (base64), Profilfarbe (=Stiftfarbe), Passwort ändern, Push-Toggles je Typ, Test-Push
- Admin: User CRUD, Passwort-Reset, Profil+Rolle bearbeiten, JSON Export/Import/Reset
- Dashboard: Wochen-Essensplan-Übersicht (Diese/Nächste Woche, sonntags auto nächste), Kachel-Navigation, Admin-Kachel nur für Admin
- Essensplan: 7 Tage Mittag/Abend, Mo–Fr Mittag „Arbeit" (nicht an Feiertagen), Inline-Edit/Delete, 1/2-Personen-Umschalter, Gerichtsverwaltung (Zutaten für 1/2 Pers.), MV-Feiertags-Badges, „→ Einkaufsliste"-Übertragung
- Einkaufsliste: Schnelleingabe, 11 Kategorien, Kategorie-Gruppierung, Abhaken/Löschen/Erledigte löschen, Top-20-Produktvorlagen (auto-gelernt), Grün-Markierung vorhandener Produkte
- Kalender: Monatsansicht + Navigation, Termine in Profilfarbe, Geburtstage (gemeinsame Kategorie, jährlich, Torte-Icon), Sonstiges, Push-Erinnerung 3/12/24/72h, Monatsliste, Löschen
- Push: VAPID subscribe/unsubscribe/test, Sofort-Push bei neuem Termin
- Dark Mode, Hamburger-Dropdown + Mobile Bottom-Nav, PWA installierbar

## Backlog (nicht im MVP)
- P1: Notizbuch (Bücher/Seiten, Rich-Text, Handschrift-Canvas, Tesseract.js OCR)
- P1: Whiteboard (Werkzeuge, Echtzeit-Sync, PNG-Export)
- P1: Haushaltsplan (Wochen/Monat, Fortschritt, Erlediger-Name)
- P2: Postkarten-Karte (Leaflet/OSM, Nominatim, GPS)
- P2: Geplante Push-Erinnerungen (Cron/Scheduler für 3/12/24/72h vorher — aktuell nur Sofort-Push bei Terminanlage)
- P2: Feiertags-Freie-Auswahl UI-Hinweis, Offline-Caching der API-Daten

## Notes
- Login per Benutzername (nicht E-Mail); Passwort-Reset erfolgt durch Admin (kein E-Mail-Flow, bewusst für Familien-App)
- WebAuthn RP_ID/ORIGIN in backend/.env — bei Deploy auf eigene Domain (oenk.net) anpassen
