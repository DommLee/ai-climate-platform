import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import SafeResponsiveChart from './SafeResponsiveChart';

export default function WeatherChart({ data }) {
    if (!data || data.length === 0) return <div className="text-gray-500 text-sm">No forecast data</div>;

    return (
        <SafeResponsiveChart className="h-64 w-full mt-4" placeholder="Loading chart...">
                <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="time" stroke="#888" />
                    <YAxis stroke="#888" domain={['auto', 'auto']} />
                    <Tooltip
                        contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '8px' }}
                        itemStyle={{ color: '#E60000' }}
                    />
                    <Line type="monotone" dataKey="temp" stroke="#E60000" strokeWidth={3} dot={{ r: 4, fill: '#E60000' }} activeDot={{ r: 6 }} />
                </LineChart>
        </SafeResponsiveChart>
    );
}
