import React, { useState } from 'react';
import { GiphyFetch } from '@giphy/js-fetch-api';
import { Grid } from '@giphy/react-components';
import { motion } from 'framer-motion';
import { Search, X, Zap } from 'lucide-react';

// Use environment variable for the API Key
const giphyFetch = new GiphyFetch(import.meta.env.VITE_GIPHY_API_KEY || 'sXpBW9WOBT06NAsnzm6pYF76SId9FEtM'); // Default public beta key if none found

interface GiphyPickerProps {
    onSelect: (gif: any) => void;
    onClose: () => void;
}

export const GiphyPicker: React.FC<GiphyPickerProps> = ({ onSelect, onClose }) => {
    const [search, setSearch] = useState("");


    const fetchGifs = (offset: number) => 
        search.trim() 
            ? giphyFetch.search(search, { offset, limit: 15 }) 
            : giphyFetch.trending({ offset, limit: 15 });

    return (
        <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="absolute bottom-20 left-0 w-80 h-96 bg-slate-900/95 backdrop-blur-3xl border border-white/10 rounded-3xl shadow-3xl z-50 overflow-hidden flex flex-col"
        >
            <div className="p-4 border-b border-white/5 space-y-3">
                <div className="flex items-center justify-between mb-1">
                     <div className="flex items-center gap-2">
                        <Zap className="w-3 h-3 text-primary-400 fill-primary-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Giphy Intelligent Search</span>
                     </div>
                     <button onClick={onClose} className="hover:bg-white/5 p-1 rounded-lg"><X className="w-4 h-4" /></button>
                </div>
                <div className="relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input 
                        className="w-full bg-white/3 border border-white/10 rounded-xl py-2 pl-9 pr-4 text-xs text-white outline-none focus:border-primary-500/30 transition-all font-medium"
                        placeholder="Search for moments..." 
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 scrollbar-hide">
                <Grid 
                    onGifClick={(gif, e) => { e.preventDefault(); onSelect(gif); }}
                    fetchGifs={fetchGifs}
                    width={300}
                    columns={2}
                    gutter={8}
                    key={search} // Re-mount grid on search change
                />
            </div>

            <div className="p-2 border-t border-white/5 bg-black/20 flex justify-center">
                 <img src="https://giphy.com/static/img/at-giphy-logo-2.png" alt="Powered by Giphy" className="h-4 opacity-30 grayscale hover:grayscale-0 transition-all" />
            </div>
        </motion.div>
    );
};
