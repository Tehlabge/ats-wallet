/**
 * Вибрация при нажатии на важные кнопки (подтверждение, отмена сессии, главные действия).
 * На десктопе navigator.vibrate может отсутствовать — вызов безопасен.
 */
export function vibrate(pattern: number | number[] = 10): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(pattern);
  }
}

/** Короткая вибрация для обычного нажатия (кнопки, выбор). */
export function vibrateLight(): void {
  vibrate(8);
}

/** Двойная вибрация для важного действия (подтверждение, отправка). */
export function vibrateSuccess(): void {
  vibrate([10, 50, 10]);
}

/** Серия для ошибки или предупреждения. */
export function vibrateWarning(): void {
  vibrate([10, 30, 10, 30, 10]);
}
