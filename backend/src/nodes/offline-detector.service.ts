import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { NodesService } from './nodes.service';
import { NodesGateway } from './nodes.gateway';

@Injectable()
export class OfflineDetectorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OfflineDetectorService.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly sweepIntervalMs = 5000; // Check every 5s
  private readonly offlineTimeoutMs = 30000; // Offline after 30s of silence

  constructor(
    private readonly nodesService: NodesService,
    private readonly nodesGateway: NodesGateway,
  ) {}

  onModuleInit() {
    this.logger.log(
      `Starting offline detection sweep (interval: ${this.sweepIntervalMs / 1000}s, timeout: ${this.offlineTimeoutMs / 1000}s)`,
    );
    this.timer = setInterval(() => this.checkNodes(), this.sweepIntervalMs);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async checkNodes() {
    try {
      const timedOutNodeIds = await this.nodesService.checkOfflineNodes(
        this.offlineTimeoutMs,
      );

      for (const nodeId of timedOutNodeIds) {
        this.logger.warn(`Node ${nodeId} timed out and marked OFFLINE`);
        this.nodesGateway.broadcastToDashboards({
          type: 'NODE_OFFLINE',
          payload: {
            nodeId,
            reason: `Heartbeat timeout exceeded (${this.offlineTimeoutMs / 1000}s)`,
          },
        });
      }
    } catch (err) {
      this.logger.error(`Error in offline detection sweep: ${err.message}`);
    }
  }
}
