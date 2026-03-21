import { Module, Global } from '@nestjs/common';
import { MqttService } from './mqtt.service';

@Global() // MqttService disponível em qualquer módulo sem re-importar
@Module({
  providers: [MqttService],
  exports: [MqttService],
})
export class MqttModule {}
