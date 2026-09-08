import React from "react";
import { Server, Cpu, HardDrive, Clock, ArrowRight, Activity } from "lucide-react";

export interface NodeData {
  node_id: string;
  node_name: string;
  hostname: string;
  os: string;
  cpu: string;
  ram: string;
  status: "ONLINE" | "OFFLINE" | "AVAILABLE" | "BUSY";
  last_seen: string;
  isWsConnected?: boolean;
  gpus?: Array<{
    id: string;
    gpu_index: number;
    gpu_name: string;
    total_memory: number;
    availability: string;
    driver_version: string;
    latestMetric?: {
      utilization: number;
      memory_used: number;
      temperature: number;
      power_draw: number;
    } | null;
  }>;
}

interface NodeCardProps {
  node: NodeData;
  onSelect: (node: NodeData) => void;
}

export const NodeCard: React.FC<NodeCardProps> = ({ node, onSelect }) => {
  const isOnline = node.status !== "OFFLINE" && node.isWsConnected;
  const primaryGpu = node.gpus && node.gpus.length > 0 ? node.gpus[0] : null;
  const utilization = primaryGpu?.latestMetric?.utilization ?? 0;

  const getStatusBadge = () => {
    if (!isOnline) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-950 text-rose-400 border border-rose-800">
          <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-rose-400" />
          OFFLINE
        </span>
      );
    }
    if (node.status === "BUSY") {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-950 text-amber-400 border border-amber-800">
          <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-amber-400 animate-pulse" />
          BUSY
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
        <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-emerald-400" />
        ONLINE
      </span>
    );
  };

  const formatLastSeen = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString();
    } catch {
      return isoStr;
    }
  };

  return (
    <div
      onClick={() => onSelect(node)}
      className="bg-[#161b22] border border-[#30363d] hover:border-emerald-500/50 transition-all duration-200 rounded-xl p-5 cursor-pointer flex flex-col justify-between shadow-sm group"
    >
      <div>
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h4 className="text-base font-semibold text-white group-hover:text-emerald-400 transition-colors">
              {node.node_name}
            </h4>
            <p className="text-xs font-mono text-gray-500 mt-0.5">
              {node.node_id}
            </p>
          </div>
          <div>{getStatusBadge()}</div>
        </div>

        {/* Host Specs */}
        <div className="mt-4 space-y-2 text-xs text-gray-400">
          <div className="flex items-center justify-between">
            <span className="flex items-center text-gray-400">
              <Server className="w-3.5 h-3.5 mr-1.5 text-gray-500" /> Hostname
            </span>
            <span className="text-gray-300 font-mono">{node.hostname}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center text-gray-400">
              <Cpu className="w-3.5 h-3.5 mr-1.5 text-gray-500" /> OS / CPU
            </span>
            <span className="text-gray-300 truncate max-w-[180px]" title={node.cpu}>
              {node.os.split(" ")[0]} • {node.cpu.split("(")[0]}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center text-gray-400">
              <HardDrive className="w-3.5 h-3.5 mr-1.5 text-gray-500" /> RAM
            </span>
            <span className="text-gray-300">{node.ram}</span>
          </div>
        </div>

        {/* GPU Information Banner */}
        <div className="mt-4 pt-3 border-t border-[#21262d]">
          {primaryGpu ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-emerald-400 flex items-center">
                  <Activity className="w-3.5 h-3.5 mr-1" />
                  {primaryGpu.gpu_name}
                </span>
                <span className="text-gray-400 font-mono">
                  {primaryGpu.total_memory} MB VRAM
                </span>
              </div>
              <div className="w-full bg-[#0d1117] rounded-full h-2 overflow-hidden border border-[#30363d]">
                <div
                  className="bg-emerald-500 h-2 transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, utilization))}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-gray-400">
                <span>Core Load: {utilization}%</span>
                <span>
                  {primaryGpu.latestMetric?.temperature
                    ? `${primaryGpu.latestMetric.temperature}°C`
                    : "Temp: --"}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-400 py-1 flex items-center justify-between">
              <span>NVIDIA GPU:</span>
              <span className="italic text-gray-400">None detected (CPU-only)</span>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-[#21262d] flex items-center justify-between text-xs text-gray-400">
        <div className="flex items-center space-x-1">
          <Clock className="w-3 h-3" />
          <span>Seen: {formatLastSeen(node.last_seen)}</span>
        </div>
        <div className="flex items-center space-x-1 text-emerald-400 font-medium group-hover:translate-x-1 transition-transform">
          <span>Inspect</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </div>
      </div>
    </div>
  );
};
