import { useState, useEffect, useRef } from 'react';
import { Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { KeyManager } from '../crypto/keyManager';

interface PinInputProps {
    length?: number;
    onComplete: (pin: string) => void;
    onSetup?: (pin: string) => void | Promise<void>;
    onChange?: (pin: string) => void;
    isOpen?: boolean;
    onSuccess?: () => void;
    variant?: 'modal' | 'embedded';
}

export const PinInput: React.FC<PinInputProps> = ({ length = 6, onComplete, onSetup, onChange, isOpen, onSuccess, variant = 'modal' }) => {
    const [values, setValues] = useState<string[]>(new Array(length).fill(""));
    const [isShaking, setIsShaking] = useState(false);
    const [isSetupMode, setIsSetupMode] = useState(false);
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    useEffect(() => {
        setValues(new Array(length).fill(""));
        setIsShaking(false);
        if (variant === 'modal') {
            setIsSetupMode(false);
        }
    }, [isOpen]);

    const handleAction = async (pin: string) => {
        try {
            if (isSetupMode && onSetup) {
                await onSetup(pin);
            } else {
                await onComplete(pin);
            }
            if (onSuccess) onSuccess();
        } catch (err) {
            setIsShaking(true);
            setTimeout(() => setIsShaking(false), 500);
            setValues(new Array(length).fill(""));
            inputRefs.current[0]?.focus();
        }
    };

    const handleChange = (index: number, value: string) => {
        if (!/^\d*$/.test(value)) return; // Only allow digits

        const newValues = [...values];
        // Only take the last character if multiple are entered (handled on paste separately)
        newValues[index] = value.slice(-1);
        setValues(newValues);
        
        if (onChange) onChange(newValues.join(""));

        // Move to next input if value is entered
        if (value && index < length - 1) {
            inputRefs.current[index + 1]?.focus();
        }

        // Check completion
        const finalPin = newValues.join("");
        if (finalPin.length === length) {
            handleAction(finalPin);
        }
    };

    const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace' && !values[index] && index > 0) {
            // Move to previous input on backspace if current is empty
            inputRefs.current[index - 1]?.focus();
        }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        const pastedData = e.clipboardData.getData('text').slice(0, length);
        if (!/^\d+$/.test(pastedData)) return;

        const newValues = [...values];
        pastedData.split("").forEach((char, i) => {
            if (i < length) newValues[i] = char;
        });
        setValues(newValues);
        
        if (onChange) onChange(newValues.join(""));
        
        // Focus the last or next empty
        const nextIndex = Math.min(pastedData.length, length - 1);
        inputRefs.current[nextIndex]?.focus();

        if (pastedData.length === length) {
            handleAction(pastedData);
        }
    };

    if (isOpen || variant === 'embedded') {
        const content = (
            <motion.div 
                initial={variant === 'modal' ? { scale: 0.9, y: 30 } : { opacity: 0 }} 
                animate={variant === 'modal' ? { scale: 1, y: 0 } : { opacity: 1 }} 
                className={variant === 'modal' 
                    ? "w-full max-w-lg bg-white rounded-[3.5rem] p-16 space-y-12 relative overflow-hidden border border-gray-200 shadow-3xl"
                    : "w-full space-y-6"
                }
            >
                {variant === 'modal' && (
                    <div className="text-center space-y-8">
                        <div className="text-center space-y-2 mb-8">
                            <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 text-blue-500">
                                <Lock className="w-8 h-8" />
                            </div>
                            <h2 className="text-2xl font-black text-gray-900 italic uppercase tracking-tight">
                                {isSetupMode ? "Setup Security Vault" : "Unlock Security Vault"}
                            </h2>
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em] max-w-[200px] mx-auto leading-relaxed">
                                {isSetupMode 
                                    ? "Set a new 6-digit PIN to secure your local encryption vault on this device."
                                    : "Input your session PIN to unlock or restore your end-to-end encryption vault"}
                            </p>
                        </div>
                    </div>
                )}
                <motion.div 
                    animate={isShaking ? { x: [-10, 10, -10, 10, 0] } : {}}
                    className="flex gap-2 sm:gap-4 justify-center" 
                    onPaste={handlePaste}
                >
                    {values.map((val, i) => (
                        <input
                            key={i}
                            ref={el => { inputRefs.current[i] = el; }}
                            type="password"
                            inputMode="numeric"
                            autoFocus={i === 0}
                            maxLength={1}
                            value={val}
                            onChange={(e) => handleChange(i, e.target.value)}
                            onKeyDown={(e) => handleKeyDown(i, e)}
                            className="w-10 h-14 sm:w-12 sm:h-16 text-center text-2xl font-bold bg-gray-100 border border-gray-300 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-gray-900"
                        />
                    ))}
                </motion.div>

                {variant === 'modal' && (
                    <div className="text-center pt-8 border-t border-gray-100 space-y-4">
                        {!isSetupMode ? (
                            <>
                                <p className="text-[10px] text-gray-400 font-medium">
                                    Keys not found? <button 
                                        onClick={async () => {
                                            if (window.confirm("WARNING: Setting up as a new device will replace your current security keys. You will lose access to your previous encrypted messages. Continue?")) {
                                                await KeyManager.resetAllKeys();
                                                setIsSetupMode(true);
                                                setValues(new Array(length).fill(""));
                                            }
                                        }} 
                                        className="text-blue-500 font-bold hover:underline"
                                    >
                                        Setup as New Device
                                    </button>
                                </p>
                                <button 
                                    onClick={async () => {
                                        if (window.confirm("FATAL: This will wipe your local security vault. All previous messages will be lost. Reset keys anyway?")) {
                                            await KeyManager.resetAllKeys();
                                            window.location.reload();
                                        }
                                    }}
                                    className="text-[10px] text-red-500 hover:text-red-600 font-black uppercase tracking-widest transition-colors"
                                >
                                    Re-initialize Security Vault
                                </button>
                            </>
                        ) : (
                            <button onClick={() => setIsSetupMode(false)} className="text-[10px] text-gray-500 hover:text-gray-700 font-bold uppercase tracking-widest transition-colors">
                                Cancel and try Unlock
                            </button>
                        )}
                    </div>
                )}
            </motion.div>
        );

        if (variant === 'modal') {
            return (
                <AnimatePresence>
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 backdrop-blur-sm z-100 flex items-center justify-center p-6">
                        {content}
                    </motion.div>
                </AnimatePresence>
            );
        }

        return content;
    }

    return null;
};
