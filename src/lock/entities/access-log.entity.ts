import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum AccessMethod {
  NFC = 'nfc',
  FACE = 'face',
  APP = 'app',
}

export enum AccessResult {
  GRANTED = 'granted',
  DENIED = 'denied',
}

@Entity('access_logs')
export class AccessLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Column({ nullable: true, name: 'user_id' })
  userId: string | null;

  @Column({
    type: 'enum',
    enum: AccessMethod,
    name: 'access_method',
  })
  accessMethod: AccessMethod;

  @Column({
    type: 'enum',
    enum: AccessResult,
  })
  result: AccessResult;

  // Para NFC: uid utilizado na tentativa
  @Column({ nullable: true, length: 50, name: 'nfc_uid_used' })
  nfcUidUsed: string | null;

  // Confiança do reconhecimento facial (0.0 a 1.0)
  @Column({ type: 'float', nullable: true, name: 'face_confidence' })
  faceConfidence: number | null;

  @Column({ nullable: true, length: 45 })
  ip: string | null;

  @Column({ type: 'text', nullable: true })
  details: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
