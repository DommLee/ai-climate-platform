import React from 'react';
import { Lightbulb, CheckCircle2 } from 'lucide-react';

export default function SolutionsList({ solutions }) {
    if (!solutions || solutions.length === 0) return null;

    return (
        <div className="bg-[#1a1a1a] rounded-xl border border-gray-800 p-6">
            <div className="flex items-center gap-3 mb-6">
                <Lightbulb className="text-green-500" size={24} />
                <h3 className="text-xl font-bold text-white">AI Recommended Solutions</h3>
            </div>

            <ul className="space-y-4">
                {solutions.map((sol, idx) => (
                    <li key={idx} className="flex gap-3 items-start bg-[#121212] p-4 rounded-lg border border-gray-800 hover:border-gray-600 transition-colors">
                        <CheckCircle2 className="text-[#E60000] shrink-0 mt-0.5" size={20} />
                        <span className="text-gray-300 leading-relaxed">{sol}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
