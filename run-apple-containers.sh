#!/bin/bash
# Smart Lock Backend - Apple Containers Setup
# Uses `container` CLI (Apple Containers), no Docker-specific flags like --network or --link
set -euo pipefail

MYSQL_CONTAINER="smartlock-mysql"
MOSQUITTO_CONTAINER="smartlock-mosquitto"
MYSQL_PORT="3306"
MOSQUITTO_PORT="1883"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Starting Apple Containers system ==="
container system start 2>/dev/null || true

# --- MySQL ---
container stop "$MYSQL_CONTAINER" 2>/dev/null || true
container rm -f "$MYSQL_CONTAINER" 2>/dev/null || true

echo "Starting MySQL container..."
container run \
  --name "$MYSQL_CONTAINER" \
  -e MYSQL_ROOT_PASSWORD=smartlock123 \
  -e MYSQL_DATABASE=smart_lock \
  -p "$MYSQL_PORT:3306" \
  -d \
  docker.io/library/mysql:8

echo "Waiting for MySQL to be ready..."
for i in $(seq 1 30); do
  if container exec "$MYSQL_CONTAINER" mysqladmin ping -h localhost --silent 2>/dev/null; then
    echo "MySQL is ready."
    break
  fi
  echo "Waiting for MySQL... ($i/30)"
  sleep 2
done

# --- Resolve host gateway IP ---
echo "Detecting host gateway IP..."
GW_HEX=$(container exec "$MYSQL_CONTAINER" sh -c "awk '\$2==\"00000000\" {print \$3}' /proc/net/route")
HOST_IP=$(printf '%d.%d.%d.%d' "0x${GW_HEX:6:2}" "0x${GW_HEX:4:2}" "0x${GW_HEX:2:2}" "0x${GW_HEX:0:2}")
echo "Host gateway IP: $HOST_IP"

# --- Mosquitto ---
container stop "$MOSQUITTO_CONTAINER" 2>/dev/null || true
container rm -f "$MOSQUITTO_CONTAINER" 2>/dev/null || true

mkdir -p "$SCRIPT_DIR/mosquitto-config"
cp "$SCRIPT_DIR/mosquitto.conf" "$SCRIPT_DIR/mosquitto-config/mosquitto.conf"

echo "Starting Mosquitto container..."
container run \
  --name "$MOSQUITTO_CONTAINER" \
  -p "$MOSQUITTO_PORT:1883" \
  --mount "type=bind,source=$SCRIPT_DIR/mosquitto-config,target=/mosquitto/config,readonly" \
  -d \
  docker.io/library/eclipse-mosquitto:2

echo "Waiting for Mosquitto to be ready..."
sleep 3
echo "Mosquitto started."

# --- Install dependencies & build ---
echo "=== Installing dependencies ==="
cd "$SCRIPT_DIR"
npm install

echo "=== Building ==="
npm run build

echo "=== Downloading face models ==="
node scripts/download-models.js 2>/dev/null || echo "Models already downloaded or script missing"

echo ""
echo "=== Services ==="
echo "  MySQL:     localhost:$MYSQL_PORT"
echo "  Mosquitto: localhost:$MOSQUITTO_PORT"
echo "  Backend:   http://localhost:3000"
echo "  Swagger:   http://localhost:3000/docs"
echo ""

# --- Resolve container IPs ---
echo "Detecting container IPs..."
MYSQL_IP=$(container inspect "$MYSQL_CONTAINER" 2>&1 | sed -n 's/.*"address":"\([0-9.]*\).*/\1/p' | head -1)
MOSQUITTO_IP=$(container inspect "$MOSQUITTO_CONTAINER" 2>&1 | sed -n 's/.*"address":"\([0-9.]*\).*/\1/p' | head -1)
echo "  MySQL IP:     $MYSQL_IP"
echo "  Mosquitto IP: $MOSQUITTO_IP"

echo "=== Starting backend ==="
PORT=3000 \
NODE_ENV=development \
DB_HOST=$MYSQL_IP \
DB_PORT=3306 \
DB_USERNAME=root \
DB_PASSWORD=smartlock123 \
DB_DATABASE=smart_lock \
JWT_SECRET=dev-jwt-secret-change-in-production \
JWT_EXPIRES_IN=7d \
MQTT_HOST=$MOSQUITTO_IP \
MQTT_PORT=1883 \
MQTT_CLIENT_ID=smart-lock-backend \
MQTT_TOPIC_LOCK_COMMAND=fechadura/comando \
MQTT_TOPIC_LOCK_STATUS=fechadura/status \
MQTT_TOPIC_NFC=fechadura/nfc \
MQTT_TOPIC_FACE=fechadura/face \
UPLOAD_DIR=./uploads/faces \
node dist/main
