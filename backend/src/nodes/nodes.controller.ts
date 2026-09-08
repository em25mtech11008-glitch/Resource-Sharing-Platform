import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  NotFoundException,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { NodesService } from './nodes.service';
import { NodesGateway } from './nodes.gateway';
import { DispatchCommandDto, ALLOWED_COMMANDS } from './dto/command.dto';

@Controller('api/nodes')
export class NodesController {
  constructor(
    private readonly nodesService: NodesService,
    private readonly nodesGateway: NodesGateway,
  ) {}

  @Get()
  async getNodesOverview() {
    const overview = await this.nodesService.getAllNodesOverview();
    // Add real-time connection status flag
    const nodesWithConnection = overview.nodes.map((node) => ({
      ...node,
      isWsConnected: this.nodesGateway.isNodeConnected(node.node_id),
    }));

    return {
      summary: overview.summary,
      nodes: nodesWithConnection,
    };
  }

  @Get(':nodeId')
  async getNodeDetails(@Param('nodeId') nodeId: string) {
    const details = await this.nodesService.getNodeDetails(nodeId);
    if (!details) {
      throw new NotFoundException(`Node with ID ${nodeId} not found`);
    }

    return {
      ...details,
      isWsConnected: this.nodesGateway.isNodeConnected(nodeId),
    };
  }

  @Post(':nodeId/command')
  @HttpCode(HttpStatus.OK)
  async dispatchCommand(
    @Param('nodeId') nodeId: string,
    @Body() body: DispatchCommandDto,
  ) {
    const { command, params } = body;

    // Security check: Must be in allowlist
    if (!ALLOWED_COMMANDS.includes(command)) {
      throw new BadRequestException(
        `Command '${command}' is rejected. Allowed commands: ${ALLOWED_COMMANDS.join(', ')}`,
      );
    }

    const isConnected = this.nodesGateway.isNodeConnected(nodeId);
    if (!isConnected) {
      throw new BadRequestException(
        `Node '${nodeId}' is currently offline or disconnected from WebSocket.`,
      );
    }

    try {
      const result = await this.nodesGateway.dispatchCommand(
        nodeId,
        command,
        params,
      );
      return {
        success: true,
        command,
        nodeId,
        result,
      };
    } catch (err) {
      throw new BadRequestException(`Command execution failed: ${err.message}`);
    }
  }

  @Get(':nodeId/events')
  async getNodeEvents(
    @Param('nodeId') nodeId: string,
    @Query('limit') limit = 50,
  ) {
    return this.nodesService.getNodeEvents(nodeId, Number(limit));
  }

  @Get(':nodeId/metrics')
  async getNodeMetrics(
    @Param('nodeId') nodeId: string,
    @Query('limit') limit = 100,
  ) {
    return this.nodesService.getNodeMetrics(nodeId, Number(limit));
  }
}
