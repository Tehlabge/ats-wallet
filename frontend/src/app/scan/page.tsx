'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import jsQR from 'jsqr';
import {
  previewPayment,
  createPayment,
  getPaymentStatus,
  getBalance,
  sendScanLog,
  sendComponentLog,
  getPublicUsdtRubRate,
  getMe,
  type PreviewPaymentResult,
} from '@/lib/api';
import { playPaymentSound, preloadSounds } from '@/lib/sounds';
import BottomNav from '@/components/BottomNav';

/** Иконка Tether (USDT) — локальный логотип по умолчанию. */
function UsdtIcon({ className }: { className?: string }) {
  return (
    <img
      src="/icons/tether-usdt-logo.png"
      alt="USDT"
      className={`object-contain ${className ?? ''}`}
    />
  );
}

type ScanState = 'idle' | 'preview' | 'paying' | 'waiting' | 'confirmed' | 'rejected';

const SCAN_THROTTLE_MS = 2500;

/** Нормализация как в бэкенде: одна строка, без переносов. Опционально decodeURIComponent. */
function normalizePayload(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let s = raw.trim();
  s = s.replace(/\r\n/g, '').replace(/\n/g, '').replace(/\r/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  try {
    if (s.includes('%') && /%[0-9A-Fa-f]{2}/.test(s)) {
      const decoded = decodeURIComponent(s);
      if (decoded.length > 0) s = decoded;
    }
  } catch {
    // оставляем как есть
  }
  return s;
}

/** Проверка формата QR СБП: qr.nspk.ru, sub.nspk.ru или platiqr.ru. */
function isNspkPayload(payload: string): boolean {
  if (!payload || payload.length < 20) return false;
  const lower = payload.toLowerCase();
  
  // platiqr.ru с amount=
  if (lower.includes('platiqr.ru') && lower.includes('amount=')) {
    return true;
  }
  
  // Стандартный формат НСПК
  const isNspkHost = lower.includes('qr.nspk.ru') || lower.includes('sub.nspk.ru');
  if (!isNspkHost) return false;
  // Полная форма: есть sum= в query или type= (sub.nspk.ru)
  if (lower.includes('sum=') || lower.includes('type=')) return true;
  // Короткая форма: qr.nspk.ru/AD... или sub.nspk.ru/AB... (данные на странице по ссылке)
  return /(qr|sub)\.nspk\.ru\/[a-z0-9]+/i.test(payload.trim());
}

export default function ScanPage() {
  const [payload, setPayload] = useState('');
  const [preview, setPreview] = useState<PreviewPaymentResult | null>(null);
  const [paymentId, setPaymentId] = useState<number | null>(null);
  const [state, setState] = useState<ScanState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [invalidFormat, setInvalidFormat] = useState(false); // неверный формат QR (не СБП) — красная рамка
  const [rejectReason, setRejectReason] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<'checking' | 'available' | 'unavailable'>('checking');
  const [cameraRequesting, setCameraRequesting] = useState(false);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [scanKey, setScanKey] = useState(0);
  const [balanceUsdt, setBalanceUsdt] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [usdtRubRate, setUsdtRubRate] = useState<number | null>(null);
  const [commissionPercent, setCommissionPercent] = useState<number>(0);
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrRef = useRef<{ stop(): Promise<void> } | null>(null);
  const scannerStartedRef = useRef(false);
  const scannerActiveRef = useRef(false);
  const componentMountedRef = useRef(true);
  const lastScannedRef = useRef<{ text: string; time: number }>({ text: '', time: 0 });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const manualInputRef = useRef<HTMLTextAreaElement>(null);
  const userClosedPayRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scanLogUserIdRef = useRef<string | null>(null);
  const [photoProcessing, setPhotoProcessing] = useState(false);
  const [cameraContainerReady, setCameraContainerReady] = useState(false);

  useEffect(() => {
    getMe().then((me) => { scanLogUserIdRef.current = me?.id ?? null; }).catch(() => {});
  }, []);

  useEffect(() => {
    componentMountedRef.current = true;
    preloadSounds();
    sendComponentLog('scanner', 'opened');
    return () => {
      componentMountedRef.current = false;
    };
  }, []);

  const resetResult = useCallback(() => {
    setPreview(null);
    setPaymentId(null);
    setState('idle');
    setError(null);
    setInvalidFormat(false);
    setBalanceUsdt(null);
    setBalanceLoading(true);
  }, []);

  const onScan = useCallback(async (decoded: string, source: 'camera' | 'paste' | 'manual' = 'camera') => {
    const cleaned = normalizePayload(decoded);
    if (!cleaned || cleaned.length < 10) {
      if (decoded?.trim() || cleaned) {
        sendScanLog({ userId: scanLogUserIdRef.current ?? undefined, source, decoded: decoded?.trim() ?? decoded, cleaned: cleaned ?? '', outcome: 'error', message: 'payload too short' });
      }
      return;
    }
    if (!componentMountedRef.current) return;
    if (!isNspkPayload(cleaned)) {
      setError('Неверный формат QR-кода');
      setInvalidFormat(true);
      setPayload(cleaned);
      sendScanLog({ userId: scanLogUserIdRef.current ?? undefined, source, decoded, cleaned, outcome: 'not_nspk', message: 'Не НСПК' });
      return;
    }
    const now = Date.now();
    if (
      lastScannedRef.current.text === cleaned &&
      now - lastScannedRef.current.time < SCAN_THROTTLE_MS
    ) {
      sendScanLog({ userId: scanLogUserIdRef.current ?? undefined, source, decoded, cleaned, outcome: 'throttle' });
      return;
    }
    lastScannedRef.current = { text: cleaned, time: now };
    setPayload(cleaned);
    setError(null);
    setInvalidFormat(false);
    setPreview(null);
    setState('idle');
    try {
      const data = await previewPayment(cleaned);
      if (!componentMountedRef.current) return;
      setPreview(data);
      if (data.valid) {
        setState('preview');
        sendScanLog({ userId: scanLogUserIdRef.current ?? undefined, source, decoded, cleaned, outcome: 'ok' });
        sendComponentLog('scanner', 'preview_ok', { source });
      } else {
        const msg = data.error ?? 'Не удалось определить сумму по QR';
        setError(msg);
        setInvalidFormat(false);
        sendScanLog({ userId: scanLogUserIdRef.current ?? undefined, source, decoded, cleaned, outcome: 'error', message: msg });
        sendComponentLog('scanner', 'preview_fail', { source, error: msg });
      }
    } catch {
      if (!componentMountedRef.current) return;
      setError('Не удалось распознать QR. Вставьте ссылку вручную.');
      setInvalidFormat(false);
      sendScanLog({ userId: scanLogUserIdRef.current ?? undefined, source, decoded, cleaned, outcome: 'error', message: 'previewPayment failed' });
      sendComponentLog('scanner', 'preview_fail', { source, error: 'previewPayment failed' });
    }
  }, []);

  const CAMERA_PERMISSION_KEY = 'ats_camera_permission';

  const requestCameraAccess = async () => {
    if (!navigator.mediaDevices?.getUserMedia || cameraRequesting) return;
    setCameraRequesting(true);
    try {
      localStorage.removeItem(CAMERA_PERMISSION_KEY);
      const constraints: MediaStreamConstraints = {
        video: { facingMode: facing === 'environment' ? { ideal: 'environment' } : 'user' },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      stream.getTracks().forEach((t) => t.stop());
      localStorage.setItem(CAMERA_PERMISSION_KEY, 'granted');
      setCameraStatus('available');
    } catch {
      setCameraStatus('unavailable');
    } finally {
      setCameraRequesting(false);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let mounted = true;
    const resolveCameraStatus = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        if (mounted) setCameraStatus('unavailable');
        return;
      }
      const stored = localStorage.getItem(CAMERA_PERMISSION_KEY);
      if (stored === 'granted') {
        if (mounted) setCameraStatus('available');
        return;
      }
      try {
        const perm = navigator.permissions?.query;
        if (perm) {
          const result = await perm.call(navigator.permissions, { name: 'camera' as PermissionName });
          if (!mounted) return;
          if (result.state === 'granted') {
            localStorage.setItem(CAMERA_PERMISSION_KEY, 'granted');
            setCameraStatus('available');
            return;
          }
          if (result.state === 'denied') {
            localStorage.setItem(CAMERA_PERMISSION_KEY, 'denied');
            setCameraStatus('unavailable');
            return;
          }
        }
      } catch {
        // Permission API не поддерживается (например Safari)
      }
      if (mounted) setCameraStatus('available');
    };
    resolveCameraStatus();
    return () => { mounted = false; };
  }, []);

  useLayoutEffect(() => {
    if (cameraStatus === 'available' && scannerRef.current) {
      setCameraContainerReady(true);
    } else if (cameraStatus !== 'available') {
      setCameraContainerReady(false);
    }
  }, [cameraStatus]);

  useEffect(() => {
    if (typeof window === 'undefined' || !scannerRef.current || manualMode || cameraStatus !== 'available' || state !== 'idle' || !cameraContainerReady) return;
    scannerActiveRef.current = true;
    let mounted = true;
    const id = 'qr-reader';
    const container = scannerRef.current;

    const load = async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        const existing = container?.querySelector(`#${id}`);
        if (container && !existing) {
          const div = document.createElement('div');
          div.id = id;
          div.style.width = '100%';
          div.style.height = '100%';
          div.style.minHeight = '280px';
          div.style.overflow = 'hidden';
          container.appendChild(div);
        }
        const html5Qr = new Html5Qrcode(id);
        html5QrRef.current = html5Qr;
        // html5-qrcode: ровно 1 ключ; facingMode — строка или объект с ключом exact (ideal не принимает)
        const cameraConstraints: MediaTrackConstraints = {
          facingMode: facing === 'environment' ? 'environment' : 'user',
        };
        await new Promise((r) => setTimeout(r, 350));
        if (!mounted || !scannerActiveRef.current) return;
        const onSuccess = (decodedText: string, result?: { decodedText?: string }) => {
          if (!scannerActiveRef.current || !mounted) return;
          const text = (result?.decodedText ?? decodedText) || decodedText;
          const cleaned = normalizePayload(text);
          if (!cleaned || cleaned.length < 10) return;
          setTimeout(() => {
            if (scannerActiveRef.current && mounted && componentMountedRef.current) {
              onScan(text, 'camera');
            }
          }, 0);
        };
        const scanConfig = {
          fps: 20,
          aspectRatio: 1.0,
          qrbox: (w: number, h: number) => {
            const side = Math.min(360, Math.floor(Math.min(w, h) * 0.88));
            return { width: Math.max(200, side), height: Math.max(200, side) };
          },
        };
        const tryStart = (constraints: MediaTrackConstraints) =>
          html5Qr.start(constraints, scanConfig, onSuccess, () => {});

        try {
          await tryStart(cameraConstraints);
        } catch (firstErr) {
          const isOverconstrained =
            firstErr instanceof DOMException &&
            (firstErr.name === 'OverconstrainedError' || firstErr.name === 'NotFoundError');
          if (isOverconstrained && mounted && scannerActiveRef.current) {
            const fallbackConstraints: MediaTrackConstraints = {
              facingMode: facing === 'environment' ? 'environment' : 'user',
            };
            await tryStart(fallbackConstraints);
          } else {
            throw firstErr;
          }
        }
        if (mounted && scannerActiveRef.current) {
          scannerStartedRef.current = true;
          setCameraReady(true);
          try {
            localStorage.setItem(CAMERA_PERMISSION_KEY, 'granted');
          } catch {}
        }
      } catch (err) {
        if (mounted && componentMountedRef.current) {
          const isPermissionDenied =
            err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
          if (isPermissionDenied) {
            try {
              localStorage.setItem(CAMERA_PERMISSION_KEY, 'denied');
            } catch {}
            setCameraStatus('unavailable');
            setError('Камера недоступна. Разрешите доступ в настройках браузера или нажмите «Разрешить камеру».');
          } else {
            setCameraStatus('unavailable');
            setError('Не удалось запустить камеру. Попробуйте «Фото» или «Ссылка».');
          }
        }
      }
    };
    load();

    return () => {
      mounted = false;
      const wasStarted = scannerStartedRef.current;
      scannerActiveRef.current = false;
      scannerStartedRef.current = false;
      const html5Qr = html5QrRef.current;
      html5QrRef.current = null;
      if (html5Qr && wasStarted) {
        html5Qr.stop().catch(() => {});
      }
      const div = container?.querySelector(`#${id}`);
      if (div?.parentNode) div.parentNode.removeChild(div);
    };
  }, [manualMode, cameraStatus, cameraContainerReady, facing, scanKey, onScan, state]);

  const switchCamera = useCallback(() => {
    setFacing((f) => (f === 'environment' ? 'user' : 'environment'));
    setScanKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (state !== 'preview' || !preview?.valid) return;
    let mounted = true;
    setBalanceLoading(true);
    getBalance()
      .then((b: { usdt?: string }) => {
        if (mounted) {
          setBalanceUsdt(b?.usdt != null ? String(b.usdt) : '0');
          setBalanceLoading(false);
        }
      })
      .catch(() => {
        if (mounted) {
          setBalanceUsdt('0');
          setBalanceLoading(false);
        }
      });
    getPublicUsdtRubRate()
      .then((r) => { if (mounted) setUsdtRubRate(r.usdtRub); })
      .catch(() => { if (mounted) setUsdtRubRate(0); });
    getMe()
      .then((me) => {
        if (!mounted) return;
        const p = me?.commissionPercent;
        if (p != null && p !== '') {
          const num = parseFloat(String(p).replace(',', '.'));
          if (!Number.isNaN(num) && num >= 0) setCommissionPercent(num);
        }
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, [state, preview?.valid]);

  useEffect(() => {
    if (state !== 'waiting' || paymentId == null) return;
    const tick = async () => {
      const status = await getPaymentStatus(paymentId);
      if (status?.status === 'confirmed') {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setState('confirmed');
      } else if (status?.status === 'rejected') {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        if (status.rejectReason) setRejectReason(status.rejectReason);
        setState('rejected');
      }
    };
    pollRef.current = setInterval(tick, 2000);
    tick();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [state, paymentId]);

  const recognizePayload = async (text: string) => {
    const trimmed = normalizePayload(text || '');
    if (!trimmed) return;
    setError(null);
    setPreview(null);
    setState('idle');
    if (!isNspkPayload(trimmed)) {
      setError('Неверный формат QR-кода');
      setInvalidFormat(true);
      sendScanLog({ userId: scanLogUserIdRef.current ?? undefined, source: 'paste', decoded: trimmed, cleaned: trimmed, outcome: 'not_nspk' });
      return;
    }
    try {
      const data = await previewPayment(trimmed);
      if (!componentMountedRef.current) return;
      setPreview(data);
      if (data.valid) {
        setState('preview');
        sendScanLog({ userId: scanLogUserIdRef.current ?? undefined, source: 'paste', decoded: trimmed, cleaned: trimmed, outcome: 'ok' });
      } else {
        setError(data.error ?? 'Не валидный QR код');
        setInvalidFormat(false);
        sendScanLog({ userId: scanLogUserIdRef.current ?? undefined, source: 'paste', decoded: trimmed, cleaned: trimmed, outcome: 'error', message: data.error ?? '' });
      }
    } catch {
      if (componentMountedRef.current) {
        setError('Не валидный QR код');
        setInvalidFormat(false);
      }
      sendScanLog({ userId: scanLogUserIdRef.current ?? undefined, source: 'paste', decoded: trimmed, cleaned: trimmed, outcome: 'error', message: 'preview failed' });
    }
  };

  const handlePasteInField = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData('text')?.trim();
    if (pasted) {
      setPayload(pasted);
      e.preventDefault();
      recognizePayload(pasted);
    }
  };

  const submitManual = async () => {
    const normalized = normalizePayload(payload);
    if (!normalized) return;
    setError(null);
    setPreview(null);
    setState('idle');
    if (!isNspkPayload(normalized)) {
      setError('Неверный формат QR-кода');
      setInvalidFormat(true);
      sendScanLog({ userId: scanLogUserIdRef.current ?? undefined, source: 'manual', decoded: payload, cleaned: normalized, outcome: 'not_nspk' });
      return;
    }
    try {
      const data = await previewPayment(normalized);
      if (!componentMountedRef.current) return;
      setPreview(data);
      if (data.valid) {
        setState('preview');
        sendScanLog({ userId: scanLogUserIdRef.current ?? undefined, source: 'manual', decoded: payload, cleaned: normalized, outcome: 'ok' });
      } else {
        setError(data.error ?? 'Не удалось определить сумму');
        setInvalidFormat(false);
        sendScanLog({ userId: scanLogUserIdRef.current ?? undefined, source: 'manual', decoded: payload, cleaned: normalized, outcome: 'error', message: data.error ?? '' });
      }
    } catch {
      if (componentMountedRef.current) {
        setError('Не удалось распознать. Проверьте ссылку.');
        setInvalidFormat(false);
      }
      sendScanLog({ userId: scanLogUserIdRef.current ?? undefined, source: 'manual', decoded: payload, cleaned: normalized, outcome: 'error', message: 'preview failed' });
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setPhotoProcessing(true);
    setError(null);
    
    try {
      const img = new Image();
      const url = URL.createObjectURL(file);
      
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Не удалось загрузить изображение'));
        img.src = url;
      });
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas не поддерживается');
      
      // Функция для попытки распознавания с заданным размером
      const tryDecode = (width: number, height: number, invert = false, sx?: number, sy?: number, sw?: number, sh?: number): string | null => {
        canvas.width = width;
        canvas.height = height;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        if (sx != null && sy != null && sw != null && sh != null) {
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
        } else {
          ctx.drawImage(img, 0, 0, width, height);
        }
        const imageData = ctx.getImageData(0, 0, width, height);
        if (invert) {
          const data = imageData.data;
          for (let i = 0; i < data.length; i += 4) {
            data[i] = 255 - data[i];
            data[i + 1] = 255 - data[i + 1];
            data[i + 2] = 255 - data[i + 2];
          }
        }
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
        return code?.data || null;
      };

      const maxSize = 3200;
      const scales = [1, 1.5, 2, 0.75, 0.5, 2.5, 3, 0.4, 0.33];
      let qrData: string | null = null;

      for (const scale of scales) {
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const finalW = Math.min(Math.max(w, 200), maxSize);
        const finalH = Math.min(Math.max(h, 200), maxSize);
        qrData = tryDecode(finalW, finalH, false);
        if (qrData) break;
        qrData = tryDecode(finalW, finalH, true);
        if (qrData) break;
      }

      // Фиксированные размеры (удобны для разных пропорций фото)
      if (!qrData) {
        for (const size of [1200, 1000, 800, 600, 1600]) {
          const aspect = img.width / img.height;
          const w = aspect >= 1 ? size : Math.round(size * aspect);
          const h = aspect >= 1 ? Math.round(size / aspect) : size;
          qrData = tryDecode(w, h, false);
          if (qrData) break;
          qrData = tryDecode(w, h, true);
          if (qrData) break;
        }
      }

      // Центральный кроп: QR часто в центре, уменьшаем шум по краям
      if (!qrData && img.width > 400 && img.height > 400) {
        const crop = 0.7;
        const cw = img.width * crop;
        const ch = img.height * crop;
        const cx = (img.width - cw) / 2;
        const cy = (img.height - ch) / 2;
        for (const size of [1000, 800, 1200]) {
          const w = Math.min(size, Math.round(cw));
          const h = Math.min(size, Math.round(ch));
          qrData = tryDecode(w, h, false, cx, cy, cw, ch);
          if (qrData) break;
          qrData = tryDecode(w, h, true, cx, cy, cw, ch);
          if (qrData) break;
        }
      }
      
      URL.revokeObjectURL(url);
      
      if (!qrData) {
        setError('QR-код не найден. Убедитесь, что QR-код чёткий и занимает большую часть фото.');
        setInvalidFormat(false);
        sendScanLog({ userId: scanLogUserIdRef.current ?? undefined, source: 'photo', decoded: '', cleaned: '', outcome: 'not_found', message: 'QR not found in image' });
        return;
      }
      
      const cleaned = normalizePayload(qrData);
      if (!isNspkPayload(cleaned)) {
        setError('Неверный формат QR-кода');
        setInvalidFormat(true);
        setPayload(cleaned);
        sendScanLog({ userId: scanLogUserIdRef.current ?? undefined, source: 'photo', decoded: qrData, cleaned, outcome: 'not_nspk' });
        return;
      }
      
      setPayload(cleaned);
      const data = await previewPayment(cleaned);
      if (!componentMountedRef.current) return;
      setPreview(data);
      if (data.valid) {
        setState('preview');
        sendScanLog({ userId: scanLogUserIdRef.current ?? undefined, source: 'photo', decoded: qrData, cleaned, outcome: 'ok' });
      } else {
        setError(data.error ?? 'Не удалось определить сумму');
        setInvalidFormat(false);
        sendScanLog({ userId: scanLogUserIdRef.current ?? undefined, source: 'photo', decoded: qrData, cleaned, outcome: 'error', message: data.error ?? '' });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка обработки изображения');
      setInvalidFormat(false);
      sendScanLog({ userId: scanLogUserIdRef.current ?? undefined, source: 'photo', decoded: '', cleaned: '', outcome: 'error', message: 'processing failed' });
    } finally {
      setPhotoProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePay = async () => {
    const raw = normalizePayload(payload);
    if (!raw || !preview?.valid) return;
    userClosedPayRef.current = false;
    setError(null);
    playPaymentSound();
    setState('paying');
    try {
      const p = await createPayment(raw);
      if (!componentMountedRef.current || userClosedPayRef.current) return;
      setPaymentId(p.id);
      setState('waiting');
    } catch (e) {
      if (componentMountedRef.current && !userClosedPayRef.current) {
        setError(e instanceof Error ? e.message : 'Ошибка');
        setState('preview');
      }
    }
  };

  const closePayingOrWaiting = () => {
    userClosedPayRef.current = true;
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setPaymentId(null);
    setState('preview');
  };

  const sumUsdtNum = preview?.sumUsdt != null ? Number(preview.sumUsdt) : 0;
  const balanceNum = balanceUsdt != null ? Number(balanceUsdt) : null;
  const hasEnoughBalance = balanceNum != null && balanceNum >= sumUsdtNum;
  const canPay = preview?.valid && preview.sumUsdt != null && !preview.error && hasEnoughBalance;

  const showFullScreenCamera = (state === 'idle' || (state === 'preview' && !preview?.valid)) && !manualMode && cameraStatus === 'available';

  return (
    <div className="w-full max-w-[430px] bg-background-light dark:bg-background-dark min-h-screen shadow-2xl flex flex-col relative overflow-hidden mx-auto">
      {/* Фон без полупрозрачных артефактов */}
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900" />
      {/* Живая иконка как на главном экране (сканер QR) — только в idle */}
      {(state === 'idle' || (state === 'preview' && !preview?.valid)) && !showFullScreenCamera && (
        <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none">
          <span className="material-icons-round text-[120px] text-primary/15 dark:text-primary/10" aria-hidden>qr_code_scanner</span>
        </div>
      )}

      <header className="sticky top-0 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-4 h-16 flex items-center border-b border-slate-100 dark:border-slate-800 relative shrink-0">
        <Link href="/" className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center text-primary" aria-label="Назад">
          <span className="material-symbols-outlined text-[26px]" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400" }}>west</span>
        </Link>
        <h1 className="text-lg font-semibold tracking-tight absolute left-0 right-0 text-center pointer-events-none">Отсканируйте QR-код</h1>
        <div className="w-10 shrink-0" />
      </header>

      <main className={`relative flex-1 flex flex-col min-h-0 ${showFullScreenCamera ? 'overflow-hidden' : 'overflow-y-auto'} px-5 pt-5 pb-40`}>
        {/* Станция оплаты — новый дизайн (bottom-sheet) */}
        {state === 'preview' && preview?.valid && (
          <>
            <div className="fixed inset-0 bg-black/30 z-[60]" aria-hidden />
            <div className="fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center justify-end pointer-events-none">
              <div className="bottom-sheet pointer-events-auto w-full max-w-[430px] min-h-[70dvh] flex flex-col bg-white dark:bg-zinc-900 rounded-t-[32px] px-5 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-[0_-10px_40px_rgba(0,0,0,0.1)] dark:shadow-[0_-10px_40px_rgba(0,0,0,0.4)]">
                <div className="flex items-center justify-between mb-6 shrink-0">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white shadow-sm">
                      <span className="material-icons-round text-lg">account_balance_wallet</span>
                    </div>
                    <span className="font-bold text-lg text-zinc-900 dark:text-white tracking-tight">ATS WALLET</span>
                  </div>
                  <button
                    type="button"
                    onClick={resetResult}
                    className="w-8 h-8 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 rounded-full active:opacity-70"
                    aria-label="Закрыть"
                  >
                    <span className="material-icons-round text-xl">close</span>
                  </button>
                </div>
                <div className="flex flex-col items-center mb-6">
                  <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400 mb-2 font-medium">
                    <span className="material-icons-round text-[18px]">qr_code_2</span>
                    <span className="text-sm">Оплата по QR-коду</span>
                  </div>
                  <h1 className="text-[44px] font-bold text-zinc-900 dark:text-white leading-tight mb-4 tabular-nums">
                    {Number(preview.sumRub).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ₽
                  </h1>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl p-4 mb-6 border border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-0.5">Сумма к оплате</span>
                      <span className="text-xl font-bold text-zinc-900 dark:text-white tabular-nums">
                        {Number(preview.sumUsdt).toLocaleString('ru-RU', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} USDT
                      </span>
                    </div>
                    <div className="w-10 h-10 bg-tether rounded-full flex items-center justify-center shadow-sm shrink-0 p-1.5">
                      <UsdtIcon className="w-full h-full object-contain" />
                    </div>
                  </div>
                  {usdtRubRate != null && usdtRubRate > 0 && (
                    <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700 flex items-center justify-between text-sm">
                      <span className="text-zinc-500 dark:text-zinc-400">Курс</span>
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">
                        1 USDT = {(commissionPercent > 0 ? usdtRubRate * (1 - commissionPercent / 100) : usdtRubRate).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽
                      </span>
                    </div>
                  )}
                </div>
                {balanceUsdt != null && !hasEnoughBalance && (
                  <div className="flex items-center justify-between mb-6 px-1">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 bg-tether/10 rounded-full flex items-center justify-center shrink-0 p-2">
                        <UsdtIcon className="w-full h-full object-contain" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-bold text-zinc-900 dark:text-white">Tether</span>
                        <Link href="/deposit" className="text-sm font-medium text-primary flex items-center gap-0.5 active:opacity-70 transition-opacity w-fit">
                          Пополнить <span className="material-icons-round text-xs">chevron_right</span>
                        </Link>
                      </div>
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                      <span className="font-bold text-zinc-900 dark:text-white tabular-nums">
                        {Number(balanceUsdt).toLocaleString('ru-RU', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} USDT
                      </span>
                      <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500">ваш баланс</span>
                    </div>
                  </div>
                )}
                {balanceLoading && (
                  <div className="mb-6 flex items-center justify-end gap-1 text-sm text-zinc-400 dark:text-zinc-500">
                    <span className="material-icons-round text-base animate-spin">progress_activity</span> Загрузка…
                  </div>
                )}
                {preview.error && (
                  <p className="mb-4 text-amber-600 dark:text-amber-400 text-sm font-medium flex items-center gap-1.5">
                    <span className="material-icons-round text-lg">info</span>
                    {preview.error}
                  </p>
                )}
                <div className="mt-auto pt-4">
                  {canPay ? (
                    <button
                      type="button"
                      onClick={handlePay}
                      className="w-full py-4 bg-primary text-white font-bold rounded-2xl shadow-lg shadow-primary/25 active:scale-[0.98] transition-transform hover:opacity-95 flex items-center justify-center gap-2"
                    >
                      <UsdtIcon className="w-6 h-6 object-contain" />
                      Оплатить {Number(preview.sumUsdt ?? 0).toLocaleString('ru-RU', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} USDT
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="w-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 font-bold py-4 rounded-2xl cursor-not-allowed transition-colors"
                    >
                      Недостаточный баланс
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {(state === 'idle' || (state === 'preview' && !preview?.valid)) && (
          <div className={showFullScreenCamera ? 'flex-1 flex flex-col min-h-0' : ''}>
            {!manualMode ? (
              showFullScreenCamera ? (
                <>
                  <div className={`flex-1 min-h-0 relative bg-slate-900 flex flex-col rounded-3xl overflow-hidden ${invalidFormat ? 'ring-4 ring-red-500 ring-inset' : ''}`}>
                    <div ref={scannerRef} className="absolute inset-0 flex flex-col items-center justify-center [&_#qr-reader]:overflow-hidden [&_#qr-reader]:rounded-3xl [&_#qr-reader_video]:rounded-3xl" />
                    {!cameraReady && (
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
                        <span className="material-icons-round animate-spin text-5xl text-white">progress_activity</span>
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 flex gap-3 p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 safe-area-pb">
                    <button
                      type="button"
                      onClick={switchCamera}
                      className="flex-1 py-3 rounded-xl bg-primary text-white shadow-lg shadow-primary/20 flex flex-col items-center gap-1.5 transition-all active:scale-[0.97]"
                      title="Перевернуть камеру"
                    >
                      <span className="material-icons-round text-[22px]">photo_camera</span>
                      <span className="text-xs font-medium">Камера</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={photoProcessing}
                      className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex flex-col items-center gap-1.5 transition-all active:scale-[0.97] disabled:opacity-60"
                    >
                      {photoProcessing ? (
                        <span className="material-icons-round text-[22px] animate-spin">progress_activity</span>
                      ) : (
                        <span className="material-icons-round text-[22px]">photo_library</span>
                      )}
                      <span className="text-xs font-medium">{photoProcessing ? '...' : 'Фото'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setManualMode(true); setError(null); setInvalidFormat(false); resetResult(); }}
                      className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex flex-col items-center gap-1.5 transition-all active:scale-[0.97]"
                    >
                      <span className="material-icons-round text-[22px]">link</span>
                      <span className="text-xs font-medium">Ссылка</span>
                    </button>
                  </div>
                </>
              ) : (
              <div className="rounded-[28px] overflow-hidden bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 p-4 shadow-lg shadow-slate-200/50 dark:shadow-black/20">
                {cameraStatus === 'checking' && (
                  <div className="min-h-[280px] flex flex-col items-center justify-center py-12 rounded-2xl bg-slate-200/50 dark:bg-slate-700/30">
                    <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                      <span className="material-icons-round animate-spin text-3xl text-primary">progress_activity</span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 text-sm font-medium">Проверка камеры...</p>
                    <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">Секунду</p>
                  </div>
                )}
                {cameraStatus === 'unavailable' && (
                  <div className="min-h-[240px] flex flex-col items-center justify-center py-8 text-center rounded-2xl bg-slate-200/50 dark:bg-slate-700/30">
                    <div className="w-16 h-16 rounded-2xl bg-slate-300 dark:bg-slate-600 flex items-center justify-center mb-4">
                      <span className="material-icons-round text-4xl text-slate-500 dark:text-slate-400">videocam_off</span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 text-sm font-medium mb-1">Камера недоступна</p>
                    <p className="text-slate-500 dark:text-slate-400 text-xs mb-2">В мини-приложении Telegram: откройте меню (три полоски) → Настройки → Разрешения → включите Камеру. Либо нажмите «Разрешить камеру» ниже.</p>
                    <p className="text-slate-500 dark:text-slate-400 text-xs mb-4">Можно также загрузить фото с QR-кодом или вставить ссылку вручную.</p>
                    <div className="flex flex-col gap-3 w-full max-w-[280px]">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={photoProcessing}
                        className="w-full py-3 px-5 rounded-2xl bg-gradient-to-r from-violet-500 to-purple-500 text-white text-sm font-semibold shadow-lg shadow-purple-500/25 active:scale-[0.98] disabled:opacity-70 flex items-center justify-center gap-2"
                      >
                        {photoProcessing ? (
                          <>
                            <span className="material-icons-round animate-spin text-[18px]">progress_activity</span>
                            Обработка…
                          </>
                        ) : (
                          <>
                            <span className="material-icons-round text-[18px]">add_photo_alternate</span>
                            Загрузить фото
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={requestCameraAccess}
                        disabled={cameraRequesting || !navigator.mediaDevices?.getUserMedia}
                        className="w-full py-3 px-5 rounded-2xl bg-primary text-white text-sm font-semibold shadow-lg shadow-primary/25 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {cameraRequesting ? (
                          <>
                            <span className="material-icons-round animate-spin text-[18px]">progress_activity</span>
                            Запрос…
                          </>
                        ) : (
                          <>
                            <span className="material-icons-round text-[18px]">videocam</span>
                            Разрешить камеру
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setManualMode(true); setError(null); setInvalidFormat(false); resetResult(); }}
                        className="w-full py-3 px-5 rounded-2xl bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 text-sm font-semibold active:scale-[0.98]"
                      >
                        Вставить ссылку
                      </button>
                    </div>
                  </div>
                )}
                {cameraStatus === 'available' && (
                  <>
                    <div className={`relative rounded-3xl overflow-hidden bg-slate-900 ring-offset-2 ring-offset-slate-100 dark:ring-offset-slate-800 ${invalidFormat ? 'ring-4 ring-red-500' : 'ring-2 ring-primary/20'}`}>
                      <div ref={scannerRef} className="min-h-[280px] flex flex-col items-center [&_#qr-reader]:overflow-hidden [&_#qr-reader]:rounded-3xl [&_#qr-reader_video]:rounded-3xl" />
                    </div>
                    {!cameraReady && (
                      <div className="flex justify-center py-6">
                        <span className="material-icons-round animate-spin text-4xl text-primary">progress_activity</span>
                      </div>
                    )}
                  </>
                )}
              </div>
              )
            ) : (
              <div className="flex flex-col gap-5">
                <div className={`rounded-2xl bg-white dark:bg-slate-800/80 border-2 shadow-sm overflow-hidden ${invalidFormat ? 'border-red-500 dark:border-red-500' : 'border-slate-200 dark:border-slate-700'}`}>
                  <div className="p-5">
                    <textarea
                      ref={manualInputRef}
                      value={payload}
                      onChange={(e) => setPayload(e.target.value)}
                      onPaste={handlePasteInField}
                      placeholder="Вставьте ссылку СБП..."
                      className={`w-full h-24 p-4 rounded-xl border-2 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 resize-none text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary transition-shadow ${invalidFormat ? 'border-red-500 dark:border-red-500' : 'border-slate-200 dark:border-slate-600'}`}
                      rows={3}
                    />
                    <button
                      type="button"
                      onClick={submitManual}
                      disabled={!payload.trim()}
                      className="w-full mt-3 py-3.5 bg-primary text-white font-semibold rounded-xl active:scale-[0.98] transition-transform flex items-center justify-center gap-2 disabled:opacity-40"
                    >
                      Распознать
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Три кнопки в ряд: Камера, Фото, Ссылка */}
            {!showFullScreenCamera && (
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => { setManualMode(false); resetResult(); }}
                  className={`flex-1 py-3 rounded-xl flex flex-col items-center gap-1.5 transition-all active:scale-[0.97] ${
                    !manualMode && cameraStatus === 'available'
                      ? 'bg-primary text-white shadow-lg shadow-primary/20'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                  disabled={cameraStatus !== 'available'}
                >
                  <span className="material-icons-round text-[22px]">photo_camera</span>
                  <span className="text-xs font-medium">Камера</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={photoProcessing}
                  className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex flex-col items-center gap-1.5 transition-all active:scale-[0.97] disabled:opacity-60"
                >
                  {photoProcessing ? (
                    <span className="material-icons-round text-[22px] animate-spin">progress_activity</span>
                  ) : (
                    <span className="material-icons-round text-[22px]">photo_library</span>
                  )}
                  <span className="text-xs font-medium">{photoProcessing ? '...' : 'Фото'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setManualMode(true); setError(null); setInvalidFormat(false); resetResult(); }}
                  className={`flex-1 py-3 rounded-xl flex flex-col items-center gap-1.5 transition-all active:scale-[0.97] ${
                    manualMode
                      ? 'bg-primary text-white shadow-lg shadow-primary/20'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <span className="material-icons-round text-[22px]">link</span>
                  <span className="text-xs font-medium">Ссылка</span>
                </button>
              </div>
            )}
            
            {/* Скрытый input для загрузки фото */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="hidden"
            />
          </div>
        )}

        {/* Анимация распознавания фото */}
        {photoProcessing && (
          <div className="absolute inset-0 flex flex-col bg-white dark:bg-slate-900 z-20 rounded-b-2xl">
            <div className="flex-1 flex flex-col items-center justify-center px-5">
              <div className="relative w-32 h-32 mb-8">
                {/* Внешний круг с анимацией */}
                <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
                <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin" />
                
                {/* Средний пульсирующий круг */}
                <div className="absolute inset-3 rounded-full bg-primary/10 animate-pulse" />
                
                {/* Иконка QR в центре */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="material-icons-round text-5xl text-primary animate-pulse">qr_code_2</span>
                </div>
                
                {/* Сканирующая линия */}
                <div className="absolute left-4 right-4 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent animate-scan-line" />
              </div>
              
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">Распознаём QR-код</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm text-center max-w-[240px]">
                Анализируем изображение...
              </p>
              
              {/* Точки загрузки */}
              <div className="mt-6 flex gap-1.5">
                <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        {/* В пути / Оплачено / Не оплачено — полная заливка области под шапкой (шапка «Отсканируйте QR-код» и крестик остаются) */}
        {(state === 'paying' || state === 'waiting' || state === 'confirmed' || state === 'rejected') && (
          <div className="absolute inset-0 flex flex-col bg-white dark:bg-slate-900 z-10 rounded-b-2xl">
            <div className="relative flex-1 flex flex-col items-center justify-center px-5 py-12 min-h-0">
              {state === 'paying' && (
                <>
                  <button
                    type="button"
                    onClick={closePayingOrWaiting}
                    className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 active:opacity-70 z-10"
                    aria-label="Закрыть"
                  >
                    <span className="material-icons-round text-xl">close</span>
                  </button>
                  <div className="w-20 h-20 rounded-2xl bg-primary/15 flex items-center justify-center mb-6">
                    <span className="material-icons-round text-4xl text-primary animate-spin">progress_activity</span>
                  </div>
                  <p className="text-base font-semibold text-slate-700 dark:text-slate-200">Создание платежа...</p>
                  <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Не закрывайте страницу</p>
                </>
              )}
              {state === 'waiting' && (
                <>
                  <div className="w-36 h-36 flex items-center justify-center mb-6 shrink-0">
                    <span className="text-[9rem] leading-none select-none" role="img" aria-label="Ожидание">⏳</span>
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">В пути!</h3>
                  <p className="text-slate-600 dark:text-slate-300 text-center text-sm max-w-[280px] leading-relaxed">
                    Оплата по QR-коду произойдёт в течение 50 секунд. Обычно занимает не более 20 секунд.
                  </p>
                  <div className="mt-8 flex gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2.5 h-2.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2.5 h-2.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </>
              )}
              {state === 'confirmed' && (
                <>
                  <div className="w-36 h-36 flex items-center justify-center mb-6 shrink-0">
                    <span className="text-[9rem] leading-none select-none" role="img" aria-label="Успех">✅</span>
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-1">Оплачено</h3>
                  <p className="text-slate-600 dark:text-slate-300 text-sm mb-8">Средства списаны с баланса</p>
                  <button
                    type="button"
                    onClick={() => { setScanKey((k) => k + 1); resetResult(); setPayload(''); }}
                    className="px-8 py-3.5 bg-primary text-white font-bold rounded-2xl shadow-lg shadow-primary/25 active:scale-[0.98] transition-transform flex items-center gap-2"
                  >
                    <span className="material-icons-round text-[20px]">qr_code_scanner</span>
                    Сканировать снова
                  </button>
                </>
              )}
              {state === 'rejected' && (
                <>
                  <div className="w-36 h-36 flex items-center justify-center mb-6 shrink-0">
                    <span className="text-[9rem] leading-none select-none" role="img" aria-label="Отмена">❌</span>
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Платёж не прошёл</h3>
                  {rejectReason ? (
                    <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6 max-w-[300px]">
                      <p className="text-slate-700 dark:text-slate-200 text-center text-sm leading-relaxed">
                        {rejectReason}
                      </p>
                    </div>
                  ) : (
                    <p className="text-slate-600 dark:text-slate-300 text-center text-sm max-w-[300px] leading-relaxed mb-6">
                      К сожалению, не удалось провести платёж. Попробуйте через 15 минут. Если ошибка сохранится — напишите в тех поддержку.
                    </p>
                  )}
                  <Link
                    href="/profile/support"
                    className="w-full max-w-[280px] py-3.5 bg-primary text-white font-bold rounded-2xl shadow-lg shadow-primary/25 active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
                  >
                    <span className="material-icons-round text-[20px]">chat_bubble_outline</span>
                    Тех поддержка
                  </Link>
                  <button
                    type="button"
                    onClick={() => { setScanKey((k) => k + 1); resetResult(); setPayload(''); setState('idle'); setRejectReason(null); }}
                    className="mt-4 py-2.5 text-slate-600 dark:text-slate-300 text-sm font-medium"
                  >
                    Сканировать снова
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {error && (state === 'idle' || (state === 'preview' && !preview?.valid)) && (
          <div
            className="mt-4 p-4 rounded-2xl bg-red-50/90 dark:bg-red-900/20 border border-red-100 dark:border-red-900/50 text-red-600 dark:text-red-400 text-sm flex items-center gap-3"
            role="alert"
          >
            <span className="material-icons-round text-xl shrink-0">error</span>
            <span>{error}</span>
          </div>
        )}

      </main>

      <BottomNav />
    </div>
  );
}
