import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Request,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  Optional,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import * as tmp from 'tmp';
import * as fs from 'fs';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { LockService } from './lock.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

class NfcAuthDto {
  @ApiProperty({ example: '04:A1:B2:C3:D4:E5' })
  @IsString()
  @IsNotEmpty()
  uid: string;
}

@ApiTags('Fechadura')
@Controller('lock')
export class LockController {
  constructor(private readonly lockService: LockService) {}

  // ── Abrir via app (requer JWT) ────────────────────────────────────

  @Post('open')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Abrir a fechadura pelo app' })
  openByApp(@Request() req: any) {
    const ip = req.ip ?? null;
    return this.lockService.openByApp(req.user.id, ip);
  }

  // ── Fechar via app ────────────────────────────────────────────────

  @Post('close')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Fechar a fechadura pelo app' })
  closeLock() {
    this.lockService.closeLock();
  }

  // ── Autenticação NFC via HTTP (ESP32 pode chamar diretamente) ─────

  @Post('auth/nfc')
  @ApiOperation({ summary: 'Autenticar por NFC (chamado pelo ESP32 ou app)' })
  authByNfc(@Body() dto: NfcAuthDto, @Request() req: any) {
    return this.lockService.authenticateByNfc(dto.uid, req.ip ?? null);
  }

  // ── Autenticação facial via upload ────────────────────────────────

  @Post('auth/face')
  @ApiOperation({ summary: 'Autenticar por reconhecimento facial' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { photo: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(), // Buffer em memória para evitar lixo em disco
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png)$/)) {
          cb(new Error('Apenas JPG/PNG aceitos'), false);
        } else {
          cb(null, true);
        }
      },
    }),
  )
  async authByFace(@UploadedFile() file: Express.Multer.File, @Request() req: any) {
    // Salvar buffer em arquivo temporário para o face-api.js processar
    const tmpFile = tmp.fileSync({ postfix: '.jpg', keep: false });
    fs.writeFileSync(tmpFile.name, file.buffer);

    try {
      const result = await this.lockService.authenticateByFace(tmpFile.name, req.ip ?? null);
      return {
        matched: result.log.result === 'granted',
        userId: result.userId,
        confidence: result.confidence,
        logId: result.log.id,
      };
    } finally {
      fs.unlinkSync(tmpFile.name);
    }
  }

  // ── Status do sistema ─────────────────────────────────────────────

  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Status do sistema (MQTT conectado, etc.)' })
  status() {
    return this.lockService.getSystemStatus();
  }

  // ── Histórico de acessos ──────────────────────────────────────────

  @Get('logs')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Histórico de todos os acessos (admin)' })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  getLogs(@Query('limit') limit?: string) {
    return this.lockService.getLogs(limit ? parseInt(limit) : 50);
  }

  @Get('logs/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Meu histórico de acessos' })
  @ApiQuery({ name: 'limit', required: false, example: 30 })
  getMyLogs(@Request() req: any, @Query('limit') limit?: string) {
    return this.lockService.getLogsByUser(req.user.id, limit ? parseInt(limit) : 30);
  }
}
