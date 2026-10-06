import React, { useState } from 'react';
import {
  Radio,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Truck,
  Phone,
  Mail,
  Volume2,
  VolumeX,
  ExternalLink,
  Flame,
  ShieldAlert,
  ArrowRight,
  Upload,
} from 'lucide-react';
import { CivicAppeal, MunicipalService } from '../shared/types.ts';
import { Language, translations } from '../i18n/translations.ts';

interface OperatorDispatchViewProps {
  reports: CivicAppeal[];
  services: MunicipalService[];
  onUpdateStatus: (
    id: string,
    status: any,
    actorTitle: string,
    note: string,
    mediaUrl?: string
  ) => Promise<void>;
  onSelectReport: (report: CivicAppeal) => void;
  lang: Language;
}

export const OperatorDispatchView: React.FC<OperatorDispatchViewProps> = ({
  reports,
  services,
  onUpdateStatus,
  onSelectReport,
  lang,
}) => {
  const [selectedServiceId, setSelectedServiceId] = useState<string>('all');
  const [isAudioEnabled, setIsAudioEnabled] = useState<boolean>(true);

  // Status Action Modal State
  const [activeActionReport, setActiveActionReport] = useState<CivicAppeal | null>(null);
  const [actionType, setActionType] = useState<'in_progress' | 'resolved' | 'rejected'>('in_progress');
  const [actionNote, setActionNote] = useState<string>('');
  const [resolutionPhotoUrl, setResolutionPhotoUrl] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string>('');

  const t = translations[lang];

  // Filter reports for dispatch queue
  let queue = reports.filter(r => r.status !== 'RESOLVED' && r.status !== 'CONFIRMED_BY_CITIZEN');
  if (selectedServiceId !== 'all') {
    queue = queue.filter(r => r.assigned_service_id === selectedServiceId);
  }

  const handleOpenAction = (report: CivicAppeal, type: 'in_progress' | 'resolved' | 'rejected') => {
    setActiveActionReport(report);
    setActionType(type);
    setActionNote(
      type === 'in_progress'
        ? 'Аварийная бригада выехала на место'
        : type === 'resolved'
        ? 'Дефект устранен. Асфальтирование/замена завершены в полном объеме'
        : ''
    );
    setResolutionPhotoUrl(
      type === 'resolved'
        ? 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=800&q=80'
        : ''
    );
    setActionError('');
  };

  const submitStatusChange = async () => {
    if (!activeActionReport) return;

    if (actionType === 'rejected' && !actionNote.trim()) {
      setActionError('Публичное обоснование отказа ОБЯЗАТЕЛЬНО (требование реестра Solana)!');
      return;
    }

    setIsSubmitting(true);
    try {
      const status =
        actionType === 'in_progress'
          ? 'IN_PROGRESS'
          : actionType === 'resolved'
          ? 'RESOLVED'
          : 'REJECTED';

      const actor =
        services.find(s => s.id === activeActionReport.assigned_service_id)?.name ||
        'Оператор диспетчерской службы';

      await onUpdateStatus(
        activeActionReport.id,
        status,
        actor,
        actionNote,
        resolutionPhotoUrl || undefined
      );

      setActiveActionReport(null);
    } catch (err: any) {
      setActionError(err.message || 'Ошибка обновления статуса');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Dispatch Controls */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Radio className="w-5 h-5 text-rose-500 animate-pulse" />
            <h3 className="text-lg font-bold text-white">Единый центр оперативного реагирования</h3>
          </div>
          <p className="text-xs text-slate-400">
            Маршрутизация обращений в реальном времени, фиксация статусов в блокчейне Solana и контроль соблюдения SLA
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Audio Chime Toggle */}
          <button
            onClick={() => setIsAudioEnabled(!isAudioEnabled)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
              isAudioEnabled
                ? 'bg-cyan-950/80 text-cyan-300 border-cyan-800'
                : 'bg-slate-950 text-slate-500 border-slate-800'
            }`}
          >
            {isAudioEnabled ? <Volume2 className="w-4 h-4 text-cyan-400" /> : <VolumeX className="w-4 h-4" />}
            <span>{isAudioEnabled ? 'Звук включен' : 'Без звука'}</span>
          </button>

          {/* Service Selector */}
          <select
            value={selectedServiceId}
            onChange={e => setSelectedServiceId(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-medium focus:outline-none focus:border-cyan-500"
          >
            <option value="all">Все городские службы ({services.length})</option>
            {services.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Services SLA Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
        {services.map(service => {
          const isSelected = selectedServiceId === service.id;
          return (
            <div
              key={service.id}
              onClick={() => setSelectedServiceId(isSelected ? 'all' : service.id)}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-slate-850 border-cyan-500 shadow-md shadow-cyan-500/10'
                  : 'bg-slate-900 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="font-bold text-white truncate mb-1">{service.name.split(' ')[0]}</div>
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>В работе: <strong className="text-cyan-400">{service.stats.in_progress}</strong></span>
                <span>SLA: <strong className={service.stats.sla_violations > 0 ? 'text-rose-400' : 'text-emerald-400'}>{service.stats.sla_violations}</strong></span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Dispatch Active Queue */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-slate-300 flex items-center gap-2">
            <span>Очередь неотложных обращений:</span>
            <span className="px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 font-mono text-xs border border-cyan-800">
              {queue.length}
            </span>
          </h4>
        </div>

        {queue.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-slate-900 border border-slate-800 text-slate-400 text-sm">
            В очереди выбранной службы нет активных заявок. Все задачи устранены!
          </div>
        ) : (
          <div className="space-y-3">
            {queue.map(report => {
              const isCritical = report.priority.level === 'CRITICAL';
              const slaRemainingHours = Math.round(
                (new Date(report.sla_deadline).getTime() - Date.now()) / (3600 * 1000)
              );

              return (
                <div
                  key={report.id}
                  className={`p-5 rounded-2xl bg-slate-900 border transition-all flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 ${
                    isCritical
                      ? 'border-rose-800/80 bg-gradient-to-r from-rose-950/20 to-slate-900'
                      : 'border-slate-800'
                  }`}
                >
                  {/* Left Report Info */}
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-slate-800 bg-black">
                      <img
                        src={report.media_thumbnail_url || report.media_url}
                        alt="Фото"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-cyan-400">
                          {report.short_code}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isCritical
                            ? 'bg-rose-950 text-rose-300 border border-rose-800'
                            : 'bg-amber-950 text-amber-300 border border-amber-800'
                        }`}>
                          {report.priority.level} ({report.priority.score})
                        </span>
                        <span className="text-xs text-slate-400">
                          {report.assigned_service_name}
                        </span>
                      </div>
                      <h4
                        onClick={() => onSelectReport(report)}
                        className="font-bold text-sm text-white hover:text-cyan-400 cursor-pointer transition-colors"
                      >
                        {report.title}
                      </h4>
                      <p className="text-xs text-slate-400 line-clamp-1">
                        {report.context.location.address} • {report.context.location.district}
                      </p>
                    </div>
                  </div>

                  {/* Middle SLA Countdown */}
                  <div className="shrink-0 text-xs">
                    {report.sla_violated || slaRemainingHours < 0 ? (
                      <div className="px-3 py-1.5 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 font-bold flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-rose-400" />
                        <span>SLA НАРУШЕН ({Math.abs(slaRemainingHours)} ч назад)</span>
                      </div>
                    ) : (
                      <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 font-medium flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-cyan-400" />
                        <span>Осталось до SLA: <strong className="text-white">{slaRemainingHours} ч</strong></span>
                      </div>
                    )}
                  </div>

                  {/* Right Operator Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0 w-full lg:w-auto">
                    {report.status !== 'IN_PROGRESS' && (
                      <button
                        onClick={() => handleOpenAction(report, 'in_progress')}
                        className="px-3 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 text-xs font-bold transition-all flex items-center gap-1.5"
                      >
                        <Truck className="w-3.5 h-3.5" />
                        <span>В работу</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleOpenAction(report, 'resolved')}
                      className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Устранено</span>
                    </button>

                    <button
                      onClick={() => handleOpenAction(report, 'rejected')}
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-rose-950 hover:text-rose-300 text-slate-400 text-xs font-semibold border border-slate-700 transition-all flex items-center gap-1.5"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Отклонить</span>
                    </button>

                    <button
                      onClick={() => onSelectReport(report)}
                      className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
                      title="Детали"
                    >
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Operator Action Modal */}
      {activeActionReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>Смена статуса:</span>
              <span className="font-mono text-cyan-400">{activeActionReport.short_code}</span>
            </h3>

            {actionError && (
              <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                {actionType === 'rejected'
                  ? 'Обязательное публичное обоснование отказа:'
                  : 'Комментарий оператора / службы:'}
              </label>
              <textarea
                value={actionNote}
                onChange={e => setActionNote(e.target.value)}
                rows={3}
                placeholder={
                  actionType === 'rejected'
                    ? 'Укажите причину (не входит в компетенцию, дубликат, ложный вызов)...'
                    : 'Отчет о выполненных действиях...'
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {actionType === 'resolved' && (
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Фото устранения (URL или загрузка доказательства):
                </label>
                <input
                  type="text"
                  value={resolutionPhotoUrl}
                  onChange={e => setResolutionPhotoUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            )}

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400">
              ⛓️ Новое событие будет криптографически подписано и добавлено в неизменяемый хэш-реестр на Solana.
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setActiveActionReport(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={submitStatusChange}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 active:scale-95 transition-all"
              >
                {isSubmitting ? 'Запись в блокчейн...' : 'Подтвердить и зафиксировать'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
