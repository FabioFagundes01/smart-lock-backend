import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './entities/user.entity';
import { CreateUserDto, UpdateUserDto, AssignNfcDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    // Verificar email duplicado
    const existing = await this.userRepo.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('E-mail já cadastrado');
    }

    // Verificar NFC duplicado
    if (dto.nfcUid) {
      const nfcExists = await this.userRepo.findOne({ where: { nfcUid: dto.nfcUid } });
      if (nfcExists) {
        throw new ConflictException('UID NFC já cadastrado para outro usuário');
      }
    }

    const hashed = await bcrypt.hash(dto.password, 12);
    const user = this.userRepo.create({
      ...dto,
      password: hashed,
    });

    return this.userRepo.save(user);
  }

  async findAll(): Promise<User[]> {
    return this.userRepo.find({
      select: ['id', 'name', 'email', 'role', 'nfcUid', 'facePhotoPath', 'isActive', 'createdAt'],
    });
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { email } });
  }

  async findByNfcUid(nfcUid: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { nfcUid, isActive: true } });
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    if (dto.email && dto.email !== user.email) {
      const exists = await this.userRepo.findOne({ where: { email: dto.email } });
      if (exists) throw new ConflictException('E-mail já em uso');
    }

    if (dto.nfcUid && dto.nfcUid !== user.nfcUid) {
      const exists = await this.userRepo.findOne({ where: { nfcUid: dto.nfcUid } });
      if (exists) throw new ConflictException('UID NFC já em uso');
    }

    if (dto.password) {
      dto.password = await bcrypt.hash(dto.password, 12);
    }

    Object.assign(user, dto);
    return this.userRepo.save(user);
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    await this.userRepo.remove(user);
  }

  async assignNfc(id: string, dto: AssignNfcDto): Promise<User> {
    const user = await this.findOne(id);

    // Verificar se NFC está em uso por outro usuário
    const exists = await this.userRepo.findOne({ where: { nfcUid: dto.nfcUid } });
    if (exists && exists.id !== id) {
      throw new ConflictException('UID NFC já cadastrado para outro usuário');
    }

    user.nfcUid = dto.nfcUid;
    return this.userRepo.save(user);
  }

  async removeNfc(id: string): Promise<User> {
    const user = await this.findOne(id);
    user.nfcUid = null;
    return this.userRepo.save(user);
  }

  async saveFaceDescriptor(
    id: string,
    photoPath: string,
    descriptor: Float32Array,
  ): Promise<User> {
    const user = await this.findOne(id);
    user.facePhotoPath = photoPath;
    user.faceDescriptor = JSON.stringify(Array.from(descriptor));
    return this.userRepo.save(user);
  }

  async getAllWithFaceDescriptor(): Promise<User[]> {
    return this.userRepo
      .createQueryBuilder('user')
      .where('user.faceDescriptor IS NOT NULL')
      .andWhere('user.isActive = true')
      .getMany();
  }

  async setActive(id: string, isActive: boolean): Promise<User> {
    const user = await this.findOne(id);
    user.isActive = isActive;
    return this.userRepo.save(user);
  }
}
