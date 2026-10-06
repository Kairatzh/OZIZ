import React, { useEffect, useState, useCallback } from 'react';
import { Navbar } from './components/Navbar.tsx';
import { CivicMapView } from './components/CivicMapView.tsx';
import { FeedListView } from './components/FeedListView.tsx';
import { AppealDetailModal } from './components/AppealDetailModal.tsx';
import { SubmitAppealModal } from './components/SubmitAppealModal.tsx';
import { OperatorDispatchView } from './components/OperatorDispatchView.tsx';
import { TransparencyView } from './components/TransparencyView.tsx';
import { SolanaLedgerView } from './components/SolanaLedgerView.tsx';
import { CivicAppeal, MunicipalService } from './shared/types.ts';
import { Language } from './i18n/translations.ts';
import { Map, ListFilter, Plus, Radio, ShieldCheck, Flame, Bell } from 'lucide-react';

export default function App() {
  const [reports, setReports] = useState<CivicAppeal[]>([]);
  const [services, setServices] = useState<MunicipalService[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Tabs & Views
  const [currentTab, setCurrentTab] = useState<'map' | 'dispatch' | 'transparency' | 'ledger'>('map');
  const [mapSubView, setMapSubView] = useState<'split' | 'map_only' | 'list_only'>('split');
  const [lang, setLang] = useState<Language>('ru');

  // Modals
  const [selectedReport, setSelectedReport] = useState<CivicAppeal | null>(null);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState<boolean>(false);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedPriority, setSelectedPriority] = useState<string>('all');
  const [selectedDistrict, setSelectedDistrict] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Toast notifications for real-time SSE
  const [liveToast, setLiveToast] = useState<{ title: string; desc: string } | null>(null);

  // Fetch initial data
  const fetchData = useCallback(async () => {
    try {
      const [reportsRes, servicesRes] = await Promise.all([
        fetch('/api/reports'),
        fetch('/api/services'),
      ]);
      const reportsData = await reportsRes.json();
      const servicesData = await servicesRes.json();

      if (reportsData.success) {
        setReports(reportsData.reports);
      }
      if (servicesData.success) {
        setServices(servicesData.services);
      }
    } catch (err) {
      console.error('Failed to load civic data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Connect to SSE stream for real-time dispatch and status updates
  useEffect(() => {
    const eventSource = new EventSource('/api/events/live');

    eventSource.addEventListener('report_created', (e: any) => {
      try {
        const newReport: CivicAppeal = JSON.parse(e.data);
        setReports(prev => [newReport, ...prev.filter(r => r.id !== newReport.id)]);
        setLiveToast({
          title: `Новое обращение: ${newReport.short_code}`,
          desc: newReport.title,
        });
      } catch (err) {
        console.warn('SSE parse error:', err);
      }
    });

    eventSource.addEventListener('report_updated', (e: any) => {
      try {
        const updated: CivicAppeal = JSON.parse(e.data);
        setReports(prev => prev.map(r => (r.id === updated.id ? updated : r)));
        if (selectedReport?.id === updated.id) {
          setSelectedReport(updated);
        }
      } catch (err) {
        console.warn('SSE parse error:', err);
      }
    });

    eventSource.addEventListener('report_confirmed', (e: any) => {
      try {
        const updated: CivicAppeal = JSON.parse(e.data);
        setReports(prev => prev.map(r => (r.id === updated.id ? updated : r)));
        if (selectedReport?.id === updated.id) {
          setSelectedReport(updated);
        }
      } catch (err) {
        console.warn('SSE parse error:', err);
      }
    });

    return () => {
      eventSource.close();
    };
  }, [selectedReport]);

  // Auto-dismiss toast
  useEffect(() => {
    if (liveToast) {
      const timer = setTimeout(() => setLiveToast(null), 4500);
      return () => clearTimeout(timer);
    }
  }, [liveToast]);

  const handleConfirmReport = async (id: string) => {
    try {
      const res = await fetch(`/api/reports/${id}/confirm`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setReports(prev => prev.map(r => (r.id === id ? data.report : r)));
        setSelectedReport(data.report);
      }
    } catch (err) {
      console.error('Confirm error:', err);
    }
  };

  const handleVoteReport = async (id: string, isFixed: boolean) => {
    try {
      const res = await fetch(`/api/reports/${id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_fixed: isFixed }),
      });
      const data = await res.json();
      if (data.success) {
        setReports(prev => prev.map(r => (r.id === id ? data.report : r)));
        setSelectedReport(data.report);
      }
    } catch (err) {
      console.error('Vote error:', err);
    }
  };

  const handleUpdateStatus = async (
    id: string,
    status: any,
    actorTitle: string,
    note: string,
    mediaUrl?: string
  ) => {
    const res = await fetch(`/api/reports/${id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status,
        actor_title: actorTitle,
        note,
        resolution_media_url: mediaUrl,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Ошибка обновления статуса');
    }
    if (data.success) {
      setReports(prev => prev.map(r => (r.id === id ? data.report : r)));
      if (selectedReport?.id === id) {
        setSelectedReport(data.report);
      }
    }
  };

  // Filtered reports for map & feed
  const filteredReports = reports.filter(r => {
    if (selectedCategory !== 'all' && r.category !== selectedCategory) return false;
    if (selectedStatus !== 'all' && r.status !== selectedStatus) return false;
    if (selectedPriority !== 'all' && r.priority.level !== selectedPriority) return false;
    if (
      selectedDistrict !== 'all' &&
      !r.context.location.district.toLowerCase().includes(selectedDistrict.toLowerCase())
    ) {
      return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const match =
        r.title.toLowerCase().includes(q) ||
        r.short_code.toLowerCase().includes(q) ||
        r.context.location.address.toLowerCase().includes(q) ||
        (r.user_description && r.user_description.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  const criticalCount = reports.filter(
    r => r.priority.level === 'CRITICAL' && r.status !== 'RESOLVED' && r.status !== 'CONFIRMED_BY_CITIZEN'
  ).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased">
      {/* Navbar */}
      <Navbar
        currentTab={currentTab}
        setTab={setCurrentTab}
        lang={lang}
        setLang={setLang}
        openSubmitModal={() => setIsSubmitModalOpen(true)}
        criticalCount={criticalCount}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {loading ? (
          <div className="py-24 text-center space-y-3">
            <div className="w-10 h-10 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin mx-auto" />
            <p className="text-sm text-slate-400">Инициализация защищенного реестра OZIZ...</p>
          </div>
        ) : (
          <>
            {/* Tab 1: Map and Feed */}
            {currentTab === 'map' && (
              <div className="space-y-6">
                {/* Sub-view toggle for mobile / desktop layout */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs font-semibold text-slate-300">
                      Интерактивная карта и реестр городских дефектов
                    </span>
                  </div>

                  <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 text-xs">
                    <button
                      onClick={() => setMapSubView('split')}
                      className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                        mapSubView === 'split' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Карта + Лента
                    </button>
                    <button
                      onClick={() => setMapSubView('map_only')}
                      className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                        mapSubView === 'map_only' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Только карта
                    </button>
                    <button
                      onClick={() => setMapSubView('list_only')}
                      className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                        mapSubView === 'list_only' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Только лента
                    </button>
                  </div>
                </div>

                {/* Map Display */}
                {mapSubView !== 'list_only' && (
                  <CivicMapView
                    reports={filteredReports}
                    selectedReport={selectedReport}
                    onSelectReport={report => setSelectedReport(report)}
                    lang={lang}
                  />
                )}

                {/* Feed Display */}
                {mapSubView !== 'map_only' && (
                  <FeedListView
                    reports={filteredReports}
                    selectedCategory={selectedCategory}
                    setSelectedCategory={setSelectedCategory}
                    selectedStatus={selectedStatus}
                    setSelectedStatus={setSelectedStatus}
                    selectedPriority={selectedPriority}
                    setSelectedPriority={setSelectedPriority}
                    selectedDistrict={selectedDistrict}
                    setSelectedDistrict={setSelectedDistrict}
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    onSelectReport={report => setSelectedReport(report)}
                    lang={lang}
                  />
                )}
              </div>
            )}

            {/* Tab 2: Service Operator Dispatch */}
            {currentTab === 'dispatch' && (
              <OperatorDispatchView
                reports={reports}
                services={services}
                onUpdateStatus={handleUpdateStatus}
                onSelectReport={report => setSelectedReport(report)}
                lang={lang}
              />
            )}

            {/* Tab 3: Public Transparency Leaderboard */}
            {currentTab === 'transparency' && (
              <TransparencyView lang={lang} />
            )}

            {/* Tab 4: Solana On-Chain Explorer */}
            {currentTab === 'ledger' && (
              <SolanaLedgerView
                reports={reports}
                onSelectReport={report => setSelectedReport(report)}
                lang={lang}
              />
            )}
          </>
        )}
      </main>

      {/* Appeal Detail Modal */}
      <AppealDetailModal
        report={selectedReport}
        onClose={() => setSelectedReport(null)}
        onConfirm={handleConfirmReport}
        onVote={handleVoteReport}
        lang={lang}
      />

      {/* 3-Touch Submit Appeal Modal */}
      <SubmitAppealModal
        isOpen={isSubmitModalOpen}
        onClose={() => setIsSubmitModalOpen(false)}
        onSubmitSuccess={newReport => {
          setReports(prev => [newReport, ...prev]);
          setSelectedReport(newReport);
        }}
        lang={lang}
      />

      {/* Live SSE Toast Notification */}
      {liveToast && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-2xl bg-slate-900/95 border border-cyan-500/60 shadow-2xl shadow-cyan-500/20 backdrop-blur-md max-w-sm flex items-start gap-3 animate-in fade-in slide-in-from-bottom-5">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
            <Bell className="w-4 h-4 animate-bounce" />
          </div>
          <div className="min-w-0">
            <h5 className="text-xs font-bold text-white truncate">{liveToast.title}</h5>
            <p className="text-[11px] text-slate-300 line-clamp-1">{liveToast.desc}</p>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-white">OZIZ Civic Registry</span>
            <span>•</span>
            <span>Неизменяемый реестр на Solana</span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Open-Meteo API</span>
            <span>•</span>
            <span>Gemini 3.8 Flash Vision</span>
            <span>•</span>
            <a href="/api/export/geojson" className="hover:text-cyan-400">
              Open Data GeoJSON
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
