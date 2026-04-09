import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import * as tmp from 'tmp';

const execFileAsync = promisify(execFile);
const PYTHON = 'python3';
const WORKER = path.join(process.cwd(), 'scripts', 'face-worker.py');

export interface FaceMatchResult {
  matched: boolean;
  userId: string | null;
  distance: number;
  confidence: number;
}

@Injectable()
export class FaceService {
  private readonly logger = new Logger(FaceService.name);

  async onModuleInit() {
    // Verify python + face_recognition are available
    try {
      await execFileAsync(PYTHON, ['-c', 'import face_recognition; print("OK")']);
      this.logger.log('✅ Python face_recognition disponível');
    } catch (e) {
      this.logger.error(
        `Python face_recognition não encontrado. Instale: pip3 install face_recognition`,
      );
    }
  }

  async extractDescriptor(imagePath: string): Promise<Float32Array> {
    let result: any;
    try {
      const { stdout } = await execFileAsync(PYTHON, [WORKER, 'extract', imagePath], {
        timeout: 30000,
      });
      result = JSON.parse(stdout);
    } catch (e) {
      this.logger.error(`Erro ao extrair descritor: ${e.message}`);
      throw new InternalServerErrorException('Falha ao processar imagem facial');
    }

    if (result.error) {
      if (result.error.includes('No face')) {
        throw new BadRequestException(
          'Nenhum rosto detectado. Envie uma foto com rosto visível e bem iluminado.',
        );
      }
      throw new BadRequestException(result.error);
    }

    return new Float32Array(result.descriptor);
  }

  async recognize(
    imagePath: string,
    labeledDescriptors: { userId: string; descriptor: Float32Array }[],
  ): Promise<FaceMatchResult> {
    if (labeledDescriptors.length === 0) {
      return { matched: false, userId: null, distance: 1, confidence: 0 };
    }

    // Write known descriptors to a temp file
    const known = labeledDescriptors.map(({ userId, descriptor }) => ({
      userId,
      descriptor: Array.from(descriptor),
    }));
    const tmpFile = tmp.fileSync({ postfix: '.json', keep: false });
    fs.writeFileSync(tmpFile.name, JSON.stringify(known));

    let result: any;
    try {
      const { stdout } = await execFileAsync(
        PYTHON,
        [WORKER, 'compare', imagePath, tmpFile.name],
        { timeout: 30000 },
      );
      result = JSON.parse(stdout);
    } catch (e) {
      this.logger.error(`Erro ao reconhecer rosto: ${e.message}`);
      throw new InternalServerErrorException('Falha ao processar reconhecimento facial');
    } finally {
      tmpFile.removeCallback();
    }

    if (result.error && result.error.includes('No face')) {
      return { matched: false, userId: null, distance: 1, confidence: 0 };
    }

    return {
      matched: result.matched || false,
      userId: result.userId || null,
      distance: result.distance ?? 1,
      confidence: result.confidence ?? 0,
    };
  }
}
