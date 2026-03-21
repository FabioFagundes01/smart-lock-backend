# 🔐 Smart Lock Backend

Backend NestJS para fechadura inteligente com autenticação por **NFC**, **reconhecimento facial** e **app mobile**, comunicando com o ESP32 via **MQTT**.

## Stack

| Camada       | Tecnologia                          |
|--------------|-------------------------------------|
| Framework    | NestJS (TypeScript)                 |
| Banco        | MySQL 8+ + TypeORM                  |
| Autenticação | JWT + Passport                      |
| Mensageria   | MQTT (Mosquitto)                    |
| Facial       | @vladmandic/face-api + canvas       |
| Docs         | Swagger (OpenAPI)                   |

---

## Pré-requisitos

- Node.js >= 18
- MySQL >= 8
- Broker MQTT — [Mosquitto](https://mosquitto.org/download/)

---

## Instalação

```bash
# 1. Instalar dependências
npm install

# 2. Copiar e preencher variáveis de ambiente
cp .env.example .env

# 3. Baixar modelos do face-api (~100MB)
node scripts/download-models.js

# 4. Criar banco de dados MySQL
mysql -u root -p -e "CREATE DATABASE smart_lock CHARACTER SET utf8mb4;"

# 5. Rodar em desenvolvimento (tabelas criadas automaticamente)
npm run start:dev
```

---

## Criar o primeiro usuário Admin

Como a rota de criação de usuários exige JWT de admin, o primeiro usuário deve ser criado direto no banco. Gere o hash da senha pelo Node:

```bash
node -e "const b = require('bcryptjs'); b.hash('SuaSenha@123', 12).then(h => console.log(h))"
```

Depois insira no MySQL:

```sql
USE smart_lock;
INSERT INTO users (id, name, email, password, role, is_active, created_at, updated_at)
VALUES (UUID(), 'Admin', 'admin@email.com', 'HASH_GERADO_ACIMA', 'admin', 1, NOW(), NOW());
```

---

## Variáveis de Ambiente (.env)

```env
PORT=3000
NODE_ENV=development

# MySQL
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=sua_senha
DB_DATABASE=smart_lock

# JWT
JWT_SECRET=gere_com_node_-e_crypto.randomBytes(32).toString('hex')
JWT_EXPIRES_IN=7d

# MQTT
MQTT_HOST=localhost
MQTT_PORT=1883
MQTT_USERNAME=
MQTT_PASSWORD=
MQTT_CLIENT_ID=smart-lock-backend

# Tópicos MQTT (devem bater com o firmware do ESP32)
MQTT_TOPIC_LOCK_COMMAND=fechadura/comando
MQTT_TOPIC_LOCK_STATUS=fechadura/status
MQTT_TOPIC_NFC=fechadura/nfc
MQTT_TOPIC_FACE=fechadura/face

# Uploads
UPLOAD_DIR=./uploads/faces
MAX_FILE_SIZE=5242880
```

---

## Estrutura do Projeto

```
src/
├── main.ts                    # Bootstrap + Swagger
├── app.module.ts              # Módulo raiz
│
├── auth/                      # JWT, login, guards
│   ├── auth.service.ts
│   ├── auth.controller.ts
│   ├── auth.module.ts
│   ├── dto/auth.dto.ts
│   ├── strategies/jwt.strategy.ts
│   └── guards/
│       ├── jwt-auth.guard.ts
│       └── admin.guard.ts
│
├── users/                     # CRUD de usuários + NFC + foto facial
│   ├── users.service.ts
│   ├── users.controller.ts
│   ├── users.module.ts
│   ├── dto/user.dto.ts
│   └── entities/user.entity.ts
│
├── face/                      # Reconhecimento facial
│   ├── face.service.ts
│   ├── face.module.ts
│   └── face-api-setup.ts      # Configura tfjs puro (sem compilar C++)
│
├── mqtt/                      # Cliente MQTT global
│   ├── mqtt.service.ts
│   └── mqtt.module.ts
│
└── lock/                      # Lógica da fechadura + logs
    ├── lock.service.ts
    ├── lock.controller.ts
    ├── lock.module.ts
    └── entities/access-log.entity.ts
```

---

## Endpoints

### Autenticação
| Método | Rota                  | Descrição               | Auth |
|--------|-----------------------|-------------------------|------|
| POST   | /api/v1/auth/login    | Login → retorna JWT     | ❌   |
| GET    | /api/v1/auth/profile  | Dados do usuário logado | JWT  |

### Usuários
| Método | Rota                       | Descrição             | Auth       |
|--------|----------------------------|-----------------------|------------|
| POST   | /api/v1/users              | Criar usuário         | JWT Admin  |
| GET    | /api/v1/users              | Listar usuários       | JWT Admin  |
| GET    | /api/v1/users/:id          | Buscar usuário        | JWT        |
| PUT    | /api/v1/users/:id          | Atualizar usuário     | JWT        |
| DELETE | /api/v1/users/:id          | Deletar usuário       | JWT Admin  |
| PATCH  | /api/v1/users/:id/nfc      | Vincular NFC          | JWT        |
| DELETE | /api/v1/users/:id/nfc      | Remover NFC           | JWT        |
| POST   | /api/v1/users/:id/face     | Cadastrar foto facial | JWT        |
| PATCH  | /api/v1/users/:id/activate | Ativar usuário        | JWT Admin  |
| PATCH  | /api/v1/users/:id/deactivate | Desativar usuário   | JWT Admin  |

### Fechadura
| Método | Rota                    | Descrição                       | Auth      |
|--------|-------------------------|---------------------------------|-----------|
| POST   | /api/v1/lock/open       | Abrir pelo app                  | JWT       |
| POST   | /api/v1/lock/close      | Fechar pelo app                 | JWT       |
| POST   | /api/v1/lock/auth/nfc   | Autenticar por NFC              | ❌        |
| POST   | /api/v1/lock/auth/face  | Autenticar por foto (multipart) | ❌        |
| GET    | /api/v1/lock/status     | Status MQTT + sistema           | JWT       |
| GET    | /api/v1/lock/logs       | Histórico de acessos            | JWT Admin |
| GET    | /api/v1/lock/logs/me    | Meu histórico                   | JWT       |

---

## Tópicos MQTT

### Backend → ESP32 (`fechadura/comando`)
```json
{ "action": "open",   "reason": "nfc|face|app", "ts": 1710000000 }
{ "action": "close",  "ts": 1710000000 }
{ "action": "denied", "reason": "nfc_unknown|face_not_recognized", "ts": 1710000000 }
```

### ESP32 → Backend (`fechadura/nfc`)
```json
{ "uid": "04:A1:B2:C3:D4:E5" }
```

### ESP32 → Backend (`fechadura/status`)
```json
{ "state": "open" }
{ "state": "closed" }
```

---

## Banco de Dados

### Tabela `users`
| Campo            | Tipo    | Descrição                           |
|------------------|---------|-------------------------------------|
| id               | uuid    | PK gerado automaticamente           |
| name             | varchar |                                     |
| email            | varchar | único                               |
| password         | varchar | hash bcrypt (nunca texto puro)      |
| role             | enum    | admin \| user                       |
| nfc_uid          | varchar | UID da tag NFC vinculada (único)    |
| face_photo_path  | varchar | Caminho da foto no disco            |
| face_descriptor  | text    | Vetor de 128 floats do rosto (JSON) |
| is_active        | boolean | Usuário ativo/inativo               |

### Tabela `access_logs`
| Campo           | Tipo    | Descrição                      |
|-----------------|---------|--------------------------------|
| id              | uuid    |                                |
| user_id         | uuid    | FK users (nullable)            |
| access_method   | enum    | nfc \| face \| app             |
| result          | enum    | granted \| denied              |
| nfc_uid_used    | varchar | UID usado na tentativa NFC     |
| face_confidence | float   | Confiança 0.0–1.0 do facial    |
| ip              | varchar | IP da requisição               |

---

## Swagger

Disponível em: `http://localhost:3000/docs`

---

## Testando o MQTT manualmente (simulando o ESP32)

```bash
# Terminal 1 — escutar comandos que o backend envia ao ESP32
mosquitto_sub -h localhost -t "fechadura/comando" -v

# Terminal 2 — simular ESP32 enviando leitura NFC
mosquitto_pub -h localhost -t "fechadura/nfc" -m "{\"uid\":\"04:A1:B2:C3\"}"
```

---

## Fluxo de Autenticação

```
App (React)                     Backend (NestJS)              ESP32
       │                              │                          │
       │  POST /auth/login            │                          │
       │ ──────────────────────────► │                          │
       │  { access_token: "..." }     │                          │
       │ ◄────────────────────────── │                          │
       │                              │                          │
       │  POST /lock/open (JWT)       │                          │
       │ ──────────────────────────► │                          │
       │                              │  MQTT: fechadura/comando │
       │                              │ ───────────────────────► │
       │                              │  { action: "open" }      │  🔓 servo
       │  { result: "granted" }       │                          │
       │ ◄────────────────────────── │                          │
       │                              │                          │
                     NFC (ESP32 direto)                          │
                                      │  MQTT: fechadura/nfc     │
                                      │ ◄─────────────────────── │
                                      │  { uid: "04:A1:..." }    │
                                      │  MQTT: fechadura/comando │
                                      │ ───────────────────────► │  🔓 servo
```

---

## Observações

- As tabelas são criadas automaticamente no primeiro `start:dev` (`synchronize: true`)
- Em produção, desative o `synchronize` e use migrations
- O aviso sobre `tfjs-node` no boot é informativo — não afeta o funcionamento
- Os modelos (~100MB) não são versionados no git — rode `node scripts/download-models.js` após clonar
