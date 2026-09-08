import { IsIn, IsNotEmpty, IsOptional, IsObject } from 'class-validator';

export const ALLOWED_COMMANDS = [
  'PING',
  'GET_SYSTEM_INFO',
  'GET_GPU_STATUS',
  'SET_NODE_AVAILABILITY',
  'RUN_GPU_TEST',
  'START_JUPYTER_CONTAINER',
  'STOP_JUPYTER_CONTAINER',
  'GET_CONTAINER_STATUS',
] as const;

export type AllowedCommand = (typeof ALLOWED_COMMANDS)[number];

export class DispatchCommandDto {
  @IsNotEmpty()
  @IsIn(ALLOWED_COMMANDS, {
    message: `Command must be one of: ${ALLOWED_COMMANDS.join(', ')}`,
  })
  command: AllowedCommand;

  @IsOptional()
  @IsObject()
  params?: Record<string, any>;
}
