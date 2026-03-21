import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mqtt from 'mqtt';
import { MqttClient } from 'mqtt';

export type MqttTopicHandler = (payload: string) => void;

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);
  private client: MqttClient;
  private readonly handlers = new Map<string, MqttTopicHandler[]>();

  // Tópicos padrão
  readonly TOPIC_LOCK_COMMAND: string;
  readonly TOPIC_LOCK_STATUS: string;
  readonly TOPIC_NFC: string;
  readonly TOPIC_FACE: string;

  constructor(private readonly config: ConfigService) {
    this.TOPIC_LOCK_COMMAND = config.get('MQTT_TOPIC_LOCK_COMMAND', 'fechadura/comando');
    this.TOPIC_LOCK_STATUS  = config.get('MQTT_TOPIC_LOCK_STATUS',  'fechadura/status');
    this.TOPIC_NFC          = config.get('MQTT_TOPIC_NFC',          'fechadura/nfc');
    this.TOPIC_FACE         = config.get('MQTT_TOPIC_FACE',         'fechadura/face');
  }

  onModuleInit() {
    const host     = this.config.get('MQTT_HOST', 'localhost');
    const port     = this.config.get<number>('MQTT_PORT', 1883);
    const clientId = this.config.get('MQTT_CLIENT_ID', 'smart-lock-backend');
    const username = this.config.get('MQTT_USERNAME');
    const password = this.config.get('MQTT_PASSWORD');

    this.client = mqtt.connect(`mqtt://${host}:${port}`, {
      clientId,
      username: username || undefined,
      password: password || undefined,
      reconnectPeriod: 5000,
      connectTimeout: 10000,
      clean: true,
    });

    this.client.on('connect', () => {
      this.logger.log(`✅ MQTT conectado em ${host}:${port}`);
      // Re-inscrever em todos os tópicos com handlers registrados
      for (const topic of this.handlers.keys()) {
        this.client.subscribe(topic, { qos: 1 }, (err) => {
          if (err) this.logger.error(`Erro ao subscrever ${topic}: ${err.message}`);
          else this.logger.log(`📡 Subscrito em: ${topic}`);
        });
      }
    });

    this.client.on('message', (topic: string, buffer: Buffer) => {
      const payload = buffer.toString();
      this.logger.debug(`📨 [${topic}] ${payload}`);
      const topicHandlers = this.handlers.get(topic) ?? [];
      topicHandlers.forEach((fn) => {
        try { fn(payload); }
        catch (e) { this.logger.error(`Erro no handler do tópico ${topic}: ${e.message}`); }
      });
    });

    this.client.on('error', (err) => {
      this.logger.error(`MQTT error: ${err.message}`);
    });

    this.client.on('reconnect', () => {
      this.logger.warn('🔄 MQTT reconectando...');
    });

    this.client.on('offline', () => {
      this.logger.warn('⚠️ MQTT offline');
    });
  }

  onModuleDestroy() {
    if (this.client) {
      this.client.end();
      this.logger.log('MQTT desconectado');
    }
  }

  // ── Publicar mensagem ─────────────────────────────────────────────

  publish(topic: string, payload: object | string, qos: 0 | 1 | 2 = 1): void {
    const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
    this.client.publish(topic, message, { qos }, (err) => {
      if (err) this.logger.error(`Erro ao publicar em ${topic}: ${err.message}`);
      else this.logger.debug(`📤 [${topic}] ${message}`);
    });
  }

  // ── Subscrever em tópico ──────────────────────────────────────────

  subscribe(topic: string, handler: MqttTopicHandler): void {
    if (!this.handlers.has(topic)) {
      this.handlers.set(topic, []);
      // Se já conectado, inscrever imediatamente
      if (this.client?.connected) {
        this.client.subscribe(topic, { qos: 1 }, (err) => {
          if (err) this.logger.error(`Erro ao subscrever ${topic}: ${err.message}`);
          else this.logger.log(`📡 Subscrito em: ${topic}`);
        });
      }
    }
    this.handlers.get(topic).push(handler);
  }

  // ── Comandos de fechadura ─────────────────────────────────────────

  sendOpenCommand(reason = 'app'): void {
    this.publish(this.TOPIC_LOCK_COMMAND, { action: 'open', reason, ts: Date.now() });
  }

  sendCloseCommand(): void {
    this.publish(this.TOPIC_LOCK_COMMAND, { action: 'close', ts: Date.now() });
  }

  isConnected(): boolean {
    return this.client?.connected ?? false;
  }
}
