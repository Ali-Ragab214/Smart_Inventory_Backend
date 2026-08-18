import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBadRequestResponse, ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { successResponse } from '../utils/response.util';
import { UploadsService } from './uploads.service';
import { UsersService } from '../users/users.service';

const uploadsDir = join(process.cwd(), 'uploads');
const avatarsDir = join(uploadsDir, 'avatars');

if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}

if (!existsSync(avatarsDir)) {
  mkdirSync(avatarsDir, { recursive: true });
}

@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  constructor(
    private readonly uploadsService: UploadsService,
    private readonly usersService: UsersService,
  ) {}

  @Post('avatar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upload a profile avatar' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Image file to upload as an avatar',
        },
      },
      required: ['file'],
    },
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: { type: 'string', example: '/uploads/avatars/avatar.png' },
        meta: { type: 'null', example: null },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Missing file or invalid image upload' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, avatarsDir),
        filename: (_req, file, cb) => {
          const extension = extname(file.originalname || '').toLowerCase();
          cb(null, `${randomUUID()}${extension}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype?.startsWith('image/')) {
          cb(new BadRequestException('Only image files are allowed'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async uploadAvatar(@Req() req: any, @UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const avatarUrl = this.uploadsService.avatarUrl(file.filename);
    await this.usersService.updateMe(req.user.id, { avatarUrl });
    return successResponse(avatarUrl);
  }
}
