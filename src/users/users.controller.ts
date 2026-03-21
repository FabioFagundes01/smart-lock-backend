import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { FaceService } from '../face/face.service';
import { CreateUserDto, UpdateUserDto, AssignNfcDto } from './dto/user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

@ApiTags('Usuários')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly faceService: FaceService,
  ) {}

  // ── CRUD ─────────────────────────────────────────────────────────

  @Post()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Criar novo usuário (admin)' })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Listar todos os usuários (admin)' })
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar usuário por ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualizar usuário' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deletar usuário (admin)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.remove(id);
  }

  // ── NFC ──────────────────────────────────────────────────────────

  @Patch(':id/nfc')
  @ApiOperation({ summary: 'Vincular tag NFC ao usuário' })
  assignNfc(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignNfcDto,
  ) {
    return this.usersService.assignNfc(id, dto);
  }

  @Delete(':id/nfc')
  @ApiOperation({ summary: 'Remover NFC do usuário' })
  removeNfc(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.removeNfc(id);
  }

  // ── FOTO FACIAL ──────────────────────────────────────────────────

  @Post(':id/face')
  @ApiOperation({ summary: 'Cadastrar/atualizar foto facial do usuário' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { photo: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: diskStorage({
        destination: process.env.UPLOAD_DIR || './uploads/faces',
        filename: (_req, file, cb) => {
          cb(null, `${uuidv4()}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png)$/)) {
          cb(new Error('Apenas imagens JPG/PNG são permitidas'), false);
        } else {
          cb(null, true);
        }
      },
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    }),
  )
  async uploadFace(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    // Processar imagem e extrair descritor facial
    const descriptor = await this.faceService.extractDescriptor(file.path);
    await this.usersService.saveFaceDescriptor(id, file.path, descriptor);
    return { message: 'Foto facial cadastrada com sucesso', path: file.path };
  }

  // ── STATUS ───────────────────────────────────────────────────────

  @Patch(':id/deactivate')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Desativar usuário (admin)' })
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.setActive(id, false);
  }

  @Patch(':id/activate')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Ativar usuário (admin)' })
  activate(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.setActive(id, true);
  }
}
