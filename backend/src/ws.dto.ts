import { ApiProperty } from '@nestjs/swagger';

export class OnlineUserDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: [String] })
  socketIds: string[];
}

export class OnlineUsersResponseDto {
  @ApiProperty({ type: [OnlineUserDto] })
  users: OnlineUserDto[];

  @ApiProperty()
  count: number;
}

export class TaskGetByIndexDto {
  @ApiProperty()
  sprintId: string;

  @ApiProperty({ required: false, default: 0 })
  index?: number;

  @ApiProperty({ required: false, default: 5 })
  limit?: number;

  @ApiProperty({ required: false, default: true })
  isForward?: boolean;
}

export class TaskGetByIndexResponseDto {
  @ApiProperty()
  sprintId: string;

  @ApiProperty({ type: 'array' })
  tasks: any[];

  @ApiProperty()
  pagination: {
    total: number;
    currentIndex: number;
    startIndex: number;
    endIndex: number;
    hasNext: boolean;
    hasPrev: boolean;
    limit: number;
  };
}

export class TaskGetChildrenDto {
  @ApiProperty()
  taskId: string;
}

export class TaskSetStatusDto {
  @ApiProperty()
  taskId: string;

  @ApiProperty()
  status: string;
}

export class SprintCreateDto {
  @ApiProperty()
  name: string;

  @ApiProperty({ required: false })
  description?: string;
}

export class TaskCreateDto {
  @ApiProperty()
  sprintId: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ required: false })
  description?: string;

  @ApiProperty({ required: false })
  parentId?: string;
}

export class TaskChangeAssigneeDto {
  @ApiProperty()
  taskId: string;

  @ApiProperty()
  assigneeId: string;
}

export class SprintSetStatusDto {
  @ApiProperty()
  sprintId: string;

  @ApiProperty()
  status: string;
}

export class SprintChangeDescriptionDto {
  @ApiProperty()
  sprintId: string;

  @ApiProperty()
  description: string;
}

export class SprintChangeNameDto {
  @ApiProperty()
  sprintId: string;

  @ApiProperty()
  name: string;
}

export class TaskChangeDescriptionDto {
  @ApiProperty()
  taskId: string;

  @ApiProperty()
  description: string;
}

export class TaskChangeNameDto {
  @ApiProperty()
  taskId: string;

  @ApiProperty()
  name: string;
}

export class TaskRequestDeleteDto {
  @ApiProperty()
  taskId: string;
}

export class SprintRequestDeleteDto {
  @ApiProperty()
  sprintId: string;
}

export class UserPresenceDto {
  @ApiProperty()
  status: 'online' | 'away' | 'offline';
}

export class TaskGetChildrenByIndexDto {
  @ApiProperty()
  taskId: string;

  @ApiProperty({ required: false, default: 0 })
  index?: number;

  @ApiProperty({ required: false, default: 5 })
  limit?: number;

  @ApiProperty({ required: false, default: true })
  isForward?: boolean;
}
