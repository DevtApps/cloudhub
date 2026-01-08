import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { FilesService } from './files.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('files')
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get('list')
  async list(@Query('path') path: string) {
    return this.filesService.listDirectory(path || '');
  }

  @Get('content')
  async getContent(@Query('path') path: string) {
    return this.filesService.getFileContent(path);
  }

  @Post('save')
  async save(@Body() body: { path: string, content: string }) {
    return this.filesService.saveFileContent(body.path, body.content);
  }

  @Post('create-dir')
  async createDir(@Body() body: { path: string }) {
      return this.filesService.createDirectory(body.path);
  }

  @Post('create-file')
  async createFile(@Body() body: { path: string, content?: string }) {
      return this.filesService.createFile(body.path, body.content);
  }

  @Post('delete')
  async delete(@Body() body: { path: string }) {
      return this.filesService.delete(body.path);
  }

  @Post('rename')
  async rename(@Body() body: { oldPath: string, newPath: string }) {
      return this.filesService.rename(body.oldPath, body.newPath);
  }

  @Post('chmod')
  async chmod(@Body() body: { path: string, mode: string }) {
      return this.filesService.chmod(body.path, body.mode);
  }
}
