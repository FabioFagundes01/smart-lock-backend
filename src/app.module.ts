import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { MqttModule } from './mqtt/mqtt.module';
import { LockModule } from './lock/lock.module';
import { FaceModule } from './face/face.module';
import { User } from './users/entities/user.entity';
import { AccessLog } from './lock/entities/access-log.entity';

@Module({
  imports: [
    // Configuração de variáveis de ambiente
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Banco de dados MySQL
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 3306),
        username: config.get('DB_USERNAME', 'root'),
        password: config.get('DB_PASSWORD', ''),
        database: config.get('DB_DATABASE', 'smart_lock'),
        entities: [User, AccessLog],
        synchronize: config.get('NODE_ENV') !== 'production', // Apenas em dev
        logging: config.get('NODE_ENV') === 'development',
        charset: 'utf8mb4',
      }),
    }),

    UsersModule,
    AuthModule,
    MqttModule,
    LockModule,
    FaceModule,
  ],
})
export class AppModule {}
