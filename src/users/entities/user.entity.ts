import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Exclude } from 'class-transformer';

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ unique: true, length: 150 })
  email: string;

  @Column()
  @Exclude() // Nunca retornar senha na resposta
  password: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.USER,
  })
  role: UserRole;

  // Tag NFC atrelada ao usuário (uid do cartão/celular via NFC)
  @Column({ nullable: true, unique: true, length: 50, name: 'nfc_uid' })
  nfcUid: string | null;

  // Caminho da foto cadastrada para reconhecimento facial
  @Column({ nullable: true, name: 'face_photo_path' })
  facePhotoPath: string | null;

  // Descritor facial (vetor de 128 floats do face-api.js) serializado em JSON
  @Column({ type: 'text', nullable: true, name: 'face_descriptor' })
  faceDescriptor: string | null;

  @Column({ default: true, name: 'is_active' })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Método utilitário: retorna o descritor como Float32Array
  getFaceDescriptorArray(): Float32Array | null {
    if (!this.faceDescriptor) return null;
    const arr = JSON.parse(this.faceDescriptor) as number[];
    return new Float32Array(arr);
  }
}
