import { Injectable } from '@nestjs/common';

@Injectable()
export class UploadsService {
  avatarUrl(filename: string): string {
    return `/uploads/avatars/${filename}`;
  }
}
