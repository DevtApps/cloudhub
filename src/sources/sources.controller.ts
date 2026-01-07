import { Controller, Get, Post, Body, Patch, Param, Delete, Put } from '@nestjs/common';
import { SourcesService } from './sources.service';
import { CreateSourceDto } from './dto/create-source.dto';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('sources')
@Controller('sources')
export class SourcesController {
  constructor(private readonly sourcesService: SourcesService) {}

  @Post()
  create(@Body() createSourceDto: CreateSourceDto) {
    return this.sourcesService.create(createSourceDto);
  }

  @Get()
  findAll() {
    return this.sourcesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.sourcesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: any) {
    return this.sourcesService.update(id, updateDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.sourcesService.remove(id);
  }

  @Post(':id/toggle')
  toggle(@Param('id') id: string) {
      return this.sourcesService.toggle(id);
  }

  @Post(':id/restart')
  restart(@Param('id') id: string) {
      return this.sourcesService.restart(id);
  }

  @Post('restart')
  restartAll() {
      return this.sourcesService.restartAll();
  }
}

