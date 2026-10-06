import React, { useState } from 'react';
import {
  Coins,
  ShieldCheck,
  ExternalLink,
  Lock,
  RefreshCw,
  Search,
  CheckCircle2,
  FileCode,
  Flame,
  Binary,
} from 'lucide-react';
import { CivicAppeal } from '../shared/types.ts';
import { Language, translations } from '../i18n/translations.ts';

interface SolanaLedgerViewProps {
  reports: CivicAppeal[];
  onSelectReport: (report: CivicAppeal) => void;
  lang: Language;
}

export const SolanaLedgerView: React.FC<SolanaLedgerViewProps> = ({
  reports,
  onSelectReport,
  lang,
}) => {
  const [filterQuery, setFilterQuery] = useState<string>('');
  const t = translations[lang];

  const totalEvents = reports.reduce((acc, r) => acc + r.events.length, 0);

  const filtered = reports.filter(r =>
    r.short_code.toLowerCase().includes(filterQuery.toLowerCase()) ||
    r.onchain.report_pda.toLowerCase().includes(filterQuery.toLowerCase()) ||
    r.onchain.media_cid.toLowerCase().includes(filterQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Solana Header Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-900/60 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Coins className="w-6 h-6 text-indigo-400" />
            <h3 className="text-xl font-extrabold text-white">
              Децентрализованный реестр Solana (Devnet)
            </h3>
          </div>
          <p className="text-xs text-slate-400 max-w-2xl">
            Каждое обращение закреплено в Program Derived Address (PDA). В программе Anchor отсутствуют
            инструкции удаления (delete) и модификации (update). История ведется методом криптографической
            цепочки хэшей (Append-Only).
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <a
            href="https://explorer.solana.com/address/OZ1ZcivicRegistry1111111111111111111111111111?cluster=devnet"
            target="_blank"
            rel="noreferrer"
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-lg shadow-indigo-600/20"
          >
            <span>Anchor Program on Explorer</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Contract & Relayer Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 font-mono text-xs">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <span className="text-slate-500 text-[10px] block mb-1">ID смарт-контракта (Anchor Program):</span>
          <span className="text-indigo-400 font-bold select-all block truncate">
            OZ1ZcivicRegistry1111111111111111111111111111
          </span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <span className="text-slate-500 text-[10px] block mb-1">Relayer Gasless Oracle Pubkey:</span>
          <span className="text-cyan-400 font-bold select-all block truncate">
            OZIZOracleRelayerPubkey11111111111111111
          </span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <span className="text-slate-500 text-[10px] block mb-1">Зафиксировано событий статусов:</span>
          <span className="text-emerald-400 font-bold text-sm block">
            {totalEvents} ончейн-транзакций
          </span>
        </div>
      </div>

      {/* Proof of Immutability Specification Box */}
      <div className="p-5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <Lock className="w-4 h-4 text-emerald-400" />
          <span>Архитектура защиты от цензуры и подмены:</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-300">
          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
            <strong className="text-white block mb-1">1. Append-Only структура</strong>
            Программа Anchor содержит только инструкции <code className="text-cyan-400">submit_report</code> и <code className="text-cyan-400">append_status</code>. Метод close аккаунта исключен.
          </div>
          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
            <strong className="text-white block mb-1">2. Хэш-цепочка prev_event_hash</strong>
            Каждое новое изменение статуса подписывает SHA-256 предыдущего события. Изменение хотя бы одного байта в прошлом разрушает всю цепочку.
          </div>
          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
            <strong className="text-white block mb-1">3. Публичное обоснование отказа</strong>
            Служба не может отклонить жалобу без ненулевого <code className="text-cyan-400">note_sha256</code>. Любое необоснованное закрытие отклоняется смарт-контрактом.
          </div>
        </div>
      </div>

      {/* Onchain Records Explorer Table */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h4 className="text-sm font-bold text-white">Ончейн-реестр записей обращений</h4>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              value={filterQuery}
              onChange={e => setFilterQuery(e.target.value)}
              placeholder="Поиск по PDA или CID..."
              className="bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="pb-3 pl-2">Код заявки</th>
                <th className="pb-3">PDA Аккаунт</th>
                <th className="pb-3">IPFS CID</th>
                <th className="pb-3 text-center">Событий</th>
                <th className="pb-3 text-center">Статус</th>
                <th className="pb-3 text-right pr-2">Solana Explorer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium text-slate-300">
              {filtered.map(report => (
                <tr key={report.id} className="hover:bg-slate-850/60 transition-colors">
                  <td className="py-3 pl-2">
                    <button
                      onClick={() => onSelectReport(report)}
                      className="font-bold text-cyan-400 hover:underline"
                    >
                      {report.short_code}
                    </button>
                  </td>
                  <td className="py-3">
                    <span className="text-slate-400 truncate max-w-[120px] block" title={report.onchain.report_pda}>
                      {report.onchain.report_pda.slice(0, 16)}...
                    </span>
                  </td>
                  <td className="py-3">
                    <span className="text-slate-400 truncate max-w-[120px] block" title={report.onchain.media_cid}>
                      {report.onchain.media_cid.slice(0, 16)}...
                    </span>
                  </td>
                  <td className="py-3 text-center text-emerald-400 font-bold">
                    {report.events.length}
                  </td>
                  <td className="py-3 text-center">
                    <span className="px-2 py-0.5 rounded text-[10px] font-sans font-semibold bg-slate-800 text-slate-200">
                      {report.status}
                    </span>
                  </td>
                  <td className="py-3 text-right pr-2">
                    <a
                      href={report.onchain.explorer_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-sans text-[11px]"
                    >
                      <span>Транзакция</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
