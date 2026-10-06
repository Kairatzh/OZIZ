import React from 'react';
import {
  ShieldAlert,
  MapPin,
  Flame,
  Radio,
  BarChart3,
  Coins,
  PlusCircle,
  Globe,
  Bell,
} from 'lucide-react';
import { Language, translations } from '../i18n/translations.ts';

interface NavbarProps {
  currentTab: 'map' | 'dispatch' | 'transparency' | 'ledger';
  setTab: (tab: 'map' | 'dispatch' | 'transparency' | 'ledger') => void;
  lang: Language;
  setLang: (lang: Language) => void;
  openSubmitModal: () => void;
  criticalCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  setTab,
  lang,
  setLang,
  openSubmitModal,
  criticalCount,
}) => {
  const t = translations[lang];

  return (
    <header className="sticky top-0 z-50 bg-slate-950/85 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setTab('map')}>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 p-0.5 shadow-lg shadow-cyan-500/20">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-cyan-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-white via-slate-100 to-cyan-400 bg-clip-text text-transparent">
                {t.app_title}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Solana Devnet
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block truncate max-w-xs">
              {t.app_subtitle}
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-xs font-medium text-slate-300">
          <button
            onClick={() => setTab('map')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${
              currentTab === 'map'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                : 'hover:text-white hover:bg-slate-800'
            }`}
          >
            <MapPin className="w-4 h-4" />
            <span>{t.tab_map_feed}</span>
          </button>

          <button
            onClick={() => setTab('dispatch')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all relative ${
              currentTab === 'dispatch'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                : 'hover:text-white hover:bg-slate-800'
            }`}
          >
            <Radio className="w-4 h-4" />
            <span>{t.tab_dispatch}</span>
            {criticalCount > 0 && (
              <span className="inline-flex items-center justify-center px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-600 text-white">
                {criticalCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setTab('transparency')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${
              currentTab === 'transparency'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                : 'hover:text-white hover:bg-slate-800'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>{t.tab_transparency}</span>
          </button>

          <button
            onClick={() => setTab('ledger')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${
              currentTab === 'ledger'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                : 'hover:text-white hover:bg-slate-800'
            }`}
          >
            <Coins className="w-4 h-4" />
            <span>{t.tab_ledger}</span>
          </button>
        </nav>

        {/* Actions & Language */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Language selector */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs text-slate-400">
            <Globe className="w-3.5 h-3.5 ml-1.5 text-slate-500" />
            {(['ru', 'kk', 'en'] as Language[]).map(l => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`px-2 py-1 rounded text-[11px] font-semibold uppercase transition-all ${
                  lang === l
                    ? 'bg-slate-800 text-cyan-400 shadow-sm'
                    : 'hover:text-slate-200'
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          {/* Primary CTA Button */}
          <button
            onClick={openSubmitModal}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 shadow-lg shadow-cyan-500/25 active:scale-95 transition-all cursor-pointer"
          >
            <PlusCircle className="w-4 h-4 stroke-[2.5]" />
            <span className="hidden xs:inline">{t.report_problem}</span>
            <span className="xs:hidden">SOS</span>
          </button>
        </div>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <div className="md:hidden flex items-center justify-around bg-slate-900/95 border-t border-slate-800 py-2 px-2 text-[11px]">
        <button
          onClick={() => setTab('map')}
          className={`flex flex-col items-center gap-1 ${currentTab === 'map' ? 'text-cyan-400 font-bold' : 'text-slate-400'}`}
        >
          <MapPin className="w-4 h-4" />
          <span>Карта</span>
        </button>
        <button
          onClick={() => setTab('dispatch')}
          className={`flex flex-col items-center gap-1 relative ${currentTab === 'dispatch' ? 'text-cyan-400 font-bold' : 'text-slate-400'}`}
        >
          <Radio className="w-4 h-4" />
          <span>Диспетчер</span>
          {criticalCount > 0 && (
            <span className="absolute -top-1 right-2 w-2 h-2 rounded-full bg-rose-500" />
          )}
        </button>
        <button
          onClick={() => setTab('transparency')}
          className={`flex flex-col items-center gap-1 ${currentTab === 'transparency' ? 'text-cyan-400 font-bold' : 'text-slate-400'}`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Рейтинги</span>
        </button>
        <button
          onClick={() => setTab('ledger')}
          className={`flex flex-col items-center gap-1 ${currentTab === 'ledger' ? 'text-cyan-400 font-bold' : 'text-slate-400'}`}
        >
          <Coins className="w-4 h-4" />
          <span>Solana</span>
        </button>
      </div>
    </header>
  );
};
