#!/bin/bash
# Smart Lock Backend - Apple Containers Setup
# This script sets up MySQL + Mosquitto in Apple Containers
# and runs the backend natively (Apple Containers builder lacks DNS for full Docker builds)

set -e

echo "=== Starting Apple Containers system ==="
container system start 2>/dev/null || true

echo "=== Creating network ==="
container network create smartlock-net 2>/dev/null || echo "Network already exists"

echo "=== Starting MySQL ==="
container rm -f smartlock-mysql 2>/dev/null || true
container run -d --name smartlock-mysql --network smartlock-net \
  -e MYSQL_ROOT_PASSWORD=smartlock123 \
  -e MYSQL_DATABASE=smart_lock \
  -p 3306:3306 \
  mysql:8

echo "=== Starting Mosquitto MQTT Broker ==="
container rm -f smartlock-mosquitto 2>/dev/null || true
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$SCRIPT_DIR/mosquitto-config"
cp "$SCRIPT_DIR/mosquitto.conf" "$SCRIPT_DIR/mosquitto-config/mosquitto.conf"
container run -d --name smartlock-mosquitto --network smartlock-net \
  -p 1883:1883 \
  -v "$SCRIPT_DIR/mosquitto-config:/mosquitto/config" \
  eclipse-mosquitto:2

echo "=== Waiting for MySQL to be ready ==="
MYSQL_IP=$(container inspect smartlock-mysql 2>&1 | sed -n 's/.*"address":"\([0-9.]*\).*/\1/p' | head -1)
MOSQUITTO_IP=$(container inspect smartlock-mosquitto 2>&1 | sed -n 's/.*"address":"\([0-9.]*\).*/\1/p' | head -1)

for i in $(seq 1 30); do
  if node -e "require('mysql2/promise').createConnection({host:'$MYSQL_IP',port:3306,user:'root',password:'smartlock123'}).then(c=>{c.end();process.exit(0)}).catch(()=>process.exit(1))" 2>/dev/null; then
    echo "MySQL is ready!"
    break
  fi
  echo "Waiting for MySQL... ($i/30)"
  sleep 2
done

echo "=== Installing dependencies ==="
npm install

echo "=== Building ==="
npm run build

echo "=== Downloading face models ==="
node scripts/download-models.js

echo "=== Starting backend ==="
echo ""
echo "MySQL IP:     $MYSQL_IP"
echo "Mosquitto IP: $MOSQUITTO_IP"
echo "Backend:      http://localhost:3000"
echo "Swagger:      http://localhost:3000/docs"
echo ""

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
