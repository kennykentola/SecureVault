import { useEffect, useRef, useState, type ClipboardEvent, type FC, type KeyboardEvent } from 'react';
import { Lock } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { KeyManager } from '../crypto/keyManager';

type PinCallback = (pin: string) => void | Promise<void | string>;

interface PinInputProps {
    length?: number;
    onComplete: PinCallback;
    onSetup?: PinCallback;
    onChange?: (pin: string) => void;
    isOpen?: boolean;
    onSuccess?: (result?: string) => void;
    onForgotPin?: () => void;
    variant?: 'modal' | 'embedded';
}

export const PinInput: FC<PinInputProps> = ({
    length = 6,
    onComplete,
    onSetup,
    onChange,
    isOpen,
    onSuccess,
    onForgotPin,
    variant = 'modal',
}) => {
    const [values, setValues] = useState<string[]>(new Array(length).fill(''));
    const [isShaking, setIsShaking] = useState(false);
    const [isSetupMode, setIsSetupMode] = useState(false);
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    useEffect(() => {
        setValues(new Array(length).fill(''));
        setIsShaking(false);
        if (variant === 'modal') {
            setIsSetupMode(false);
        }
    }, [isOpen, length, variant]);

    const focusInput = (index: number) => {
        inputRefs.current[index]?.focus();
    };

    const resetPin = () => {
        setValues(new Array(length).fill(''));
        focusInput(0);
    };

    const handleAction = async (pin: string) => {
        try {
            const result = isSetupMode && onSetup ? await onSetup(pin) : await onComplete(pin);
            onSuccess?.(typeof result === 'string' ? result : undefined);
        } catch {
            setIsShaking(true);
            window.setTimeout(() => setIsShaking(false), 500);
            resetPin();
        }
    };

    const handleChange = (index: number, value: string) => {
        if (!/^\d*$/.test(value)) return;

        const newValues = [...values];
        newValues[index] = value.slice(-1);
        setValues(newValues);
        onChange?.(newValues.join(''));

        if (value && index < length - 1) {
            focusInput(index + 1);
        }

        const finalPin = newValues.join('');
        if (finalPin.length === length) {
            void handleAction(finalPin);
        }
    };

    const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace' && !values[index] && index > 0) {
            focusInput(index - 1);
        }
    };

    const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault();
        const pastedData = e.clipboardData.getData('text').slice(0, length);
        if (!/^\d+$/.test(pastedData)) return;

        const newValues = [...values];
        pastedData.split('').forEach((char, i) => {
            if (i < length) newValues[i] = char;
        });

        setValues(newValues);
        onChange?.(newValues.join(''));
        focusInput(Math.min(pastedData.length, length - 1));

        if (pastedData.length === length) {
            void handleAction(pastedData);
        }
    };

    const content = (
        <motion.div
            initial={variant === 'modal' ? { scale: 0.92, y: 24 } : { opacity: 0 }}
            animate={
                isShaking
                    ? { x: [0, -8, 8, -6, 6, 0] }
                    : variant === 'modal'
                        ? { scale: 1, y: 0 }
                        : { opacity: 1 }
            }
            transition={isShaking ? { duration: 0.45 } : { type: 'spring', stiffness: 220, damping: 24 }}
            className={
                variant === 'modal'
                    ? 'w-full max-w-lg bg-white rounded-[3.5rem] p-16 space-y-10 relative overflow-hidden border border-gray-200 shadow-3xl'
                    : 'w-full space-y-6'
            }
        >
            {variant === 'modal' && (
                <div className="text-center space-y-8">
                    <div className="text-center space-y-2 mb-8">
                        <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 text-blue-500">
                            <Lock className="w-8 h-8" />
                        </div>
                        <h2 className="text-2xl font-black text-gray-900 italic uppercase tracking-tight">
                            {isSetupMode ? 'Setup Security Vault' : 'Unlock Security Vault'}
                        </h2>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em] max-w-[220px] mx-auto leading-relaxed">
                            {isSetupMode
                                ? 'Set a new PIN to secure your local encryption vault on this device.'
                                : 'Input your session PIN to unlock or restore your end-to-end encryption vault.'}
                        </p>
                    </div>
                </div>
            )}

            <div className="space-y-5">
                <div className={`grid gap-3 ${length > 6 ? 'grid-cols-6' : 'grid-cols-6'}`}>
                    {values.map((value, index) => (
                        <input
                            key={index}
                            ref={(el) => {
                                inputRefs.current[index] = el;
                            }}
                            type="password"
                            inputMode="numeric"
                            maxLength={1}
                            value={value}
                            onChange={(e) => handleChange(index, e.target.value)}
                            onKeyDown={(e) => handleKeyDown(index, e)}
                            onPaste={index === 0 ? handlePaste : undefined}
                            className="w-full h-14 rounded-2xl border border-gray-200 bg-gray-50 text-center text-lg font-black tracking-[0.2em] text-gray-900 outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                            aria-label={`PIN digit ${index + 1}`}
                            autoComplete="one-time-code"
                        />
                    ))}
                </div>

                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-[10px] text-gray-400 font-medium">
                        Keys not found?{' '}
                        <button
                            type="button"
                            onClick={async () => {
                                if (
                                    window.confirm(
                                        'WARNING: Setting up as a new device will replace your current security keys. You will lose access to your previous encrypted messages. Continue?'
                                    )
                                ) {
                                    await KeyManager.resetAllKeys();
                                    setIsSetupMode(true);
                                    resetPin();
                                }
                            }}
                            className="text-blue-500 font-bold hover:underline"
                        >
                            Setup as New Device
                        </button>
                    </p>

                    {onForgotPin && (
                        <button
                            type="button"
                            onClick={onForgotPin}
                            className="text-primary-500 font-bold text-[11px] hover:underline uppercase tracking-widest"
                        >
                            Forgot PIN? Use Recovery Key
                        </button>
                    )}
                </div>

                <div className="flex items-center justify-between gap-3">
                    <button
                        type="button"
                        onClick={async () => {
                            if (
                                window.confirm(
                                    'FATAL: This will wipe your local security vault. All previous messages will be lost. Reset keys anyway?'
                                )
                            ) {
                                await KeyManager.resetAllKeys();
                                window.location.reload();
                            }
                        }}
                        className="text-[10px] text-red-500 hover:text-red-600 font-black uppercase tracking-widest transition-colors"
                    >
                        Re-initialize Security Vault
                    </button>

                    {variant === 'modal' && isSetupMode && (
                        <button
                            type="button"
                            onClick={() => setIsSetupMode(false)}
                            className="text-[10px] text-gray-500 hover:text-gray-700 font-bold uppercase tracking-widest transition-colors"
                        >
                            Cancel and try Unlock
                        </button>
                    )}
                </div>
            </div>
        </motion.div>
    );

    if (!isOpen && variant !== 'embedded') return null;

    if (variant === 'modal') {
        return (
            <AnimatePresence>
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-100 flex items-center justify-center p-6"
                >
                    {content}
                </motion.div>
            </AnimatePresence>
        );
    }

    return content;
};
