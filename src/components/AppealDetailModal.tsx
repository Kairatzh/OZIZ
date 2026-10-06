import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import {
  X,
  ShieldCheck,
  ExternalLink,
  Flame,
  CheckCircle2,
  AlertTriangle,
  Clock,
  MapPin,
  CloudRain,
  Eye,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
  Link2,
  Layers,
  ArrowRight,
  BadgeAlert,
  Activity,
  FileCheck,
} from 'lucide-react';
import { CivicAppeal } from '../shared/types.ts';
import { Language, translations } from '../i18n/translations.ts';

interface AppealDetailModalProps {
  report: CivicAppeal | null;
  onClose: () => void;
  onConfirm: (id: string) => Promise<void>;
  onVote: (id: string, isFixed: boolean) => Promise<void>;
  lang: Language;
}

export const AppealDetailModal: React.FC<AppealDetailModalProps> = ({
  report,
  onClose,
  onConfirm,
  onVote,
  lang,
}) => {
  if (!report) return null;

  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [verificationResult, setVerificationResult] = useState<{
    isValid: boolean;
    message: string;
    auditTrail: any[];
  } | null>(null);

  const [hasConfirmed, setHasConfirmed] = useState<boolean>(false);
  const [hasVoted, setHasVoted] = useState<'repaired' | 'not_repaired' | null>(null);
  const [showAfterPhoto, setShowAfterPhoto] = useState<boolean>(false);

  const t = translations[lang];

  const handleConfirmClick = async () => {
    if (hasConfirmed) return;
    setHasConfirmed(true);
    await onConfirm(report.id);
  };

  const handleVoteClick = async (isFixed: boolean) => {
    if (hasVoted) return;
    setHasVoted(isFixed ? 'repaired' : 'not_repaired');
    if (isFixed) {
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.7 },
      });
    }
    await onVote(report.id, isFixed);
  };

  const runImmutabilityAudit = async () => {
    setIsVerifying(true);
    try {
      const res = await fetch(`/api/solana/verify/${report.id}`);
      const data = await res.json();
      setVerificationResult(data.verification);
    } catch (err) {
      console.error('Audit failed:', err);
    } finally {
      setIsVerifying(false);
    }
  };

  const priorityColor =
    report.priority.level === 'CRITICAL'
      ? 'text-rose-400 bg-rose-950/60 border-rose-800'
      : report.priority.level === 'HIGH'
      ? 'text-amber-400 bg-amber-950/60 border-amber-800'
      : report.priority.level === 'MEDIUM'
      ? 'text-yellow-400 bg-yellow-950/60 border-yellow-800'
      : 'text-emerald-400 bg-emerald-950/60 border-emerald-800';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-6 max-h-[92vh] flex flex-col">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs font-bold text-cyan-400 bg-cyan-950/80 px-2.5 py-1 rounded-md border border-cyan-800/80">
              {report.short_code}
            </span>
            <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${priorityColor}`}>
              {report.priority.level} ({report.priority.score}/100)
            </span>
            <span className="text-xs text-slate-400 hidden sm:inline">
              {new Date(report.created_at).toLocaleString('ru-RU')}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Modal Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Title & Location */}
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-1.5">
              {report.title}
            </h2>
            <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-400">
              <MapPin className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>{report.context.location.address}</span>
              <span className="text-slate-600">•</span>
              <span className="text-slate-300 font-medium">{report.context.location.district}</span>
            </div>
          </div>

          {/* Photo & Resolution Proof Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold text-slate-300">Исходное фото дефекта</span>
                <span className="font-mono text-[11px] text-slate-500">EXIF очищен ✓</span>
              </div>
              <div className="relative rounded-xl overflow-hidden border border-slate-800 aspect-video bg-black flex items-center justify-center">
                <img
                  src={report.media_url}
                  alt="Дефект"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            {/* Resolution Photo or Description */}
            <div className="space-y-2">
              {report.resolution_media_url ? (
                <>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Фото устранения службы
                    </span>
                    <span className="text-emerald-500 font-mono text-[11px]">Работы завершены</span>
                  </div>
                  <div className="relative rounded-xl overflow-hidden border border-emerald-900/60 aspect-video bg-black flex items-center justify-center">
                    <img
                      src={report.resolution_media_url}
                      alt="Устранение"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </>
              ) : (
                <div className="h-full rounded-xl border border-slate-800 bg-slate-950/40 p-4 flex flex-col justify-between">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-400 mb-2">Описание заявителя</h4>
                    <p className="text-sm text-slate-200 italic">
                      "{report.user_description || 'Заявитель не оставил текстового комментария'}"
                    </p>
                  </div>

                  {/* Citizen confirmation button */}
                  <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between">
                    <div className="text-xs text-slate-400">
                      Подтверждений жителей: <span className="text-cyan-400 font-bold">{report.confirmations_count}</span>
                    </div>
                    <button
                      onClick={handleConfirmClick}
                      disabled={hasConfirmed}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        hasConfirmed
                          ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700 cursor-default'
                          : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-md shadow-cyan-500/20 active:scale-95'
                      }`}
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                      <span>{hasConfirmed ? 'Вы подтвердили' : 'Я тоже вижу (+1)'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Citizen Resolution Voting (If Resolved) */}
          {(report.status === 'RESOLVED' || report.status === 'CONFIRMED_BY_CITIZEN') && (
            <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/40 to-slate-900 border border-emerald-800/60 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Голосование жителей за качество устранения
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Если дефект не устранен, голос автоматически переоткрывает жалобу и фиксирует нарушение SLA.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleVoteClick(true)}
                  disabled={hasVoted !== null}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition-all ${
                    hasVoted === 'repaired'
                      ? 'bg-emerald-600 text-white border-emerald-400'
                      : 'bg-emerald-950/60 text-emerald-300 border-emerald-700 hover:bg-emerald-900'
                  }`}
                >
                  <ThumbsUp className="w-3.5 h-3.5" />
                  <span>Починено ({report.citizen_votes.repaired})</span>
                </button>
                <button
                  onClick={() => handleVoteClick(false)}
                  disabled={hasVoted !== null}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition-all ${
                    hasVoted === 'not_repaired'
                      ? 'bg-rose-600 text-white border-rose-400'
                      : 'bg-rose-950/60 text-rose-300 border-rose-700 hover:bg-rose-900'
                  }`}
                >
                  <ThumbsDown className="w-3.5 h-3.5" />
                  <span>Не починено ({report.citizen_votes.not_repaired})</span>
                </button>
              </div>
            </div>
          )}

          {/* AI Multimodal Vision Breakdown */}
          <div className="p-5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-cyan-400">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span>Мультимодальный анализ Gemini 3.8 Flash</span>
              </div>
              <span className="text-xs font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/80">
                Достоверность {(report.ai_analysis.confidence * 100).toFixed(0)}%
              </span>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              {report.ai_analysis.description_ai}
            </p>

            {/* AI Tags Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-slate-500 block mb-0.5">Тяжесть дефекта</span>
                <span className="font-bold text-white text-sm flex items-center gap-1">
                  {report.ai_analysis.severity}/5
                  {report.ai_analysis.severity >= 4 && <Flame className="w-3.5 h-3.5 text-rose-500" />}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-slate-500 block mb-0.5">Оценка габаритов</span>
                <span className="font-bold text-white text-sm">
                  {report.ai_analysis.estimated_size.value} {report.ai_analysis.estimated_size.unit}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-slate-500 block mb-0.5">Опасность для</span>
                <span className="font-medium text-slate-200">
                  {report.ai_analysis.hazard_to.join(', ')}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-slate-500 block mb-0.5">Чрезвычайный статус</span>
                <span className={`font-bold text-sm ${report.ai_analysis.is_emergency ? 'text-rose-400' : 'text-slate-400'}`}>
                  {report.ai_analysis.is_emergency ? 'ЭКСТРЕННЫЙ (112)' : 'Штатный'}
                </span>
              </div>
            </div>

            {/* Objects detected tags */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-xs text-slate-500 mr-1">Распознанные объекты:</span>
              {report.ai_analysis.detected_objects.map((obj, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-900 text-slate-300 border border-slate-800"
                >
                  {obj}
                </span>
              ))}
            </div>
          </div>

          {/* Explainable Priority Engine Breakdown */}
          <div className="p-5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-amber-400">
                <Activity className="w-4 h-4 text-amber-400" />
                <span>Формула приоритета (Объяснимый ИИ)</span>
              </div>
              <span className="font-mono text-xs text-slate-400">
                Итоговый балл: <span className="font-bold text-white text-sm">{report.priority.score}</span> / 100
              </span>
            </div>

            {/* Factors Bar Breakdown */}
            <div className="space-y-2 pt-1 text-xs">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-400">Тяжесть дефекта (ИИ, вес 25%)</span>
                  <span className="font-mono text-slate-300">+{report.priority.factors.severity_norm.contribution} б.</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5">
                  <div className="bg-rose-500 h-1.5 rounded-full" style={{ width: `${(report.priority.factors.severity_norm.contribution / 25) * 100}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-400">
                    Риск локации: {report.priority.factors.location_risk.note} (вес 20%)
                  </span>
                  <span className="font-mono text-slate-300">+{report.priority.factors.location_risk.contribution} б.</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5">
                  <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: `${(report.priority.factors.location_risk.contribution / 20) * 100}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-400">
                    Погода & осадки: {report.priority.factors.weather_factor.note} (вес 15%)
                  </span>
                  <span className="font-mono text-slate-300">+{report.priority.factors.weather_factor.contribution} б.</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5">
                  <div className="bg-cyan-500 h-1.5 rounded-full" style={{ width: `${(report.priority.factors.weather_factor.contribution / 15) * 100}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-400">Подтверждения жителей ({report.confirmations_count} чел., вес 15%)</span>
                  <span className="font-mono text-slate-300">+{report.priority.factors.duplicates_factor.contribution} б.</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5">
                  <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${(report.priority.factors.duplicates_factor.contribution / 15) * 100}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Municipal Service & SLA Status */}
          <div className="p-5 rounded-2xl bg-slate-950/70 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs text-slate-500 block mb-1">Ответственная городская служба:</span>
              <h4 className="text-base font-bold text-white">{report.assigned_service_name}</h4>
              <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                <span>Дедлайн SLA: {new Date(report.sla_deadline).toLocaleString('ru-RU')}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {report.sla_violated ? (
                <div className="px-3 py-1.5 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <span>SLA НАРУШЕН</span>
                </div>
              ) : (
                <div className="px-3 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>В рамках SLA</span>
                </div>
              )}
            </div>
          </div>

          {/* Solana Blockchain Ledger Section */}
          <div className="p-5 rounded-2xl bg-gradient-to-b from-indigo-950/30 to-slate-950 border border-indigo-900/60 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-400" />
                <h4 className="text-sm font-bold text-white">Реестр Solana: Неизменяемый аудит-трейл</h4>
              </div>
              <a
                href={report.onchain.explorer_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-semibold underline underline-offset-4"
              >
                <span>Solana Explorer Devnet</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {/* Hashes & PDA */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                <span className="text-slate-500 text-[10px] block">PDA Адрес аккаунта:</span>
                <span className="text-slate-300 truncate block">{report.onchain.report_pda}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                <span className="text-slate-500 text-[10px] block">IPFS CIDv1 медиа-контента:</span>
                <span className="text-slate-300 truncate block">{report.onchain.media_cid}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                <span className="text-slate-500 text-[10px] block">SHA-256 медиа (Exif-free):</span>
                <span className="text-slate-300 truncate block">{report.onchain.media_sha256}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                <span className="text-slate-500 text-[10px] block">Финальный хэш цепочки:</span>
                <span className="text-slate-300 truncate block">{report.onchain.last_event_hash}</span>
              </div>
            </div>

            {/* Event Hash Chain Timeline */}
            <div className="space-y-2 pt-2">
              <h5 className="text-xs font-semibold text-slate-400">Цепочка событий статусов (Append-Only):</h5>
              <div className="space-y-1.5">
                {report.events.map((evt, idx) => (
                  <div
                    key={evt.id || idx}
                    className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-cyan-400 font-bold">#{evt.seq}</span>
                      <span className="font-semibold text-white">{evt.status}</span>
                      <span className="text-slate-500">•</span>
                      <span className="text-slate-400">{evt.actor_title}</span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 truncate max-w-xs">
                      hash: {evt.event_hash.slice(0, 16)}...
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Run Immutability Proof Button */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-800">
              <button
                onClick={runImmutabilityAudit}
                disabled={isVerifying}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold text-xs shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <FileCheck className="w-4 h-4" />
                <span>{isVerifying ? 'Выполняется аудит...' : 'Запустить аудит неизменяемости'}</span>
              </button>

              {verificationResult && (
                <div
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg border flex items-center gap-1.5 ${
                    verificationResult.isValid
                      ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700'
                      : 'bg-rose-950/80 text-rose-300 border-rose-700'
                  }`}
                >
                  {verificationResult.isValid ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span>{verificationResult.message}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
