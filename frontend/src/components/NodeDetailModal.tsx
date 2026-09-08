import React, { useState, useEffect } from "react";
import {
  X,
  Cpu,
  Server,
  HardDrive,
  Clock,
  Zap,
  Activity,
  ShieldCheck,
  RefreshCw,
  Terminal,
  Play,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { NodeData } from "./NodeCard";

interface NodeDetailModalProps {
  node: NodeData | null;
  onClose: () => void;
  apiBaseUrl: string;
}

interface CommandOutput {
  command: string;
  success: boolean;
  timestamp: string;
  result?: any;
  error?: string;
}

export const NodeDetailModal: React.FC<NodeDetailModalProps> = ({
  node,
  onClose,
  apiBaseUrl,
}) => {
  const [details, setDetails] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [lastCommandOutput, setLastCommandOutput] = useState<CommandOutput | null>(null);

  useEffect(() => {
    if (!node) return;
    fetchDetails();
    const interval = setInterval(fetchDetails, 3000);
    return () => clearInterval(interval);
  }, [node?.node_id]);

  const fetchDetails = async () => {
    if (!node) return;
    try {
      const res = await fetch(`${apiBaseUrl}/api/nodes/${node.node_id}`);
      if (res.ok) {
        const data = await res.json();
        setDetails(data);
        if (data.recentEvents) {
          setEvents(data.recentEvents);
        }
      }
    } catch (e) {
      console.error("Failed to load node details:", e);
    }
  };

  if (!node) return null;

  const currentNode = details || node;
  const isOnline = currentNode.status !== "OFFLINE" && currentNode.isWsConnected;

  const dispatchCommand = async (command: string, params: Record<string, any> = {}) => {
    setLoadingAction(command);
    setLastCommandOutput(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/nodes/${node.node_id}/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, params }),
      });
      const data = await res.json();
      if (res.ok) {
        setLastCommandOutput({
          command,
          success: true,
          timestamp: new Date().toLocaleTimeString(),
          result: data.result,
        });
      } else {
        setLastCommandOutput({
          command,
          success: false,
          timestamp: new Date().toLocaleTimeString(),
          error: data.message || "Command execution rejected",
        });
      }
      fetchDetails();
    } catch (e: any) {
      setLastCommandOutput({
        command,
        success: false,
        timestamp: new Date().toLocaleTimeString(),
        error: e.message || "Network request failed",
      });
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#30363d] bg-[#0d1117]">
          <div>
            <div className="flex items-center space-x-3">
              <h2 className="text-xl font-bold text-white">
                {currentNode.node_name}
              </h2>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  isOnline
                    ? currentNode.status === "BUSY"
                      ? "bg-amber-950 text-amber-400 border border-amber-800"
                      : "bg-emerald-950 text-emerald-400 border border-emerald-800"
                    : "bg-rose-950 text-rose-400 border border-rose-800"
                }`}
              >
                {isOnline ? currentNode.status : "OFFLINE"}
              </span>
            </div>
            <p className="text-xs font-mono text-gray-500 mt-1">
              ID: {currentNode.node_id}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#21262d] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body (Scrollable) */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Hardware Specs Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#0d1117] p-4 rounded-xl border border-[#30363d]">
            <div>
              <p className="text-xs text-gray-500">Hostname</p>
              <p className="text-sm font-medium text-gray-200 mt-0.5 truncate">
                {currentNode.hostname}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Operating System</p>
              <p className="text-sm font-medium text-gray-200 mt-0.5 truncate">
                {currentNode.os}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">CPU Architecture</p>
              <p className="text-sm font-medium text-gray-200 mt-0.5 truncate" title={currentNode.cpu}>
                {currentNode.cpu}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">System RAM</p>
              <p className="text-sm font-medium text-gray-200 mt-0.5">
                {currentNode.ram}
              </p>
            </div>
          </div>

          {/* Safe Action Control Panel */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white flex items-center">
                <ShieldCheck className="w-4 h-4 mr-1.5 text-emerald-400" />
                Safe Allowlisted Actions
              </h3>
              <span className="text-xs text-gray-500">Zero RCE Policy Enforced</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <button
                disabled={!isOnline || loadingAction !== null}
                onClick={() => dispatchCommand("PING")}
                className="px-3 py-2 text-xs font-medium bg-[#21262d] hover:bg-[#30363d] disabled:opacity-40 rounded-lg text-gray-200 border border-[#30363d] transition-all flex items-center justify-center space-x-1"
              >
                <Activity className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                Ping
              </button>

              <button
                disabled={!isOnline || loadingAction !== null}
                onClick={() => dispatchCommand("GET_SYSTEM_INFO")}
                className="px-3 py-2 text-xs font-medium bg-[#21262d] hover:bg-[#30363d] disabled:opacity-40 rounded-lg text-gray-200 border border-[#30363d] transition-all flex items-center justify-center space-x-1"
              >
                <Server className="w-3.5 h-3.5 mr-1 text-cyan-400" />
                Sys Info
              </button>

              <button
                disabled={!isOnline || loadingAction !== null}
                onClick={() => dispatchCommand("GET_GPU_STATUS")}
                className="px-3 py-2 text-xs font-medium bg-[#21262d] hover:bg-[#30363d] disabled:opacity-40 rounded-lg text-gray-200 border border-[#30363d] transition-all flex items-center justify-center space-x-1"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1 text-indigo-400" />
                GPU Status
              </button>

              <button
                disabled={!isOnline || loadingAction !== null}
                onClick={() => dispatchCommand("SET_NODE_AVAILABILITY", { status: "AVAILABLE" })}
                className="px-3 py-2 text-xs font-medium bg-emerald-950/40 hover:bg-emerald-900/50 disabled:opacity-40 text-emerald-300 border border-emerald-800/60 rounded-lg transition-all flex items-center justify-center space-x-1"
              >
                <CheckCircle className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                Available
              </button>

              <button
                disabled={!isOnline || loadingAction !== null}
                onClick={() => dispatchCommand("SET_NODE_AVAILABILITY", { status: "BUSY" })}
                className="px-3 py-2 text-xs font-medium bg-amber-950/40 hover:bg-amber-900/50 disabled:opacity-40 text-amber-300 border border-amber-800/60 rounded-lg transition-all flex items-center justify-center space-x-1"
              >
                <Clock className="w-3.5 h-3.5 mr-1 text-amber-400" />
                Set Busy
              </button>

              <button
                disabled={!isOnline || loadingAction !== null}
                onClick={() => dispatchCommand("RUN_GPU_TEST", { duration: 5 })}
                className="px-3 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg transition-all flex items-center justify-center space-x-1"
              >
                <Play className="w-3.5 h-3.5 mr-1 fill-white" />
                GPU Test
              </button>
            </div>

            {/* Action Response Box */}
            {lastCommandOutput && (
              <div
                className={`mt-3 p-3 rounded-lg border text-xs font-mono ${
                  lastCommandOutput.success
                    ? "bg-emerald-950/20 border-emerald-800/40 text-emerald-300"
                    : "bg-rose-950/20 border-rose-800/40 text-rose-300"
                }`}
              >
                <div className="flex items-center justify-between font-semibold mb-1">
                  <span>
                    Command: {lastCommandOutput.command} (
                    {lastCommandOutput.success ? "SUCCESS" : "ERROR"})
                  </span>
                  <span>{lastCommandOutput.timestamp}</span>
                </div>
                <pre className="overflow-x-auto text-[11px] p-2 bg-[#0d1117] rounded border border-[#30363d] text-gray-300">
                  {JSON.stringify(
                    lastCommandOutput.result || lastCommandOutput.error,
                    null,
                    2
                  )}
                </pre>
              </div>
            )}
          </div>

          {/* GPU Hardware Section */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center">
              <Zap className="w-4 h-4 mr-1.5 text-emerald-400" />
              Connected NVIDIA GPUs ({currentNode.gpus?.length || 0})
            </h3>

            {currentNode.gpus && currentNode.gpus.length > 0 ? (
              <div className="space-y-3">
                {currentNode.gpus.map((gpu: any, idx: number) => {
                  const m = gpu.latestMetric || {};
                  return (
                    <div
                      key={gpu.id || idx}
                      className="bg-[#0d1117] border border-[#30363d] rounded-xl p-4 space-y-4"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#21262d] gap-2">
                        <div>
                          <h4 className="text-sm font-bold text-white flex items-center">
                            <Activity className="w-4 h-4 mr-2 text-emerald-400" />
                            GPU #{gpu.gpu_index}: {gpu.gpu_name}
                          </h4>
                          <p className="text-xs text-gray-500 font-mono mt-0.5">
                            UUID: {gpu.gpu_uuid || "N/A"} • Driver:{" "}
                            {gpu.driver_version || "N/A"}
                          </p>
                        </div>
                        <span
                          className={`self-start sm:self-auto px-2 py-0.5 rounded text-xs font-semibold ${
                            gpu.availability === "AVAILABLE"
                              ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                              : "bg-amber-950 text-amber-400 border border-amber-800"
                          }`}
                        >
                          {gpu.availability}
                        </span>
                      </div>

                      {/* Telemetry Gauges */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-[#161b22] p-3 rounded-lg border border-[#21262d]">
                          <span className="text-[11px] text-gray-400">Core Utilization</span>
                          <p className="text-lg font-bold text-emerald-400 mt-1">
                            {m.utilization ?? 0}%
                          </p>
                          <div className="w-full bg-[#0d1117] rounded-full h-1.5 mt-2 overflow-hidden">
                            <div
                              className="bg-emerald-400 h-1.5"
                              style={{ width: `${m.utilization ?? 0}%` }}
                            />
                          </div>
                        </div>

                        <div className="bg-[#161b22] p-3 rounded-lg border border-[#21262d]">
                          <span className="text-[11px] text-gray-400">VRAM Allocation</span>
                          <p className="text-lg font-bold text-white mt-1">
                            {m.memory_used ?? 0}{" "}
                            <span className="text-xs font-normal text-gray-400">
                              / {gpu.total_memory} MB
                            </span>
                          </p>
                          <div className="w-full bg-[#0d1117] rounded-full h-1.5 mt-2 overflow-hidden">
                            <div
                              className="bg-cyan-400 h-1.5"
                              style={{
                                width: `${
                                  gpu.total_memory
                                    ? ((m.memory_used || 0) / gpu.total_memory) * 100
                                    : 0
                                }%`,
                              }}
                            />
                          </div>
                        </div>

                        <div className="bg-[#161b22] p-3 rounded-lg border border-[#21262d]">
                          <span className="text-[11px] text-gray-400">Temperature</span>
                          <p className="text-lg font-bold text-amber-400 mt-1">
                            {m.temperature ? `${m.temperature}°C` : "--"}
                          </p>
                          <span className="text-[10px] text-gray-500">NVML Sensor</span>
                        </div>

                        <div className="bg-[#161b22] p-3 rounded-lg border border-[#21262d]">
                          <span className="text-[11px] text-gray-400">Power Draw</span>
                          <p className="text-lg font-bold text-rose-400 mt-1">
                            {m.power_draw ? `${m.power_draw} W` : "--"}
                          </p>
                          <span className="text-[10px] text-gray-500">
                            Limit: {m.power_limit ? `${m.power_limit} W` : "N/A"}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-6 text-center text-gray-400">
                <AlertCircle className="w-8 h-8 mx-auto text-gray-600 mb-2" />
                <p className="text-sm font-medium text-gray-300">
                  No NVIDIA GPU Hardware Detected
                </p>
                <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                  The host system has no NVIDIA GPU attached or drivers installed.
                  In accordance with RULES.md, no mock GPU data is fabricated.
                </p>
              </div>
            )}
          </div>

          {/* Recent Events Audit Log */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center">
              <Terminal className="w-4 h-4 mr-1.5 text-emerald-400" />
              Node Audit Event Log
            </h3>
            <div className="bg-[#0d1117] border border-[#30363d] rounded-xl max-h-48 overflow-y-auto divide-y divide-[#21262d]">
              {events.length > 0 ? (
                events.map((evt) => (
                  <div key={evt.id} className="p-3 text-xs flex items-start justify-between">
                    <div>
                      <span className="font-mono font-semibold text-emerald-400 mr-2">
                        [{evt.event_type}]
                      </span>
                      <span className="text-gray-300">{evt.message}</span>
                    </div>
                    <span className="text-[11px] text-gray-500 font-mono whitespace-nowrap ml-4">
                      {new Date(evt.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))
              ) : (
                <div className="p-4 text-xs text-gray-500 text-center">
                  No events recorded yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
