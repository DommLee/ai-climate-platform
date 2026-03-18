import React from 'react';
import { AlertTriangle, ShieldCheck, ThermometerSun, Leaf } from 'lucide-react';

export default function RiskPanel({ riskData }) {
    if (!riskData) return null;

    const isCritical = riskData.level === 'Critical' || riskData.level === 'High';
    const colorClass = isCritical ? 'text-[#E60000]' : 'text-yellow-500';
    const bgClass = isCritical ? 'bg-red-900/20 border-red-900/50' : 'bg-yellow-900/20 border-yellow-900/50';

    return (
        <div className={`p-6 rounded-xl border ${bgClass} transition-all`}>
            <div className="flex items-center gap-3 mb-4">
                {isCritical ? <AlertTriangle className={colorClass} size={28} /> : <ShieldCheck className={colorClass} size={28} />}
                <h3 className={`text-2xl font-bold ${colorClass}`}>Risk Level: {riskData.level}</h3>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="bg-[#121212] p-4 rounded-lg border border-gray-800">
                    <p className="text-gray-400 text-sm mb-1 uppercase tracking-wider">AI Score</p>
                    <p className="text-3xl font-black text-white">{riskData.score}<span className="text-lg text-gray-500 font-medium">/100</span></p>
                </div>
                <div className="bg-[#121212] p-4 rounded-lg border border-gray-800">
                    <p className="text-gray-400 text-sm mb-1 uppercase tracking-wider">Primary Threat</p>
                    <p className="text-lg font-bold text-gray-200 leading-tight">{riskData.primary_threat}</p>
                </div>
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm text-gray-400">
                <ThermometerSun size={16} /> AI Confidence: <span className="font-semibold text-white">{riskData.confidence}</span>
            </div>
        </div>
    );
}
