import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Injectable, Logger } from '@nestjs/common';
import { Server, WebSocket } from 'ws';
import { NodesService } from './nodes.service';
import { ALLOWED_COMMANDS, AllowedCommand } from './dto/command.dto';
import { v4 as uuidv4 } from 'uuid';

interface PendingCommand {
  commandId: string;
  nodeId: string;
  command: string;
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  timer: NodeJS.Timeout;
}

@Injectable()
@WebSocketGateway()
export class NodesGateway
  implements OnGatewayConnection<WebSocket>, OnGatewayDisconnect<WebSocket>
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NodesGateway.name);

  // Active Node Agent WebSockets (node_id -> WebSocket)
  private readonly agentSockets = new Map<string, WebSocket>();
  // Reverse lookup (WebSocket -> node_id)
  private readonly socketToNodeId = new Map<WebSocket, string>();
  // Connected dashboard WebSockets
  private readonly dashboardSockets = new Set<WebSocket>();
  // Pending commands awaiting agent response (commandId -> PendingCommand)
  private readonly pendingCommands = new Map<string, PendingCommand>();

  constructor(private readonly nodesService: NodesService) {}

  handleConnection(client: WebSocket, ...args: any[]) {
    this.logger.log('New WebSocket connection established');

    client.on('message', async (rawData) => {
      await this.handleRawMessage(client, rawData);
    });

    client.on('close', async (code, reason) => {
      this.logger.log(`WebSocket closed: code ${code}, reason: ${reason}`);
      await this.handleDisconnect(client);
    });

    client.on('error', (err) => {
      this.logger.error(`WebSocket error: ${err.message}`);
    });
  }

  async handleDisconnect(client: WebSocket) {
    if (this.dashboardSockets.has(client)) {
      this.dashboardSockets.delete(client);
      this.logger.log('Dashboard WebSocket disconnected');
      return;
    }

    const nodeId = this.socketToNodeId.get(client);
    if (nodeId) {
      this.logger.warn(
        `Agent WebSocket disconnected for node ${nodeId}. Starting grace period / marking offline.`,
      );
      this.agentSockets.delete(nodeId);
      this.socketToNodeId.delete(client);

      await this.nodesService.markNodeOffline(
        nodeId,
        'Agent WebSocket connection closed',
      );
      this.broadcastToDashboards({
        type: 'NODE_OFFLINE',
        payload: { nodeId, reason: 'Agent WebSocket disconnected' },
      });
    }
  }

  @SubscribeMessage('message')
  async handleRawMessage(client: WebSocket, data: any) {
    try {
      let message = data;
      if (typeof data === 'string' || Buffer.isBuffer(data)) {
        message = JSON.parse(data.toString());
      }

      if (!message || typeof message !== 'object') {
        this.logger.warn('Received invalid non-object message');
        return;
      }

      const { type, payload } = message;

      switch (type) {
        case 'DASHBOARD_SUBSCRIBE':
          this.dashboardSockets.add(client);
          this.logger.log('Dashboard client subscribed to live updates');
          client.send(
            JSON.stringify({
              type: 'DASHBOARD_SUBSCRIBED',
              payload: { message: 'Subscribed to live platform telemetry' },
            }),
          );
          break;

        case 'NODE_REGISTER':
          await this.handleNodeRegister(client, payload);
          break;

        case 'HEARTBEAT':
          await this.handleHeartbeat(client, payload);
          break;

        case 'GPU_STATUS':
          await this.handleGpuStatus(client, payload);
          break;

        case 'COMMAND_RESULT':
          await this.handleCommandResult(client, payload);
          break;

        case 'GPU_TEST_RESULT':
          await this.handleGpuTestResult(client, payload);
          break;

        case 'NODE_EVENT':
          await this.handleNodeEvent(client, payload);
          break;

        default:
          this.logger.warn(`Unknown message type received: ${type}`);
          client.send(
            JSON.stringify({
              type: 'ERROR',
              payload: { error: `Unrecognized message type: ${type}` },
            }),
          );
          break;
      }
    } catch (err) {
      this.logger.error(`Error processing message: ${err.message}`, err.stack);
      try {
        client.send(
          JSON.stringify({
            type: 'ERROR',
            payload: { error: 'Invalid message payload or parsing error' },
          }),
        );
      } catch (_) {}
    }
  }

  private async handleNodeRegister(client: WebSocket, payload: any) {
    if (!payload?.node_id) {
      client.send(
        JSON.stringify({
          type: 'ERROR',
          payload: { error: 'node_id is required for NODE_REGISTER' },
        }),
      );
      return;
    }

    const { node_id } = payload;
    this.agentSockets.set(node_id, client);
    this.socketToNodeId.set(client, node_id);

    const updatedNode = await this.nodesService.registerNode(payload);

    client.send(
      JSON.stringify({
        type: 'NODE_REGISTER_ACK',
        payload: {
          node_id,
          status: 'REGISTERED',
          timestamp: new Date().toISOString(),
        },
      }),
    );

    this.broadcastToDashboards({
      type: 'NODE_REGISTERED',
      payload: updatedNode,
    });
  }

  private async handleHeartbeat(client: WebSocket, payload: any) {
    const nodeId = payload?.node_id || this.socketToNodeId.get(client);
    if (!nodeId) return;

    if (!this.agentSockets.has(nodeId)) {
      this.agentSockets.set(nodeId, client);
      this.socketToNodeId.set(client, nodeId);
    }

    await this.nodesService.updateHeartbeat(nodeId);

    client.send(
      JSON.stringify({
        type: 'HEARTBEAT_ACK',
        payload: {
          node_id: nodeId,
          timestamp: new Date().toISOString(),
        },
      }),
    );
  }

  private async handleGpuStatus(client: WebSocket, payload: any) {
    const nodeId = payload?.node_id || this.socketToNodeId.get(client);
    if (!nodeId || !payload?.gpus) return;

    await this.nodesService.saveGpuMetrics(nodeId, payload.gpus);

    this.broadcastToDashboards({
      type: 'GPU_METRICS_UPDATED',
      payload: {
        node_id: nodeId,
        gpus: payload.gpus,
        timestamp: new Date().toISOString(),
      },
    });
  }

  private async handleCommandResult(client: WebSocket, payload: any) {
    const { commandId, status, output, error, node_id } = payload || {};
    const nodeId = node_id || this.socketToNodeId.get(client);

    this.logger.log(
      `Received COMMAND_RESULT for ${commandId} from node ${nodeId}: ${status}`,
    );

    await this.nodesService.logEvent(
      nodeId || 'unknown',
      'COMMAND_RESULT',
      `Command completed with status: ${status}`,
      payload,
    );

    this.broadcastToDashboards({
      type: 'COMMAND_RESULT_EVENT',
      payload,
    });

    if (commandId && this.pendingCommands.has(commandId)) {
      const pending = this.pendingCommands.get(commandId);
      clearTimeout(pending.timer);
      this.pendingCommands.delete(commandId);
      pending.resolve(payload);
    }
  }

  private async handleGpuTestResult(client: WebSocket, payload: any) {
    const { commandId, status, results, error, node_id } = payload || {};
    const nodeId = node_id || this.socketToNodeId.get(client);

    this.logger.log(
      `Received GPU_TEST_RESULT for ${commandId} from node ${nodeId}: ${status}`,
    );

    await this.nodesService.logEvent(
      nodeId || 'unknown',
      'GPU_TEST_RESULT',
      `GPU test completed with status: ${status}`,
      payload,
    );

    this.broadcastToDashboards({
      type: 'GPU_TEST_RESULT_EVENT',
      payload,
    });

    if (commandId && this.pendingCommands.has(commandId)) {
      const pending = this.pendingCommands.get(commandId);
      clearTimeout(pending.timer);
      this.pendingCommands.delete(commandId);
      pending.resolve(payload);
    }
  }

  private async handleNodeEvent(client: WebSocket, payload: any) {
    const nodeId = payload?.node_id || this.socketToNodeId.get(client);
    if (!nodeId) return;

    await this.nodesService.logEvent(
      nodeId,
      payload.event_type || 'AGENT_EVENT',
      payload.message || '',
      payload.metadata,
    );

    this.broadcastToDashboards({
      type: 'NODE_EVENT',
      payload: {
        node_id: nodeId,
        event_type: payload.event_type,
        message: payload.message,
        timestamp: new Date().toISOString(),
      },
    });
  }

  async dispatchCommand(
    nodeId: string,
    command: AllowedCommand,
    params: Record<string, any> = {},
  ): Promise<any> {
    if (!ALLOWED_COMMANDS.includes(command)) {
      throw new Error(
        `Command '${command}' is rejected: Not in predefined allowlist.`,
      );
    }

    const socket = this.agentSockets.get(nodeId);
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error(`Node ${nodeId} is currently not connected via WebSocket.`);
    }

    const commandId = uuidv4();
    const packet = {
      type: 'COMMAND',
      commandId,
      command,
      params,
      timestamp: new Date().toISOString(),
    };

    await this.nodesService.logEvent(
      nodeId,
      'COMMAND_DISPATCH',
      `Dispatched command: ${command} (${commandId})`,
      { command, params, commandId },
    );

    const timeoutMs =
      command === 'RUN_GPU_TEST' || command === 'START_JUPYTER_CONTAINER'
        ? 60000
        : 15000;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingCommands.has(commandId)) {
          this.pendingCommands.delete(commandId);
          reject(
            new Error(
              `Command ${command} (${commandId}) timed out after ${timeoutMs / 1000}s`,
            ),
          );
        }
      }, timeoutMs);

      this.pendingCommands.set(commandId, {
        commandId,
        nodeId,
        command,
        resolve,
        reject,
        timer,
      });

      socket.send(JSON.stringify(packet));
    });
  }

  broadcastToDashboards(data: any) {
    const message = JSON.stringify(data);
    for (const client of this.dashboardSockets) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  isNodeConnected(nodeId: string): boolean {
    const socket = this.agentSockets.get(nodeId);
    return !!socket && socket.readyState === WebSocket.OPEN;
  }
}
