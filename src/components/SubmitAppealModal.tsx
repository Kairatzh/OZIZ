import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Camera,
  MapPin,
  Mic,
  MicOff,
  Upload,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  RotateCw,
  Image as ImageIcon,
} from 'lucide-react';
import { Language, translations } from '../i18n/translations.ts';
import { CreateReportPayload } from '../shared/types.ts';

interface SubmitAppealModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitSuccess: (newReport: any) => void;
  lang: Language;
}

const SAMPLE_DEMO_PHOTOS = [
  {
    name: 'Яма на дороге',
    url: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=1200&q=85',
    text: 'Опасная глубокая яма на перекрестке, уже несколько машин повредили диски',
  },
  {
    name: 'Открытый люк (SOS)',
    url: 'https://images.unsplash.com/photo-1584467735871-8e85353a8413?auto=format&fit=crop&w=1200&q=85',
    text: 'Открытый колодец без крышки прямо на пешеходной дорожке возле детсада!',
  },
  {
    name: 'Поваленное дерево',
    url: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=1200&q=85',
    text: 'Ветровал перекрыл полосу движения и оборвал кабель',
  },
  {
    name: 'Стихийная свалка',
    url: 'https://images.unsplash.com/photo-1611284446314-60a58ac0deb9?auto=format&fit=crop&w=1200&q=85',
    text: 'Гора строительного мусора и мешков на газоне в парковой зоне',
  },
];

export const SubmitAppealModal: React.FC<SubmitAppealModalProps> = ({
  isOpen,
  onClose,
  onSubmitSuccess,
  lang,
}) => {
  if (!isOpen) return null;

  const [step, setStep] = useState<'form' | 'processing' | 'done'>('form');
  const [imageBase64, setImageBase64] = useState<string>('');
  const [imagePreview, setImagePreview] = useState<string>('');
  const [userText, setUserText] = useState<string>('');
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({ lat: 51.1342, lng: 71.4308 });
  const [accuracyM, setAccuracyM] = useState<number>(12);
  const [address, setAddress] = useState<string>('пр. Мангилик Ел, 28');
  const [district, setDistrict] = useState<string>('Есильский район');
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [processingStage, setProcessingStage] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  const t = translations[lang];

  // Geolocation on open
  useEffect(() => {
    if (navigator.geolocation) {
      setIsLocating(true);
      navigator.geolocation.getCurrentPosition(
        pos => {
          setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setAccuracyM(Math.round(pos.coords.accuracy));
          setIsLocating(false);
        },
        err => {
          console.warn('Geolocation fallback to city center:', err);
          setIsLocating(false);
        },
        { enableHighAccuracy: true, timeout: 6000 }
      );
    }
  }, []);

  // Compress image on client via HTML5 Canvas (max 1600px) and strip EXIF
  const processImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1600;
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          // Exporting as clean JPEG strips original EXIF headers
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.82);
          setImagePreview(compressedDataUrl);
          setImageBase64(compressedDataUrl);
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  const selectDemoSample = async (sample: typeof SAMPLE_DEMO_PHOTOS[0]) => {
    try {
      const res = await fetch(sample.url);
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setImagePreview(base64);
        setImageBase64(base64);
        if (!userText) {
          setUserText(sample.text);
        }
      };
      reader.readAsDataURL(blob);
    } catch {
      setImagePreview(sample.url);
      setImageBase64(sample.url);
      if (!userText) setUserText(sample.text);
    }
  };

  // Voice input via Web Speech API
  const toggleSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Голосовой ввод не поддерживается вашим браузером');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    try {
      const rec = new SpeechRecognition();
      rec.lang = lang === 'kk' ? 'kk-KZ' : lang === 'en' ? 'en-US' : 'ru-RU';
      rec.continuous = false;
      rec.interimResults = false;

      rec.onstart = () => setIsListening(true);
      rec.onresult = (evt: any) => {
        const transcript = evt.results[0][0].transcript;
        setUserText(prev => (prev ? `${prev} ${transcript}` : transcript));
      };
      rec.onerror = () => setIsListening(false);
      rec.onend = () => setIsListening(false);

      recognitionRef.current = rec;
      rec.start();
    } catch (err) {
      console.warn('Speech rec error:', err);
      setIsListening(false);
    }
  };

  const handleSubmit = async () => {
    if (!imageBase64) {
      setErrorMsg('Пожалуйста, добавьте фото дефекта');
      return;
    }

    setErrorMsg('');
    setStep('processing');

    const stages = [
      '1/5: Очистка EXIF и локальное сжатие медиа...',
      '2/5: Мультимодальный анализ Gemini 3.8 Vision...',
      '3/5: Запрос метеорологического контекста Open-Meteo...',
      '4/5: Расчет объяснимого приоритета и подбор службы...',
      '5/5: Минтинг записи в неизменяемом реестре Solana (Devnet)...',
    ];

    let stageIdx = 0;
    setProcessingStage(stages[stageIdx]);
    const interval = setInterval(() => {
      stageIdx = (stageIdx + 1) % stages.length;
      setProcessingStage(stages[stageIdx]);
    }, 750);

    try {
      const payload: CreateReportPayload = {
        image_base64: imageBase64,
        user_text: userText,
        lat: coords.lat,
        lng: coords.lng,
        accuracy_m: accuracyM,
        address,
        district,
      };

      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      clearInterval(interval);

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Ошибка отправки обращения');
      }

      const data = await res.json();
      setStep('done');
      setTimeout(() => {
        onSubmitSuccess(data.report);
        onClose();
      }, 1600);
    } catch (err: any) {
      clearInterval(interval);
      setStep('form');
      setErrorMsg(err.message || 'Сбой отправки. Проверьте сеть.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-6">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
            <h3 className="text-lg font-bold text-white">
              {step === 'processing'
                ? 'Регистрация обращения'
                : step === 'done'
                ? 'Заявка принята!'
                : t.report_problem}
            </h3>
          </div>
          {step === 'form' && (
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Form Body */}
        {step === 'form' && (
          <div className="p-6 space-y-5">
            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* 1. Touch 1: Photo Capture */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                1. Фото дефекта (Камера или файл):
              </label>

              {imagePreview ? (
                <div className="relative rounded-xl overflow-hidden aspect-video border border-slate-700 bg-black group">
                  <img src={imagePreview} alt="Превью" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-lg bg-cyan-500 text-slate-950 font-bold text-xs"
                    >
                      Заменить фото
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl border-2 border-dashed border-slate-700 hover:border-cyan-500 p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all bg-slate-950/50 hover:bg-slate-950"
                >
                  <div className="w-12 h-12 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center mb-3">
                    <Camera className="w-6 h-6" />
                  </div>
                  <span className="text-sm font-bold text-white mb-1">Сделать фото или выбрать из галереи</span>
                  <span className="text-xs text-slate-400">EXIF удаляется автоматически на клиенте</span>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
              />

              {/* Sample demo buttons for quick testing */}
              <div className="mt-2.5">
                <span className="text-[11px] text-slate-500 block mb-1.5">Либо выберите тестовый шаблон дефекта:</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {SAMPLE_DEMO_PHOTOS.map((sample, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => selectDemoSample(sample)}
                      className="px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-cyan-500/60 text-[11px] font-medium text-slate-300 truncate transition-all text-left"
                    >
                      {sample.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 2. Touch 2: Location Confirmation */}
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                  2. GPS-координаты и адрес:
                </span>
                <span className={`text-[11px] font-mono ${accuracyM > 50 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  Точность: ±{accuracyM} м
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div>
                  <input
                    type="text"
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    placeholder="Адрес дефекта"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    value={district}
                    onChange={e => setDistrict(e.target.value)}
                    placeholder="Район города"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {accuracyM > 50 && (
                <p className="text-[11px] text-amber-400/90">
                  ⚠️ Точность GPS более 50 м. Пожалуйста, проверьте и скорректируйте адрес вручную.
                </p>
              )}
            </div>

            {/* 3. Touch 3: Text or Voice Note */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <label className="font-semibold text-slate-300">
                  3. Текст описания (необязательно):
                </label>
                <button
                  type="button"
                  onClick={toggleSpeechRecognition}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${
                    isListening
                      ? 'bg-rose-500 text-white animate-pulse'
                      : 'bg-slate-800 text-cyan-400 hover:bg-slate-700'
                  }`}
                >
                  {isListening ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                  <span>{isListening ? 'Слушаю...' : 'Голосовой ввод'}</span>
                </button>
              </div>
              <textarea
                value={userText}
                onChange={e => setUserText(e.target.value)}
                placeholder="Например: Глубокая яма напротив остановки, открытый люк..."
                rows={2}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>

            {/* Submit Action */}
            <div className="pt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={handleSubmit}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 shadow-lg shadow-cyan-500/25 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>Отправить и закрепить в Solana</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-3 rounded-xl border border-slate-800 text-slate-400 hover:text-white text-xs font-semibold"
              >
                Отмена
              </button>
            </div>
          </div>
        )}

        {/* Processing State */}
        {step === 'processing' && (
          <div className="p-10 flex flex-col items-center justify-center text-center space-y-4">
            <div className="relative w-16 h-16">
              <div className="w-16 h-16 rounded-full border-4 border-cyan-500/20 border-t-cyan-400 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-cyan-400" />
              </div>
            </div>
            <div>
              <h4 className="text-base font-bold text-white mb-1">Обработка гражданского обращения</h4>
              <p className="text-xs text-cyan-300 font-mono transition-all animate-pulse">{processingStage}</p>
            </div>
          </div>
        )}

        {/* Done State */}
        {step === 'done' && (
          <div className="p-10 flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center animate-bounce">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h4 className="text-lg font-bold text-white">Заявка успешно зарегистрирована!</h4>
            <p className="text-xs text-slate-400 max-w-sm">
              ИИ выполнил верификацию, городская служба оповещена, а транзакция зафиксирована в блокчейне Solana.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
