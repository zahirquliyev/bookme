#!/bin/bash
# ============================================================
# deploy.sh — CallCenter SaaS — One-command VPS Deploy
# Ubuntu 22.04 üçün
# İstifadə: bash deploy.sh
# ============================================================

set -e
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo ""
echo "📞 CallCenter SaaS — Deploy Script"
echo "==================================="
echo ""

# 1. Docker yoxla / quraşdır
if ! command -v docker &>/dev/null; then
    warn "Docker tapılmadı. Quraşdırılır..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker $USER
    log "Docker quraşdırıldı"
else
    log "Docker mövcuddur: $(docker --version)"
fi

if ! command -v docker-compose &>/dev/null; then
    warn "Docker Compose quraşdırılır..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
        -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    log "Docker Compose quraşdırıldı"
fi

# 2. .env faylı yoxla
if [ ! -f .env ]; then
    warn ".env faylı yoxdur. .env.example-dən kopyalanır..."
    cp .env.example .env

    # Auto-generate secrets
    DB_PASS=$(openssl rand -hex 16)
    REDIS_PASS=$(openssl rand -hex 16)
    JWT_SECRET=$(openssl rand -hex 32)
    AMI_SECRET=$(openssl rand -hex 12)
    SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "localhost")

    sed -i "s/strongpassword_deyisin/$DB_PASS/" .env
    sed -i "s/redispass_deyisin/$REDIS_PASS/" .env
    sed -i "s/cok_uzun_ve_random_bir_secret_yazin_buraya/$JWT_SECRET/" .env
    sed -i "s/amipassword_deyisin/$AMI_SECRET/" .env
    sed -i "s/YOUR_SERVER_IP/$SERVER_IP/g" .env

    echo ""
    warn "⚠️  .env faylını açıb Twilio/Zadarma/GoIP məlumatlarınızı daxil edin:"
    warn "    nano .env"
    echo ""
    read -p "Davam etmək üçün Enter basın (sonra da düzəldə bilərsiniz)..."
fi

# 3. Firewall (UFW)
if command -v ufw &>/dev/null; then
    log "Firewall qaydaları tənzimlənir..."
    sudo ufw allow 80/tcp    2>/dev/null || true
    sudo ufw allow 443/tcp   2>/dev/null || true
    sudo ufw allow 5060/udp  2>/dev/null || true   # SIP
    sudo ufw allow 5060/tcp  2>/dev/null || true
    sudo ufw allow 10000:20000/udp 2>/dev/null || true  # RTP
fi

# 4. Build + qaldır
log "Containerlar build edilir (bu bir neçə dəqiqə çəkə bilər)..."
docker-compose build --no-cache

log "Servislər başladılır..."
docker-compose up -d

# 5. DB hazır olana qədər gözlə
log "PostgreSQL gözlənilir..."
until docker exec cc_postgres pg_isready -U ccadmin -d callcenter &>/dev/null; do
    sleep 2
done
log "PostgreSQL hazırdır"

# 6. Status yoxla
sleep 5
echo ""
echo "==================================="
echo "📊 Servis Statusları:"
docker-compose ps
echo ""

SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "YOUR_SERVER_IP")
echo -e "${GREEN}✅ Deploy tamamlandı!${NC}"
echo ""
echo "🌐 Panel: http://$SERVER_IP"
echo "📖 API:   http://$SERVER_IP/api/health"
echo ""
echo "📋 Növbəti addımlar:"
echo "  1. GoIP cihazını SIP server olaraq $SERVER_IP:5060-a yönləndir"
echo "  2. Twilio-da webhook URL-ni daxil et: http://$SERVER_IP/api/webhooks/twilio/voice"
echo "  3. Panelə daxil ol → Qeydiyyat → Nömrələr əlavə et → Operatorlar yarat"
echo ""
