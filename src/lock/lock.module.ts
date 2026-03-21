import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LockService } from './lock.service';
import { LockController } from './lock.controller';
import { AccessLog } from './entities/access-log.entity';
import { UsersModule } from '../users/users.module';
import { FaceModule } from '../face/face.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AccessLog]),
    UsersModule,
    FaceModule,
  ],
  providers: [LockService],
  controllers: [LockController],
})
export class LockModule {}
