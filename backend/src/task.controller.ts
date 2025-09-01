import { Body, Controller, Delete, Patch, Post, UseGuards } from '@nestjs/common';
import { Get, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TaskService } from './task.service.js';

@Controller('task')
@UseGuards(AuthGuard('jwt'))
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Patch('update')
  update(@Body() body: { id: string; title?: string; hours?: number; parentId?: string | null; sprintId?: string; assignedTo?: string | null }) {
    return this.taskService.updateTask(body);
  }

  @Delete('delete')
  delete(@Body() body: { id: string }) {
    return this.taskService.deleteTask(body.id);
  }

  //TODO: add cache
  @Get('get_parent_tasks')
  getParentTasks(@Query('sprintId') sprintId: string) {
    return this.taskService.getParentTasks(sprintId);
  }
  
}


