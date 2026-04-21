"use client";
import { useMemo } from 'react';
import { Lead } from '@/lib/types/lead';
import { CRMUser } from '@/lib/types/user';
import { computeLeaderboard } from '@/lib/utils/dashboardMetrics';
import { formatPrice } from '@/lib/utils/formatPrice';
import { Trophy } from 'lucide-react';

interface Props {
  leads: Lead[];
  users: CRMUser[];
  currentUid?: string;
}

const RANK_STYLES = [
  'bg-yellow-500/15 text-yellow-600',
  'bg-gray-400/15 text-gray-500',
  'bg-orange-500/15 text-orange-600',
];

export function Leaderboard({ leads, users, currentUid }: Props) {
  const entries = useMemo(() => computeLeaderboard(leads, users), [leads, users]);

  if (entries.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-black text-mn-h2 uppercase tracking-wider mb-4">Leaderboard</h2>

      <div className="bg-mn-card border border-mn-border rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-mn-border/40">
              <th className="text-left px-5 py-3 text-[10px] font-black text-mn-text-muted uppercase tracking-wider w-12">#</th>
              <th className="text-left px-5 py-3 text-[10px] font-black text-mn-text-muted uppercase tracking-wider">Name</th>
              <th className="text-right px-5 py-3 text-[10px] font-black text-mn-text-muted uppercase tracking-wider">Closed</th>
              <th className="text-right px-5 py-3 text-[10px] font-black text-mn-text-muted uppercase tracking-wider">Pipeline</th>
              <th className="text-right px-5 py-3 text-[10px] font-black text-mn-text-muted uppercase tracking-wider">Calls/wk</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => {
              const isMe = entry.uid === currentUid;
              return (
                <tr
                  key={entry.uid}
                  className={`border-b border-mn-border/20 transition-colors ${isMe ? 'bg-mn-h2/8' : 'hover:bg-mn-card-hover'}`}
                >
                  <td className="px-5 py-3">
                    {i < 3 ? (
                      <span className={`w-6 h-6 rounded-full inline-flex items-center justify-center text-xs font-black ${RANK_STYLES[i]}`}>
                        {i + 1}
                      </span>
                    ) : (
                      <span className="text-xs font-bold pl-1.5 text-mn-text-muted">{i + 1}</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-mn-text">{entry.name}</span>
                      {isMe && <span className="text-[9px] font-black px-1.5 py-0.5 rounded text-mn-h2 bg-mn-h2/10">YOU</span>}
                      {i === 0 && <Trophy className="w-3.5 h-3.5 text-yellow-500" />}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right text-sm font-black text-mn-success">{entry.leadsClosed}</td>
                  <td className="px-5 py-3 text-right text-sm font-bold text-mn-h2">{formatPrice(entry.pipelineValue)}</td>
                  <td className="px-5 py-3 text-right text-sm font-bold text-mn-text">{entry.callsThisWeek}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
