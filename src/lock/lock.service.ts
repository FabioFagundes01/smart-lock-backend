import {
  Injectable,
  Logger,
  OnModuleInit,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MqttService } from '../mqtt/mqtt.service';
import { UsersService } from '../users/users.service';
import { FaceService } from '../face/face.service';
import { AccessLog, AccessMethod, AccessResult } from './entities/access-log.entity';

@Injectable()
export class LockService implements OnModuleInit {
  private readonly logger = new Logger(LockService.name);

  constructor(
    @InjectRepository(AccessLog)
    private readonly logRepo: Repository<AccessLog>,
    private readonly mqttService: MqttService,
    private readonly usersService: UsersService,
    private readonly faceService: FaceService,
  ) {}

  onModuleInit() {
    this.subscribeToEsp32Events();
  }

  // ── Ouvir eventos que chegam do ESP32 via MQTT ────────────────────

  private subscribeToEsp32Events(): void {
    // ESP32 publica NFC uid lido
    this.mqttService.subscribe(this.mqttService.TOPIC_NFC, async (payload) => {
      try {
        const data = JSON.parse(payload) as { uid: string };
        this.logger.log(`📱 NFC recebido do ESP32: ${data.uid}`);
        await this.authenticateByNfc(data.uid, null);
      } catch (e) {
        this.logger.error(`Payload NFC inválido: ${e.message}`);
      }
    });

    // ESP32 publica status atual da fechadura
    this.mqttService.subscribe(this.mqttService.TOPIC_LOCK_STATUS, (payload) => {
      this.logger.log(`🔒 Status da fechadura: ${payload}`);
    });
  }

  // ── Autenticação por NFC ──────────────────────────────────────────

  async authenticateByNfc(nfcUid: string, ip: string | null): Promise<AccessLog> {
    const user = await this.usersService.findByNfcUid(nfcUid);

    if (!user) {
      this.logger.warn(`NFC UID desconhecido: ${nfcUid}`);
      const log = await this.saveLog({
        method: AccessMethod.NFC,
        result: AccessResult.DENIED,
        userId: null,
        nfcUidUsed: nfcUid,
        ip,
        details: 'UID não cadastrado',
      });
      // Notificar ESP32 que foi negado
      this.mqttService.publish(this.mqttService.TOPIC_LOCK_COMMAND, {
        action: 'denied',
        reason: 'nfc_unknown',
        ts: Date.now(),
      });
      return log;
    }

    this.logger.log(`✅ Acesso NFC concedido para: ${user.name}`);
    const log = await this.saveLog({
      method: AccessMethod.NFC,
      result: AccessResult.GRANTED,
      userId: user.id,
      nfcUidUsed: nfcUid,
      ip,
    });

    this.mqttService.sendOpenCommand('nfc');
    return log;
  }

  // ── Autenticação por reconhecimento facial ────────────────────────

  async authenticateByFace(imagePath: string, ip: string | null): Promise<{
    log: AccessLog;
    userId: string | null;
    confidence: number;
  }> {
    // Buscar todos os usuários com rosto cadastrado
    const usersWithFace = await this.usersService.getAllWithFaceDescriptor();

    if (usersWithFace.length === 0) {
      throw new NotFoundException('Nenhum usuário com rosto cadastrado');
    }

    const labeledDescriptors = usersWithFace
      .map((u) => {
        const descriptor = u.getFaceDescriptorArray();
        return descriptor ? { userId: u.id, descriptor } : null;
      })
      .filter(Boolean);

    const result = await this.faceService.recognize(imagePath, labeledDescriptors);

    const accessResult = result.matched ? AccessResult.GRANTED : AccessResult.DENIED;

    const log = await this.saveLog({
      method: AccessMethod.FACE,
      result: accessResult,
      userId: result.userId,
      ip,
      faceConfidence: result.confidence,
      details: `Distância: ${result.distance.toFixed(4)}`,
    });

    if (result.matched) {
      const user = usersWithFace.find((u) => u.id === result.userId);
      this.logger.log(
        `✅ Rosto reconhecido: ${user?.name} (confiança: ${(result.confidence * 100).toFixed(1)}%)`,
      );
      this.mqttService.sendOpenCommand('face');
    } else {
      this.logger.warn(`❌ Rosto não reconhecido (distância: ${result.distance.toFixed(4)})`);
      this.mqttService.publish(this.mqttService.TOPIC_LOCK_COMMAND, {
        action: 'denied',
        reason: 'face_not_recognized',
        ts: Date.now(),
      });
    }

    return { log, userId: result.userId, confidence: result.confidence };
  }

  // ── Abrir pelo app (via JWT) ──────────────────────────────────────

  async openByApp(userId: string, ip: string | null): Promise<AccessLog> {
    const user = await this.usersService.findOne(userId);
    if (!user) throw new NotFoundException('Usuário não encontrado');

    this.logger.log(`📲 Abertura via app: ${user.name}`);
    const log = await this.saveLog({
      method: AccessMethod.APP,
      result: AccessResult.GRANTED,
      userId,
      ip,
    });

    this.mqttService.sendOpenCommand('app');
    return log;
  }

  // ── Fechar pelo app ───────────────────────────────────────────────

  closeLock(): void {
    this.mqttService.sendCloseCommand();
    this.logger.log('🔒 Comando de fechar enviado');
  }

  // ── Comandos diretos (sem log/auth) ──────────────────────────────

  sendUnlockCommand(): void {
    this.mqttService.sendOpenCommand('http_get');
    this.logger.log('🔓 Comando de abrir enviado via GET');
  }

  sendLockCommand(): void {
    this.mqttService.sendCloseCommand();
    this.logger.log('🔒 Comando de fechar enviado via GET');
  }

  sendDeniedCommand(): void {
    this.mqttService.publish(this.mqttService.TOPIC_LOCK_COMMAND, {
      action: 'denied',
      reason: 'http_get',
      ts: Date.now(),
    });
    this.logger.log('🚫 Comando de acesso negado enviado via GET');
  }

  // ── Histórico de acessos ──────────────────────────────────────────

  async getLogs(limit = 50): Promise<AccessLog[]> {
    return this.logRepo.find({
      relations: ['user'],
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getLogsByUser(userId: string, limit = 30): Promise<AccessLog[]> {
    return this.logRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  // ── Status do sistema ─────────────────────────────────────────────

  getSystemStatus() {
    return {
      mqtt: this.mqttService.isConnected(),
      ts: new Date().toISOString(),
    };
  }

  // ── Auxiliar: salvar log ──────────────────────────────────────────

  private async saveLog(data: {
    method: AccessMethod;
    result: AccessResult;
    userId: string | null;
    nfcUidUsed?: string;
    faceConfidence?: number;
    ip?: string | null;
    details?: string;
  }): Promise<AccessLog> {
    const log = this.logRepo.create({
      accessMethod: data.method,
      result: data.result,
      userId: data.userId,
      nfcUidUsed: data.nfcUidUsed ?? null,
      faceConfidence: data.faceConfidence ?? null,
      ip: data.ip ?? null,
      details: data.details ?? null,
    });
    return this.logRepo.save(log);
  }
}
