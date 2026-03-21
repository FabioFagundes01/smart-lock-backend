import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/auth.dto';
import { User } from '../users/entities/user.entity';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<User> {
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new UnauthorizedException('Credenciais inválidas');
    if (!user.isActive) throw new UnauthorizedException('Usuário desativado');

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) throw new UnauthorizedException('Credenciais inválidas');

    return user;
  }

  async login(dto: LoginDto) {
    const user = await this.validateUser(dto.email, dto.password);

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        nfcUid: user.nfcUid,
        hasFace: !!user.faceDescriptor,
      },
    };
  }

  async profile(userId: string) {
    const user = await this.usersService.findOne(userId);
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      nfcUid: user.nfcUid,
      hasFace: !!user.faceDescriptor,
      facePhotoPath: user.facePhotoPath,
      isActive: user.isActive,
      createdAt: user.createdAt,
    };
  }
}
