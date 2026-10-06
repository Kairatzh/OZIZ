import React, { useState } from 'react';
import {
  Search,
  Filter,
  Flame,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ThumbsUp,
  MapPin,
  ArrowRight,
  ShieldCheck,
  Download,
} from 'lucide-react';
import { AppealCategory, AppealStatus, CivicAppeal, PriorityLevel } from '../shared/types.ts';
import { Language, translations } from '../i18n/translations.ts';

interface FeedListViewProps {
  reports: CivicAppeal[];
  selectedCategory: string;
  setSelectedCategory: (c: string) => void;
  selectedStatus: string;
  setSelectedStatus: (s: string) => void;
  selectedPriority: string;
  setSelectedPriority: (p: string) => void;
  selectedDistrict: string;
  setSelectedDistrict: (d: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onSelectReport: (report: CivicAppeal) => void;
  lang: Language;
}

export const FeedListView: React.FC<FeedListViewProps> = ({
  reports,
  selectedCategory,
  setSelectedCategory,
  selectedStatus,
  setSelectedStatus,
  selectedPriority,
  setSelectedPriority,
  selectedDistrict,
  setSelectedDistrict,
  searchQuery,
  setSearchQuery,
  onSelectReport,
  lang,
}) => {
  const t = translations[lang];

  return (
    <div className="space-y-4">
      {/* Search and Filters Bar */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={t.search_placeholder}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
          />
        </div>

        {/* Dropdown Filters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {/* Category */}
          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="all">{t.filter_all}</option>
            {Object.entries(t.categories).map(([k, name]) => (
              <option key={k} value={k}>
                {name}
              </option>
            ))}
          </select>

          {/* Status */}
          <select
            value={selectedStatus}
            onChange={e => setSelectedStatus(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="all">{t.status_all}</option>
            {Object.entries(t.statuses).map(([k, name]) => (
              <option key={k} value={k}>
                {name}
              </option>
            ))}
          </select>

          {/* Priority */}
          <select
            value={selectedPriority}
            onChange={e => setSelectedPriority(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="all">{t.priority_all}</option>
            <option value="CRITICAL">{t.critical_cases} (≥85)</option>
            <option value="HIGH">{t.high_cases} (65–84)</option>
            <option value="MEDIUM">{t.medium_cases} (40–64)</option>
            <option value="LOW">{t.low_cases} (&lt;40)</option>
          </select>

          {/* District */}
          <select
            value={selectedDistrict}
            onChange={e => setSelectedDistrict(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="all">{t.district_all}</option>
            <option value="Есильский">Есильский район</option>
            <option value="Алматинский">Алматинский район</option>
            <option value="Сарыаркинский">Сарыаркинский район</option>
            <option value="Байконурский">Байконурский район</option>
          </select>
        </div>

        {/* Quick export actions */}
        <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400">
          <span>Найдено обращений: <strong className="text-white">{reports.length}</strong></span>
          <div className="flex items-center gap-2">
            <a
              href="/api/export/geojson"
              download
              className="flex items-center gap-1 hover:text-cyan-400 font-medium transition-colors"
            >
              <Download className="w-3 h-3" />
              <span>{t.export_geojson}</span>
            </a>
            <span>•</span>
            <a
              href="/api/export/csv"
              download
              className="flex items-center gap-1 hover:text-cyan-400 font-medium transition-colors"
            >
              <Download className="w-3 h-3" />
              <span>{t.export_csv}</span>
            </a>
          </div>
        </div>
      </div>

      {/* Reports Grid/List */}
      {reports.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-slate-900/60 border border-slate-800 text-slate-400 text-sm">
          По заданным фильтрам обращений не найдено.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {reports.map(report => {
            const isCritical = report.priority.level === 'CRITICAL';
            const isResolved = report.status === 'RESOLVED' || report.status === 'CONFIRMED_BY_CITIZEN';

            const prioBorder = isCritical
              ? 'border-rose-800/80 hover:border-rose-500'
              : report.priority.level === 'HIGH'
              ? 'border-amber-800/80 hover:border-amber-500'
              : 'border-slate-800 hover:border-slate-700';

            return (
              <div
                key={report.id}
                onClick={() => onSelectReport(report)}
                className={`p-4 rounded-2xl bg-slate-900 border ${prioBorder} transition-all hover:bg-slate-850 cursor-pointer shadow-lg hover:shadow-cyan-500/5 group flex flex-col justify-between gap-3`}
              >
                <div>
                  {/* Top Badges */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] font-bold text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800/60">
                        {report.short_code}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        isCritical
                          ? 'bg-rose-950/80 text-rose-300 border border-rose-800'
                          : report.priority.level === 'HIGH'
                          ? 'bg-amber-950/80 text-amber-300 border border-amber-800'
                          : 'bg-slate-800 text-slate-300'
                      }`}>
                        {report.priority.level} ({report.priority.score})
                      </span>
                    </div>

                    <span className="text-[11px] font-medium text-slate-400">
                      {t.statuses[report.status] || report.status}
                    </span>
                  </div>

                  {/* Title and Media Thumbnail */}
                  <div className="flex gap-3">
                    <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-slate-800 bg-black">
                      <img
                        src={report.media_thumbnail_url || report.media_url}
                        alt="Фото дефекта"
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                      />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-sm text-white group-hover:text-cyan-300 transition-colors line-clamp-1">
                        {report.title}
                      </h4>
                      <p className="text-xs text-slate-400 line-clamp-2 mt-0.5">
                        {report.ai_analysis.description_ai}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Footer Info */}
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-[11px]">
                      <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="truncate max-w-[140px]">{report.context.location.district}</span>
                    </span>
                    <span className="flex items-center gap-1 text-[11px]">
                      <ThumbsUp className="w-3 h-3 text-slate-500" />
                      <span>{report.confirmations_count}</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-1 text-cyan-400 font-semibold group-hover:translate-x-1 transition-transform">
                    <span>Подробнее</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
