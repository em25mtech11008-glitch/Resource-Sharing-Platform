import React from "react";
import { Server, CheckCircle2, XCircle, HardDrive, Zap } from "lucide-react";

interface SummaryCardsProps {
  summary: {
    totalNodes: number;
    onlineNodes: number;
    offlineNodes: number;
    totalGpus: number;
    activeGpus: number;
  };
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({ summary }) => {
  const cards = [
    {
      title: "Online Nodes",
      value: summary.onlineNodes,
      subtitle: `of ${summary.totalNodes} registered`,
      icon: CheckCircle2,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10 border-emerald-500/20",
    },
    {
      title: "Offline Nodes",
      value: summary.offlineNodes,
      subtitle: "Heartbeat timeout / disconnected",
      icon: XCircle,
      color: "text-rose-400",
      bg: "bg-rose-500/10 border-rose-500/20",
    },
    {
      title: "Active GPUs",
      value: summary.activeGpus,
      subtitle: `of ${summary.totalGpus} total GPUs`,
      icon: Zap,
      color: "text-amber-400",
      bg: "bg-amber-500/10 border-amber-500/20",
    },
    {
      title: "Total GPU Hardware",
      value: summary.totalGpus,
      subtitle: "Verified NVIDIA adapters",
      icon: HardDrive,
      color: "text-cyan-400",
      bg: "bg-cyan-500/10 border-cyan-500/20",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div
            key={idx}
            className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 flex items-center justify-between"
          >
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                {card.title}
              </p>
              <h3 className="text-2xl font-bold text-white mt-1">
                {card.value}
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">{card.subtitle}</p>
            </div>
            <div className={`p-3 rounded-lg border ${card.bg} ${card.color}`}>
              <Icon className="w-5 h-5" />
            </div>
          </div>
        );
      })}
    </div>
  );
};
