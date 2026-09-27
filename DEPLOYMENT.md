# Deployment auf Plesk (oenk.net/family)

Diese App besteht aus 3 Teilen: **MongoDB**, **FastAPI-Backend** (Python, Port 8001) und **React-Frontend** (statischer Build). Echtzeit (Whiteboard) läuft über **WebSocket** unter `/api/ws/whiteboard` — der Reverse-Proxy muss WebSocket-Upgrades durchreichen.

## 1. Voraussetzungen
- Plesk mit **Python** (uvicorn) und **Node.js** Extension, sowie **MongoDB** (lokal installiert oder MongoDB Atlas).
- Domain/Subdomain, z. B. `oenk.net`, App-Pfad `/family`.

## 2. Backend
```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
```
`.env` anpassen (Produktion):
```
MONGO_URL="mongodb://localhost:27017"
DB_NAME="familien_app"
CORS_ORIGINS="https://oenk.net"
JWT_SECRET="<eigener 64-Zeichen-Hex>"
ADMIN_USERNAME="Admin"
ADMIN_PASSWORD="<sicheres Passwort>"
ADMIN_EMAIL="christian.wetjen@outlook.de"
WEBAUTHN_RP_ID="oenk.net"
WEBAUTHN_RP_NAME="Familien-App"
WEBAUTHN_ORIGIN="https://oenk.net"
VAPID_PUBLIC_KEY="<vorhandener Wert>"
VAPID_PRIVATE_KEY="<vorhandener Wert>"
VAPID_SUBJECT="mailto:christian.wetjen@outlook.de"
WEBHOOK_CRON_SECRET="<eigenes Secret>"
```
Wichtig: `WEBAUTHN_RP_ID`/`WEBAUTHN_ORIGIN` MÜSSEN exakt zur Domain passen, sonst schlägt der Fingerabdruck-Login fehl.

Backend als Dienst starten (systemd-Beispiel `/etc/systemd/system/familien-backend.service`):
```
[Unit]
Description=Familien-App Backend
After=network.target mongod.service

[Service]
WorkingDirectory=/var/www/vhosts/oenk.net/family/backend
Environment="PATH=/var/www/vhosts/oenk.net/family/backend/venv/bin"
ExecStart=/var/www/vhosts/oenk.net/family/backend/venv/bin/uvicorn server:app --host 127.0.0.1 --port 8001
Restart=always

[Install]
WantedBy=multi-user.target
```
```bash
systemctl enable --now familien-backend
```

## 3. Frontend (Build)
`frontend/.env`:
```
REACT_APP_BACKEND_URL=https://oenk.net
WDS_SOCKET_PORT=443
```
```bash
cd frontend
yarn install
yarn build
```
Den Inhalt von `frontend/build/` in das Web-Root der Domain kopieren (z. B. `/var/www/vhosts/oenk.net/httpdocs`).

## 4. Reverse-Proxy (WebSocket-fähig!)
### Nginx (Plesk: Apache & nginx Settings → Additional nginx directives)
```nginx
# API + WebSocket an das Backend weiterleiten
location /api/ {
    proxy_pass http://127.0.0.1:8001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 3600s;
}

# React SPA – alle anderen Routen auf index.html
location / {
    try_files $uri /index.html;
}
```
Der `Upgrade`/`Connection "upgrade"`-Block ist zwingend, damit das **Whiteboard in Echtzeit** funktioniert (`wss://oenk.net/api/ws/whiteboard`).

## 5. Geplante Erinnerungen (Cron)
Auf der Emergent-Plattform übernimmt `.emergent/crons.yml` den 15-Minuten-Takt automatisch. Auf Plesk stattdessen einen System-Cron einrichten:
```
*/15 * * * * curl -s -X POST https://oenk.net/api/cron/reminders -H "Authorization: Bearer <WEBHOOK_CRON_SECRET>" >/dev/null
```

## 6. Kalender-Abo (Apple/Google)
Im Kalender auf **„Abonnieren"** klicken → der Link `https://oenk.net/api/ical/<token>.ics` kann in Apple Kalender (Abo-Kalender) bzw. Google Kalender (Über URL hinzufügen) eingetragen werden. Neue Termine erscheinen dort automatisch (einweg-Synchronisation).

## 7. HTTPS
Let's Encrypt in Plesk aktivieren — WebAuthn (Fingerabdruck), PWA-Installation und Push benötigen HTTPS.
