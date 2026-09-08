"use client";

import React, { useState, useEffect, useRef } from "react";
import { Header } from "@/components/Header";
import { SummaryCards } from "@/components/SummaryCards";
import { NodeCard, NodeData } from "@/components/NodeCard";
import { NodeDetailModal } from "@/components/NodeDetailModal";
import { Server, RefreshCw, Terminal, CheckCircle2 } from "lucide-react";

export default function DashboardPage() {
  const [summary, setSummary] = useState({
    totalNodes: 0,
    onlineNodes: 0,
    offlineNodes: 0,
    totalGpus: 0,
    activeGpus: 0,
  });
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [selectedNode, setSelectedNode] = useState<NodeData | null>(null);
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  // Configuration URLs
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  const wsBaseUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:4000";

  const wsRef = useRef<WebSocket | null>(null);

  const fetchNodes = async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/nodes`);
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary);
        setNodes(data.nodes);
      }
    } catch (err) {
      console.error("Failed to fetch nodes overview:", err);
    } finally {
      setLoading(false);
    }
  };

  // Initial Fetch & Polling Fallback
  useEffect(() => {
    fetchNodes();
    const interval = setInterval(fetchNodes, 5000);
    return () => clearInterval(interval);
  }, []);

  // Real-time WebSocket connection for Dashboard
  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimeout: NodeJS.Timeout;

    const connectWs = () => {
      try {
        ws = new WebSocket(wsBaseUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setIsWsConnected(true);
          // Subscribe as dashboard client
          ws.send(JSON.stringify({ type: "DASHBOARD_SUBSCRIBE" }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            handleWsMessage(data);
          } catch (e) {
            console.error("Failed to parse WS message", e);
          }
        };

        ws.onclose = () => {
          setIsWsConnected(false);
          reconnectTimeout = setTimeout(connectWs, 3000);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch (err) {
        setIsWsConnected(false);
        reconnectTimeout = setTimeout(connectWs, 3000);
      }
    };

    connectWs();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, [wsBaseUrl]);

  const handleWsMessage = (message: any) => {
    const { type, payload } = message;

    if (type === "NODE_REGISTERED" || type === "NODE_OFFLINE" || type === "NODE_EVENT") {
      fetchNodes();
    } else if (type === "GPU_METRICS_UPDATED" && payload?.node_id) {
      // Live in-place update of GPU metrics without full refetch
      setNodes((prevNodes) =>
        prevNodes.map((node) => {
          if (node.node_id === payload.node_id && node.gpus) {
            const updatedGpus = node.gpus.map((gpu) => {
              const matchedUpdate = payload.gpus?.find(
                (g: any) => g.gpu_index === gpu.gpu_index
              );
              if (matchedUpdate) {
                return {
                  ...gpu,
                  latestMetric: {
                    utilization: matchedUpdate.utilization ?? 0,
                    memory_used: matchedUpdate.memory_used ?? 0,
                    temperature: matchedUpdate.temperature ?? 0,
                    power_draw: matchedUpdate.power_draw ?? 0,
                  },
                };
              }
              return gpu;
            });
            return {
              ...node,
              last_seen: new Date().toISOString(),
              status: "ONLINE",
              isWsConnected: true,
              gpus: updatedGpus,
            };
          }
          return node;
        })
      );
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0d1117]">
      <Header isWsConnected={isWsConnected} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-8">
        {/* Metric Summary Cards */}
        <SummaryCards summary={summary} />

        {/* Nodes Grid Section */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center">
                <Server className="w-5 h-5 mr-2 text-emerald-400" />
                Connected GPU Nodes ({nodes.length})
              </h2>
              <p className="text-xs text-gray-400">
                Real-time outbound WebSocket connections from distributed hosts
              </p>
            </div>

            <button
              onClick={fetchNodes}
              className="px-3 py-1.5 text-xs font-medium text-gray-300 bg-[#161b22] hover:bg-[#21262d] border border-[#30363d] rounded-lg transition-colors flex items-center self-start sm:self-auto space-x-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 h-56 animate-pulse"
                />
              ))}
            </div>
          ) : nodes.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {nodes.map((node) => (
                <NodeCard
                  key={node.node_id}
                  node={node}
                  onSelect={(selected) => setSelectedNode(selected)}
                />
              ))}
            </div>
          ) : (
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-12 text-center">
              <Server className="w-12 h-12 mx-auto text-gray-600 mb-3" />
              <h3 className="text-base font-semibold text-white">
                No GPU Nodes Connected Yet
              </h3>
              <p className="text-sm text-gray-400 max-w-md mx-auto mt-1 mb-6">
                Start a Node Agent on any machine to see it appear here
                automatically via outbound WebSocket.
              </p>
              <div className="inline-block text-left bg-[#0d1117] border border-[#30363d] rounded-lg p-4 text-xs font-mono text-emerald-400">
                <span className="text-gray-500"># Run Node Agent:</span>
                <br />
                cd agent &amp;&amp; python3 main.py --name &quot;My-GPU-Node&quot;
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Node Detail & Control Modal */}
      {selectedNode && (
        <NodeDetailModal
          node={selectedNode}
          onClose={() => setSelectedNode(null)}
          apiBaseUrl={apiBaseUrl}
        />
      )}
    </div>
  );
}
