import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../users/entities/user.entity';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (!user || user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Apenas administradores podem realizar esta ação');
    }
    return true;
  }
}
