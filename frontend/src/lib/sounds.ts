let audioCache: { [key: string]: HTMLAudioElement } = {};

function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /android/i.test(navigator.userAgent);
}

export function preloadSounds(): void {
  if (typeof window === 'undefined') return;
  
  const sounds = ['/music/android.mp3', '/music/ios.mp3', '/music/pay.mp3'];
  sounds.forEach((src) => {
    if (!audioCache[src]) {
      const audio = new Audio(src);
      audio.preload = 'auto';
      audio.load();
      audioCache[src] = audio;
    }
  });
}

function playSound(src: string): void {
  if (typeof window === 'undefined') return;
  
  try {
    let audio = audioCache[src];
    if (!audio) {
      audio = new Audio(src);
      audioCache[src] = audio;
    }
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch {
    // Ignore audio errors
  }
}

export function playPaymentSound(): void {
  const src = isAndroid() ? '/music/android.mp3' : '/music/ios.mp3';
  playSound(src);
}

export function playPaySound(): void {
  playSound('/music/pay.mp3');
}
