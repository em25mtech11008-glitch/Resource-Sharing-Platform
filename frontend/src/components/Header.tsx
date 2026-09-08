import React from "react";
import { Server, Activity, Cpu, ShieldCheck } from "lucide-react";

interface HeaderProps {
  isWsConnected: boolean;
}

export const Header: React.FC<HeaderProps> = ({ isWsConnected }) => {
  return (
    <header className="border-b border-[#30363d] bg-[#161b22] px-6 py-4">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-bold text-white tracking-tight">
                P2P GPU Platform
              </h1>
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                Node Control Center
              </span>
            </div>
            <p className="text-xs text-gray-400">
              Distributed GPU Node Discovery, Telemetry & Safe Control Server
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 text-xs bg-[#0d1117] border border-[#30363d] rounded-full px-3 py-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-gray-300">Allowlist Security: Active</span>
          </div>

          <div className="flex items-center space-x-2 text-xs bg-[#0d1117] border border-[#30363d] rounded-full px-3 py-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                isWsConnected ? "bg-emerald-400 animate-pulse" : "bg-red-400"
              }`}
            />
            <span className="text-gray-300">
              {isWsConnected ? "Live Telemetry Stream" : "Reconnecting Stream..."}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
