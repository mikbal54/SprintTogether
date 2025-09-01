import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SprintService } from './sprint.service.js';

@Controller('sprint')
@UseGuards(AuthGuard('jwt'))
export class SprintController {
  constructor(private readonly sprintService: SprintService) {}

  @Get('get_all')
  getAll() {
    return this.sprintService.getAll();
  }
}



