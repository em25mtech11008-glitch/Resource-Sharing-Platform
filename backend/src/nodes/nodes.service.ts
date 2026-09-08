import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In } from 'typeorm';
import { NodeEntity, NodeStatus } from '../database/entities/node.entity';
import { GpuEntity, GpuAvailability } from '../database/entities/gpu.entity';
import { GpuMetricEntity } from '../database/entities/gpu-metric.entity';
import { NodeEventEntity } from '../database/entities/node-event.entity';

export interface RegisterNodePayload {
  node_id: string;
  node_name?: string;
  hostname: string;
  os: string;
  cpu: string;
  ram: string;
  gpus?: Array<{
    gpu_index: number;
    gpu_uuid?: string;
    gpu_name: string;
    total_memory: number;
    driver_version?: string;
  }>;
}

export interface GpuStatusMetricItem {
  gpu_index: number;
  gpu_uuid?: string;
  gpu_name?: string;
  utilization?: number;
  memory_utilization?: number;
  memory_used?: number;
  memory_free?: number;
  total_memory?: number;
  temperature?: number;
  power_draw?: number;
  power_limit?: number;
  driver_version?: string;
}

@Injectable()
export class NodesService {
  private readonly logger = new Logger(NodesService.name);

  constructor(
    @InjectRepository(NodeEntity)
    private readonly nodeRepo: Repository<NodeEntity>,
    @InjectRepository(GpuEntity)
    private readonly gpuRepo: Repository<GpuEntity>,
    @InjectRepository(GpuMetricEntity)
    private readonly metricRepo: Repository<GpuMetricEntity>,
    @InjectRepository(NodeEventEntity)
    private readonly eventRepo: Repository<NodeEventEntity>,
  ) {}

  async registerNode(payload: RegisterNodePayload): Promise<NodeEntity> {
    const { node_id, node_name, hostname, os, cpu, ram, gpus } = payload;
    this.logger.log(`Registering or updating node: ${node_id} (${hostname})`);

    let node = await this.nodeRepo.findOne({ where: { node_id } });

    if (!node) {
      node = this.nodeRepo.create({
        node_id,
        node_name: node_name || `Node-${node_id.substring(0, 8)}`,
        hostname,
        os,
        cpu,
        ram,
        status: NodeStatus.ONLINE,
        last_seen: new Date(),
      });
    } else {
      node.node_name = node_name || node.node_name;
      node.hostname = hostname;
      node.os = os;
      node.cpu = cpu;
      node.ram = ram;
      node.status = NodeStatus.ONLINE;
      node.last_seen = new Date();
    }

    await this.nodeRepo.save(node);

    // Synchronize GPUs
    if (gpus && Array.isArray(gpus)) {
      for (const gpuData of gpus) {
        let gpu = await this.gpuRepo.findOne({
          where: { node_id, gpu_index: gpuData.gpu_index },
        });

        if (!gpu) {
          gpu = this.gpuRepo.create({
            node_id,
            gpu_index: gpuData.gpu_index,
            gpu_uuid: gpuData.gpu_uuid || `gpu-${gpuData.gpu_index}`,
            gpu_name: gpuData.gpu_name || 'NVIDIA GPU',
            total_memory: gpuData.total_memory || 0,
            driver_version: gpuData.driver_version || 'N/A',
            availability: GpuAvailability.AVAILABLE,
          });
        } else {
          gpu.gpu_uuid = gpuData.gpu_uuid || gpu.gpu_uuid;
          gpu.gpu_name = gpuData.gpu_name || gpu.gpu_name;
          gpu.total_memory = gpuData.total_memory || gpu.total_memory;
          gpu.driver_version = gpuData.driver_version || gpu.driver_version;
          gpu.availability = GpuAvailability.AVAILABLE;
        }

        await this.gpuRepo.save(gpu);
      }
    }

    await this.logEvent(
      node_id,
      'NODE_REGISTER',
      `Node registered successfully with ${gpus?.length || 0} GPU(s)`,
      { hostname, os, cpu, gpusCount: gpus?.length || 0 },
    );

    return this.getNodeWithGpus(node_id);
  }

  async updateHeartbeat(node_id: string): Promise<void> {
    const node = await this.nodeRepo.findOne({ where: { node_id } });
    if (node) {
      const wasOffline = node.status === NodeStatus.OFFLINE;
      node.last_seen = new Date();
      if (wasOffline) {
        node.status = NodeStatus.ONLINE;
        await this.gpuRepo.update(
          { node_id },
          { availability: GpuAvailability.AVAILABLE },
        );
        await this.logEvent(
          node_id,
          'STATUS_CHANGE',
          'Node reconnected and marked ONLINE via heartbeat',
        );
      }
      await this.nodeRepo.save(node);
    }
  }

  async saveGpuMetrics(
    node_id: string,
    metricsList: GpuStatusMetricItem[],
  ): Promise<void> {
    const node = await this.nodeRepo.findOne({ where: { node_id } });
    if (!node) return;

    node.last_seen = new Date();
    if (node.status === NodeStatus.OFFLINE) {
      node.status = NodeStatus.ONLINE;
    }
    await this.nodeRepo.save(node);

    for (const item of metricsList) {
      let gpu = await this.gpuRepo.findOne({
        where: { node_id, gpu_index: item.gpu_index },
      });

      if (!gpu) {
        gpu = this.gpuRepo.create({
          node_id,
          gpu_index: item.gpu_index,
          gpu_uuid: item.gpu_uuid || `gpu-${item.gpu_index}`,
          gpu_name: item.gpu_name || 'NVIDIA GPU',
          total_memory: item.total_memory || 0,
          driver_version: item.driver_version || 'N/A',
          availability: GpuAvailability.AVAILABLE,
        });
        await this.gpuRepo.save(gpu);
      } else if (item.driver_version || item.total_memory) {
        if (item.driver_version) gpu.driver_version = item.driver_version;
        if (item.total_memory) gpu.total_memory = item.total_memory;
        await this.gpuRepo.save(gpu);
      }

      const metric = this.metricRepo.create({
        gpu_id: gpu.id,
        node_id,
        utilization: Number(item.utilization || 0),
        memory_utilization: Number(item.memory_utilization || 0),
        memory_used: Number(item.memory_used || 0),
        memory_free: Number(item.memory_free || 0),
        temperature: Number(item.temperature || 0),
        power_draw: Number(item.power_draw || 0),
        power_limit: Number(item.power_limit || 0),
        timestamp: new Date(),
      });

      await this.metricRepo.save(metric);
    }
  }

  async setNodeAvailability(
    node_id: string,
    status: NodeStatus,
  ): Promise<NodeEntity> {
    const node = await this.nodeRepo.findOne({ where: { node_id } });
    if (!node) throw new Error(`Node ${node_id} not found`);

    node.status = status;
    await this.nodeRepo.save(node);

    const gpuAvail =
      status === NodeStatus.BUSY
        ? GpuAvailability.BUSY
        : status === NodeStatus.AVAILABLE || status === NodeStatus.ONLINE
          ? GpuAvailability.AVAILABLE
          : GpuAvailability.OFFLINE;

    await this.gpuRepo.update({ node_id }, { availability: gpuAvail });

    await this.logEvent(
      node_id,
      'STATUS_CHANGE',
      `Node status updated to ${status}`,
      { status },
    );

    return this.getNodeWithGpus(node_id);
  }

  async markNodeOffline(node_id: string, reason: string): Promise<void> {
    const node = await this.nodeRepo.findOne({ where: { node_id } });
    if (!node) return;

    if (node.status !== NodeStatus.OFFLINE) {
      node.status = NodeStatus.OFFLINE;
      await this.nodeRepo.save(node);

      await this.gpuRepo.update(
        { node_id },
        { availability: GpuAvailability.OFFLINE },
      );

      await this.logEvent(
        node_id,
        'DISCONNECT',
        `Node marked OFFLINE: ${reason}`,
        { reason },
      );
      this.logger.warn(`Node ${node_id} marked OFFLINE (${reason})`);
    }
  }

  async checkOfflineNodes(timeoutMs: number = 30000): Promise<string[]> {
    const cutoff = new Date(Date.now() - timeoutMs);

    const timedOutNodes = await this.nodeRepo.find({
      where: {
        status: In([NodeStatus.ONLINE, NodeStatus.AVAILABLE, NodeStatus.BUSY]),
        last_seen: LessThan(cutoff),
      },
    });

    const offlineNodeIds: string[] = [];
    for (const node of timedOutNodes) {
      await this.markNodeOffline(
        node.node_id,
        `Heartbeat timeout (> ${Math.round(timeoutMs / 1000)}s since last seen)`,
      );
      offlineNodeIds.push(node.node_id);
    }

    return offlineNodeIds;
  }

  async logEvent(
    node_id: string,
    event_type: string,
    message: string,
    metadata: Record<string, any> = null,
  ): Promise<NodeEventEntity> {
    const event = this.eventRepo.create({
      node_id,
      event_type,
      message,
      metadata,
      timestamp: new Date(),
    });
    return this.eventRepo.save(event);
  }

  async getAllNodesOverview() {
    const nodes = await this.nodeRepo.find({
      order: { last_seen: 'DESC' },
      relations: ['gpus'],
    });

    let totalGpus = 0;
    let activeGpus = 0;
    let onlineNodes = 0;
    let offlineNodes = 0;

    const enrichedNodes = await Promise.all(
      nodes.map(async (n) => {
        const isOnline = n.status !== NodeStatus.OFFLINE;
        if (isOnline) onlineNodes++;
        else offlineNodes++;

        totalGpus += n.gpus?.length || 0;

        // Fetch latest metric for each GPU
        const gpusWithLatestMetric = await Promise.all(
          (n.gpus || []).map(async (gpu) => {
            if (gpu.availability !== GpuAvailability.OFFLINE) {
              activeGpus++;
            }
            const latestMetric = await this.metricRepo.findOne({
              where: { gpu_id: gpu.id },
              order: { timestamp: 'DESC' },
            });
            return {
              ...gpu,
              latestMetric: latestMetric || null,
            };
          }),
        );

        return {
          ...n,
          gpus: gpusWithLatestMetric,
        };
      }),
    );

    return {
      summary: {
        totalNodes: nodes.length,
        onlineNodes,
        offlineNodes,
        totalGpus,
        activeGpus,
      },
      nodes: enrichedNodes,
    };
  }

  async getNodeWithGpus(node_id: string): Promise<NodeEntity> {
    return this.nodeRepo.findOne({
      where: { node_id },
      relations: ['gpus'],
    });
  }

  async getNodeDetails(node_id: string) {
    const node = await this.nodeRepo.findOne({
      where: { node_id },
      relations: ['gpus'],
    });

    if (!node) return null;

    const gpusWithMetrics = await Promise.all(
      (node.gpus || []).map(async (gpu) => {
        const latestMetric = await this.metricRepo.findOne({
          where: { gpu_id: gpu.id },
          order: { timestamp: 'DESC' },
        });
        const recentMetrics = await this.metricRepo.find({
          where: { gpu_id: gpu.id },
          order: { timestamp: 'DESC' },
          take: 20,
        });
        return {
          ...gpu,
          latestMetric: latestMetric || null,
          recentMetrics: recentMetrics.reverse(),
        };
      }),
    );

    const recentEvents = await this.eventRepo.find({
      where: { node_id },
      order: { timestamp: 'DESC' },
      take: 50,
    });

    return {
      ...node,
      gpus: gpusWithMetrics,
      recentEvents,
    };
  }

  async getNodeEvents(node_id: string, limit = 50) {
    return this.eventRepo.find({
      where: { node_id },
      order: { timestamp: 'DESC' },
      take: limit,
    });
  }

  async getNodeMetrics(node_id: string, limit = 100) {
    return this.metricRepo.find({
      where: { node_id },
      order: { timestamp: 'DESC' },
      take: limit,
    });
  }
}
