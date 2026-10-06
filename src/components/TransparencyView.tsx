import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Trophy,
  AlertOctagon,
  Clock,
  CheckCircle2,
  Download,
  ShieldCheck,
  TrendingUp,
  Building2,
  Users,
} from 'lucide-react';
import { MunicipalService } from '../shared/types.ts';
import { Language, translations } from '../i18n/translations.ts';

interface TransparencyViewProps {
  lang: Language;
}

export const TransparencyView: React.FC<TransparencyViewProps> = ({ lang }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const t = translations[lang];

  useEffect(() => {
    fetch('/api/stats/transparency')
      .then(res => res.json())
      .then(d => {
        setData(d.stats);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching transparency stats:', err);
        setLoading(false);
      });
  }, []);

  if (loading || !data) {
    return (
      <div className="p-12 text-center text-slate-400">
        Загрузка открытых данных прозрачности...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/40 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-6 h-6 text-cyan-400" />
            <h3 className="text-xl font-extrabold text-white">Публичный индекс открытости и подотчетности</h3>
          </div>
          <p className="text-xs text-slate-400 max-w-2xl">
            Все обращения, тайминги реакций и факты нарушения регламентов децентрализованно фиксируются в блокчейне Solana.
            Удаление или скрытие нерешенных жалоб математически невозможно.
          </p>
        </div>

        {/* Open Data Exports */}
        <div className="flex items-center gap-2 shrink-0">
          <a
            href="/api/export/geojson"
            download
            className="px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-cyan-500 text-xs font-bold text-slate-200 flex items-center gap-1.5 transition-all shadow-md"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>GeoJSON</span>
          </a>
          <a
            href="/api/export/csv"
            download
            className="px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-cyan-500 text-xs font-bold text-slate-200 flex items-center gap-1.5 transition-all shadow-md"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>CSV Таблица</span>
          </a>
        </div>
      </div>

      {/* Top 4 KPI Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
          <span className="text-xs text-slate-400 block mb-1">Всего зарегистрировано</span>
          <div className="text-2xl font-black text-white">{data.total_reports}</div>
          <span className="text-[11px] text-cyan-400 font-mono mt-1 block">100% ончейн-хэшированы</span>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
          <span className="text-xs text-slate-400 block mb-1">Доля успешно решенных</span>
          <div className="text-2xl font-black text-emerald-400">{data.resolution_rate_percent}%</div>
          <span className="text-[11px] text-slate-500 mt-1 block">{data.resolved_reports} обращений устранено</span>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
          <span className="text-xs text-slate-400 block mb-1">Нарушений регламента SLA</span>
          <div className="text-2xl font-black text-rose-400">{data.sla_violations_total}</div>
          <span className="text-[11px] text-rose-400/80 mt-1 block">Публично зафиксировано</span>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
          <span className="text-xs text-slate-400 block mb-1">Переоткрыто жителями</span>
          <div className="text-2xl font-black text-amber-400">{data.reopened_by_citizens}</div>
          <span className="text-[11px] text-amber-400/80 mt-1 block">Брак устранения оспорен</span>
        </div>
      </div>

      {/* Municipal Services Leaderboard & Anti-Rating */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            <h4 className="text-base font-bold text-white">Рейтинг городских служб и Антирейтинг</h4>
          </div>
          <span className="text-xs text-slate-500">
            Сортировка по индексу качества (штрафы за просрочку SLA и повторные жалобы)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                <th className="pb-3 pl-2">Служба</th>
                <th className="pb-3 text-center">Индекс OZIZ</th>
                <th className="pb-3 text-center">Решено</th>
                <th className="pb-3 text-center">Ср. время реакции</th>
                <th className="pb-3 text-center">Срывы SLA</th>
                <th className="pb-3 text-center">Брак (переоткрытия)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {data.services.map((srv: any, idx: number) => {
                const isLeader = idx === 0;
                const isWorst = idx === data.services.length - 1;

                return (
                  <tr key={srv.id} className="hover:bg-slate-850/60 transition-colors">
                    <td className="py-3 pl-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] ${
                          isLeader
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : isWorst
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            : 'bg-slate-800 text-slate-400'
                        }`}>
                          {idx + 1}
                        </span>
                        <div>
                          <div className="font-bold text-white">{srv.name}</div>
                          <div className="text-[10px] text-slate-500 uppercase">{srv.code}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 text-center font-bold text-sm text-cyan-400">
                      {srv.rank_score}
                    </td>
                    <td className="py-3 text-center">
                      <span className="text-emerald-400 font-bold">{srv.resolved_rate}%</span>
                    </td>
                    <td className="py-3 text-center text-slate-300">
                      {srv.avg_response_hours} ч
                    </td>
                    <td className="py-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        srv.violations > 0
                          ? 'bg-rose-950/80 text-rose-300 border border-rose-800'
                          : 'text-slate-500'
                      }`}>
                        {srv.violations}
                      </span>
                    </td>
                    <td className="py-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        srv.reopened > 0
                          ? 'bg-amber-950/80 text-amber-300 border border-amber-800'
                          : 'text-slate-500'
                      }`}>
                        {srv.reopened}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* District Comparison */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-cyan-400" />
          <h4 className="text-base font-bold text-white">Активность граждан по районам</h4>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          {Object.entries(data.districts).map(([dName, cnt]: any) => (
            <div key={dName} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-slate-400 block mb-1">{dName}</span>
              <div className="text-xl font-bold text-white">{cnt} обращений</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
