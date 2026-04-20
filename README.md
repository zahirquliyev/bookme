# 📞 CallCenter SaaS — Azərbaycan üçün Hybrid GSM/VoIP Call Center

Multi-tenant SaaS platformu. Restoran, pub, əyləncə yerləri üçün.

---

## 🏗️ Arxitektura

```
Müştəri zəngi
     ↓
GSM Gateway (GoIP) ──→ Asterisk PBX ──→ Queue ──→ Agent (SIP)
                              ↑                        ↑
VoIP (Twilio/Zadarma) ────────┘              Node.js Backend
                                                   ↕
                                             PostgreSQL + Redis
                                                   ↕
                                            React Agent Panel
```

---

## 🚀 Quraşdırma (5 addım)

### 1. Tələblər
```bash
# Server: Ubuntu 22.04 VPS (min 2 CPU, 4GB RAM)
# Lazımi paketlər:
sudo apt install docker.io docker-compose git -y
```

### 2. Kodu əldə et
```bash
git clone <your-repo> callcenter-saas
cd callcenter-saas
```

### 3. .env faylını hazırla
```bash
cp .env.example .env
nano .env   # dəyərləri doldurun
```

### 4. Sistemi qaldır
```bash
docker-compose up -d --build
```

### 5. Yoxla
```bash
# Bütün containerlar işləyirmi?
docker-compose ps

# Logları izlə
docker-compose logs -f backend
```

Açın: **http://YOUR_SERVER_IP**

---

## 📱 GoIP GSM Gateway Quraşdırması

1. GoIP web panelini açın: `http://192.168.1.X` (cihazın IP-si)
2. SIP Settings:
   - SIP Server: `YOUR_SERVER_IP`
   - SIP Port: `5060`
   - SIP User: `goip1`
   - SIP Password: `GOIP_SECRET` (.env-dəki dəyər)
3. Call Mode: `Call Through`

---

## 🌐 Twilio VoIP Quraşdırması

1. [Twilio Console](https://console.twilio.com) → Phone Numbers → alın
2. Phone Number → Voice Webhook:
   - URL: `http://YOUR_SERVER_IP/api/webhooks/twilio/voice`
   - Method: POST
3. Status Callback: `http://YOUR_SERVER_IP/api/webhooks/twilio/status`

---

## 🔧 Asterisk Dialplan — Nömrə Əlavə Et

Yeni tenant üçün `extensions.conf`-a daxil edin:

```ini
; Tenant: Restoran Firuzə
; GSM nömrə: 050-123-45-67 (GoIP port 1)
; Bu artıq avtomatik işləyir — tenant nömrəsi DB-dədir
```

---

## 📊 Admin Panel

| URL | Funksiya |
|-----|---------|
| `/dashboard` | Canlı statistika, aktiv zənglər |
| `/agents` | Operatorlar — əlavə et, SIP məlumatları |
| `/calls` | Zəng tarixi, filtr |
| `/settings` | Nömrələr, iş saatları |

---

## 🔒 Təhlükəsizlik

- JWT access token: 15 dəqiqə
- Refresh token: 7 gün, rotasiya olunur
- Asterisk AMI: yalnız Docker şəbəkəsindən
- Twilio webhook imzası yoxlanılır

---

## 💰 Tarif Planları

| Plan | Operator | Nömrə | Qiymət |
|------|---------|-------|--------|
| Starter | 3 | 2 | $29.99/ay |
| Pro | 10 | 5 | $79.99/ay |
| Enterprise | 50 | 20 | $199.99/ay |

---

## 📁 Layihə Strukturu

```
callcenter-saas/
├── backend/
│   └── src/
│       ├── db/           ← PostgreSQL pool, init.sql
│       ├── middleware/   ← JWT auth, tenant
│       ├── tenants/      ← auth.routes, tenant.routes
│       ├── agents/       ← agent.routes
│       ├── calls/        ← call.routes
│       ├── asterisk/     ← AMI connection + event handlers
│       └── webhooks/     ← Twilio voice + status
├── asterisk/
│   ├── extensions.conf   ← Dialplan (GSM + VoIP + Queue)
│   ├── sip.conf          ← SIP peers (GoIP, Twilio, agents)
│   ├── queues.conf       ← Queue config
│   └── manager.conf      ← AMI access
├── frontend/
│   └── src/
│       ├── pages/        ← Dashboard, Agents, Calls, Settings
│       ├── components/   ← Layout, sidebar
│       ├── hooks/        ← useSocket (realtime)
│       └── context/      ← AuthContext
├── nginx/
│   └── nginx.conf        ← Reverse proxy
├── docker-compose.yml    ← Bütün servislər
└── .env.example          ← Environment şablonu
```
