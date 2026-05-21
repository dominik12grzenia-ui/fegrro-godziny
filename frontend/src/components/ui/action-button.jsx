import React, { useState, useRef, useCallback } from 'react';
import { Button } from './button';
import { Check, Loader2 } from 'lucide-react';

/**
 * Uniwersalny przycisk z natychmiastowym feedbackiem:
 * - po kliknięciu: disabled + spinner + tekst "loadingText"
 * - po sukcesie: ✓ + tekst "successText" przez 1.5s, potem wraca do normy
 * - po błędzie: shake + wraca do normy
 * Zapobiega wielokrotnym klikaniem.
 *
 * Props:
 * - onAction: async () => any  -- akcja API; throw lub reject => błąd
 * - children: tekst normalnego stanu
 * - loadingText: tekst trakcie ładowania (domyślnie "Trwa...")
 * - successText: tekst po sukcesie (domyślnie children, prefixed ✓)
 * - showSuccessFor: ms (domyślnie 1500)
 * - resetOnError: bool (domyślnie true) - czy wraca do normalnego stanu po błędzie
 * - successClass: dodatkowe klasy w stanie sukcesu
 * - ...rest: wszystkie props Buttona
 */
export const ActionButton = React.forwardRef(({
  onAction,
  children,
  loadingText = 'Trwa...',
  successText = null,
  showSuccessFor = 1500,
  resetOnError = true,
  successClass = 'bg-[#3F5235]/60 text-[#9DBC85] border-[#5F7552]',
  className = '',
  disabled,
  onClick,
  ...rest
}, ref) => {
  const [state, setState] = useState('idle'); // 'idle' | 'loading' | 'success' | 'error'
  const mountedRef = useRef(true);
  const successTimerRef = useRef(null);

  React.useEffect(() => () => {
    mountedRef.current = false;
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
  }, []);

  const handleClick = useCallback(async (e) => {
    if (state !== 'idle') return; // już w trakcie / sukces — ignoruj
    if (onClick) onClick(e);
    if (!onAction) return;
    setState('loading');
    try {
      await onAction();
      if (!mountedRef.current) return;
      setState('success');
      successTimerRef.current = setTimeout(() => {
        if (mountedRef.current) setState('idle');
      }, showSuccessFor);
    } catch (err) {
      if (!mountedRef.current) return;
      setState('error');
      // shake przez 400ms potem powrót
      setTimeout(() => {
        if (mountedRef.current && resetOnError) setState('idle');
      }, 400);
    }
  }, [state, onAction, onClick, showSuccessFor, resetOnError]);

  const isBusy = state === 'loading';
  const isSuccess = state === 'success';
  const isError = state === 'error';

  return (
    <Button
      ref={ref}
      onClick={handleClick}
      disabled={disabled || isBusy || isSuccess}
      className={`${className} ${isSuccess ? successClass : ''} ${isError ? 'animate-shake' : ''} transition-all`}
      {...rest}
    >
      {isBusy && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
      {isSuccess && <Check className="h-3.5 w-3.5 mr-1.5" />}
      {isBusy ? loadingText : isSuccess ? (successText || `✓ ${children}`) : children}
    </Button>
  );
});

ActionButton.displayName = 'ActionButton';
