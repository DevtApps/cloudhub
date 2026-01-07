import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ServicesManagerService } from './services-manager.service';
import { CreateServiceDto } from './dto/create-service.dto';

@Controller('services')
export class ServicesManagerController {
  constructor(private readonly servicesManager: ServicesManagerService) {}

  @Get()
  getAll() {
    return this.servicesManager.getServices();
  }

  @Get(':name')
  getOne(@Param('name') name: string) {
    return this.servicesManager.getService(name);
  }

  @Post()
  create(@Body() dto: CreateServiceDto) {
    return this.servicesManager.createService(dto);
  }

  @Put(':name')
  update(@Param('name') name: string, @Body() dto: CreateServiceDto) {
    return this.servicesManager.updateService(name, dto);
  }

  @Delete(':name')
  delete(@Param('name') name: string) {
    return this.servicesManager.deleteService(name);
  }

  @Post(':name/toggle')
  toggle(@Param('name') name: string, @Body('enable') enable: boolean) {
      return this.servicesManager.toggleService(name, enable);
  }

  @Get(':name/logs')
  logs(@Param('name') name: string) {
      return this.servicesManager.getLogs(name);
  }
}
