import {
  Injectable,
  Logger,
  OnModuleInit,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { canvas, faceapi, faceDetectionNet, faceDetectionOptions } from './face-api-setup';
import * as path from 'path';
import * as fs from 'fs';

const FACE_MATCH_THRESHOLD = 0.55;

export interface FaceMatchResult {
  matched: boolean;
  userId: string | null;
  distance: number;
  confidence: number;
}

@Injectable()
export class FaceService implements OnModuleInit {
  private readonly logger = new Logger(FaceService.name);
  private modelsLoaded = false;

  async onModuleInit() {
    await this.loadModels();
  }

  private async loadModels(): Promise<void> {
    const modelsPath = path.join(process.cwd(), 'models');

    if (!fs.existsSync(modelsPath)) {
      this.logger.error(
        `Diretório de modelos não encontrado: ${modelsPath}\n` +
        `Execute: node scripts/download-models.js`,
      );
      return;
    }

    try {
      await faceDetectionNet.loadFromDisk(modelsPath);
      await faceapi.nets.faceLandmark68Net.loadFromDisk(modelsPath);
      await faceapi.nets.faceRecognitionNet.loadFromDisk(modelsPath);
      this.modelsLoaded = true;
      this.logger.log('✅ Modelos face-api carregados');
    } catch (e) {
      this.logger.error(`Falha ao carregar modelos: ${e.message}`);
    }
  }

  private ensureModels(): void {
    if (!this.modelsLoaded) {
      throw new InternalServerErrorException(
        'Modelos não carregados. Execute: node scripts/download-models.js',
      );
    }
  }

  async extractDescriptor(imagePath: string): Promise<Float32Array> {
    this.ensureModels();

    let img: any;
    try {
      img = await (canvas as any).loadImage(imagePath);
    } catch {
      throw new BadRequestException('Não foi possível abrir a imagem');
    }

    const detection = await faceapi
      .detectSingleFace(img, faceDetectionOptions)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      throw new BadRequestException(
        'Nenhum rosto detectado. Envie uma foto com rosto visível e bem iluminado.',
      );
    }

    return detection.descriptor;
  }

  async recognize(
    imagePath: string,
    labeledDescriptors: { userId: string; descriptor: Float32Array }[],
  ): Promise<FaceMatchResult> {
    this.ensureModels();

    if (labeledDescriptors.length === 0) {
      return { matched: false, userId: null, distance: 1, confidence: 0 };
    }

    let img: any;
    try {
      img = await (canvas as any).loadImage(imagePath);
    } catch {
      throw new BadRequestException('Não foi possível processar a imagem');
    }

    const detection = await faceapi
      .detectSingleFace(img, faceDetectionOptions)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      return { matched: false, userId: null, distance: 1, confidence: 0 };
    }

    const labeled = labeledDescriptors.map(
      ({ userId, descriptor }) =>
        new faceapi.LabeledFaceDescriptors(userId, [descriptor]),
    );

    const matcher = new faceapi.FaceMatcher(labeled, FACE_MATCH_THRESHOLD);
    const best = matcher.findBestMatch(detection.descriptor);

    const matched = best.label !== 'unknown';
    const confidence = matched
      ? Math.max(0, 1 - best.distance / FACE_MATCH_THRESHOLD)
      : 0;

    return {
      matched,
      userId: matched ? best.label : null,
      distance: best.distance,
      confidence: parseFloat(confidence.toFixed(4)),
    };
  }
}
