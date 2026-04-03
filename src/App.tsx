/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trophy, 
  Zap, 
  Coins, 
  Play, 
  Settings, 
  Info, 
  ChevronUp, 
  ChevronDown,
  Sparkles,
  Star,
  Flame,
  RotateCcw
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { GoogleGenAI } from "@google/genai";
import { useSound } from './hooks/useSound';

// --- Utilities ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Constants ---
const ROWS = 5;
const COLS = 6;
const SYMBOL_SIZE = 80;
const BET_STEPS = [0.30, 0.60, 1.20, 2.40, 5.00, 10.00, 20.00, 50.00, 100.00];

const INITIAL_SYMBOLS = [
  { id: 'special_week', name: 'Special Week', image: 'https://image2url.com/r2/default/images/1775228759172-cbc495b9-66ca-4504-8bbb-516edeccf7b5.png', value: 50 },
  { id: 'silence_suzuka', name: 'Silence Suzuka', image: 'https://image2url.com/r2/default/images/1775228812296-24a81a9e-4c95-4a69-829c-00ecb7df7894.png', value: 25 },
  { id: 'tokai_teio', name: 'Tokai Teio', image: 'https://image2url.com/r2/default/images/1775228840873-351ab72e-cec0-4998-83ad-15020b570cc5.png', value: 15 },
  { id: 'mejiro_mcqueen', name: 'Mejiro McQueen', image: 'https://image2url.com/r2/default/images/1775228872375-a9b85708-5621-482c-8918-527224ee27de.png', value: 10 },
  { id: 'gold_ship', name: 'Gold Ship', image: 'https://image2url.com/r2/default/images/1775228902891-7d7aa637-07ab-4d49-bed9-cde315420c19.png', value: 5 },
  { id: 'vodka', name: 'Vodka', image: 'https://image2url.com/r2/default/images/1775228927818-b97d7eea-0cca-448f-8448-e4d6c732fd95.png', value: 2 },
  { id: 'daiwa_scarlet', name: 'Daiwa Scarlet', image: 'https://image2url.com/r2/default/images/1775228945973-76cc0e65-2fe9-424b-b60c-1385c591e6c9.png', value: 1.5 },
  { id: 'rice_shower', name: 'Rice Shower', image: 'https://picsum.photos/seed/rice_shower/200/200', value: 1 },
];

const SCATTER_IMAGE = 'https://image2url.com/r2/default/images/1775228759172-cbc495b9-66ca-4504-8bbb-516edeccf7b5.png';
const INITIAL_SCATTER_SYMBOL = { id: 'scatter', name: 'Derby Logo', image: SCATTER_IMAGE, value: 0 };
const INITIAL_SUPER_SCATTER_SYMBOL = { id: 'super_scatter', name: 'Super Derby Logo', image: SCATTER_IMAGE, value: 0 };
const INITIAL_MULTIPLIER_SYMBOL = { id: 'multiplier', name: 'Multiplier', image: 'https://picsum.photos/seed/multiplier/200/200', value: 0 };

const MULTIPLIERS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 50, 100, 500, 1000];

// --- Types ---
interface SymbolInstance {
  id: string;
  instanceId: string;
  type: string;
  multiplierValue?: number;
  isWinning?: boolean;
}

interface GameState {
  grid: SymbolInstance[][];
  balance: number;
  bet: number;
  isSpinning: boolean;
  totalWin: number;
  currentTumbleWin: number;
  multipliers: number[];
  freeSpinsRemaining: number;
  isFreeSpins: boolean;
  isSuperFreeSpins: boolean;
  history: number[];
  aiMessage: string;
  spinsSinceLastScatter: number;
}

// --- AI Service ---

export default function App() {
  const [state, setState] = useState<GameState>({
    grid: Array(COLS).fill(0).map(() => Array(ROWS).fill(null)),
    balance: 5000,
    bet: 1.20,
    isSpinning: false,
    totalWin: 0,
    currentTumbleWin: 0,
    multipliers: [],
    freeSpinsRemaining: 0,
    isFreeSpins: false,
    isSuperFreeSpins: false,
    history: [],
    aiMessage: "Welcome, Trainer! Ready for the big race?",
    spinsSinceLastScatter: 0,
  });

  const spinSound = useSound('https://actions.google.com/sounds/v1/foley/whoosh_swish_1.ogg');
  const winSound = useSound('https://actions.google.com/sounds/v1/foley/cash_register_open.ogg');
  const scatterSound = useSound('https://actions.google.com/sounds/v1/foley/magic_chime.ogg');
  const [isAutoSpin, setIsAutoSpin] = useState(false);
  const [showPaytable, setShowPaytable] = useState(false);
  const [confirmPurchase, setConfirmPurchase] = useState<'scatter' | 'super' | null>(null);
  const [symbols, setSymbols] = useState(INITIAL_SYMBOLS);
  const [scatterSymbol, setScatterSymbol] = useState(INITIAL_SCATTER_SYMBOL);
  const [superScatterSymbol, setSuperScatterSymbol] = useState(INITIAL_SUPER_SCATTER_SYMBOL);
  const [multiplierSymbol, setMultiplierSymbol] = useState(INITIAL_MULTIPLIER_SYMBOL);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchAnimeImages = async () => {
      const fetchImage = async (api: string) => {
        try {
          const res = await fetch(api);
          const data = await res.json();
          return data.url || (data.results && data.results[0].url) || (data.images && data.images[0].url) || 'https://picsum.photos/seed/anime/200/200';
        } catch (e) {
          console.error("Failed to fetch anime image", e);
          return 'https://picsum.photos/seed/anime/200/200';
        }
      };

      const [riceShower, scatter, superScatter, multiplier] = await Promise.all([
        fetchImage('https://api.waifu.pics/sfw/waifu'),
        fetchImage('https://nekos.best/api/v2/neko'),
        fetchImage('https://api.waifu.im/search'),
        fetchImage('https://api.waifu.pics/sfw/neko')
      ]);

      setSymbols(prev => prev.map(s => s.id === 'rice_shower' ? { ...s, image: riceShower } : s));
      setScatterSymbol(prev => ({ ...prev, image: scatter }));
      setSuperScatterSymbol(prev => ({ ...prev, image: superScatter }));
      setMultiplierSymbol(prev => ({ ...prev, image: multiplier }));
    };
    fetchAnimeImages();
  }, []);

  // --- Logic ---

  const generateRandomSymbol = useCallback((isSuper = false, spinsSinceLastScatter = 0): SymbolInstance => {
    const rand = Math.random();
    const instanceId = Math.random().toString(36).substring(7);

    // Multiplier chance
    const multiplierChance = isSuper ? 0.15 : 0.03;
    if (rand < multiplierChance) {
      const multRand = Math.random();
      let val = 2;

      if (multRand < 0.00001) val = 1000;      // 0.001% chance
      else if (multRand < 0.00005) val = 500;  // 0.004% chance
      else if (multRand < 0.0002) val = 100;   // 0.015% chance
      else if (multRand < 0.01) val = 50;     // 0.8% chance
      else if (multRand < 0.05) val = 20;     // 4% chance
      else if (multRand < 0.15) val = 15;     // 10% chance
      else if (multRand < 0.3) val = 10;      // 15% chance
      else {
        // Common multipliers (2x to 9x)
        const commonMults = [2, 3, 4, 5, 6, 7, 8, 9];
        val = commonMults[Math.floor(Math.random() * commonMults.length)];
      }

      return { id: 'multiplier', instanceId, type: 'multiplier', multiplierValue: val };
    }

    // Scatter chance (base 0.005, increases with spins)
    const scatterChance = 0.005 + (spinsSinceLastScatter * 0.001);
    if (rand < multiplierChance + scatterChance) {
      // Determine if it's a super scatter (10% chance)
      const isSuper = Math.random() < 0.1;
      return { id: isSuper ? 'super_scatter' : 'scatter', instanceId, type: isSuper ? 'super_scatter' : 'scatter' };
    }

    // Normal symbols
    const symbolIndex = Math.floor(Math.random() * symbols.length);
    return { id: symbols[symbolIndex].id, instanceId, type: 'normal' };
  }, [symbols]);

  const initializeGrid = useCallback(() => {
    setState(prev => {
      const newGrid = Array(COLS).fill(0).map(() => 
        Array(ROWS).fill(0).map(() => generateRandomSymbol(prev.isSuperFreeSpins, prev.spinsSinceLastScatter))
      );
      return { ...prev, grid: newGrid };
    });
  }, [generateRandomSymbol]);

  useEffect(() => {
    initializeGrid();
  }, [initializeGrid]);

  const updateAIMessage = async (winAmount: number, isFreeSpins: boolean) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.warn("Gemini API key is missing. Please set it in the Secrets panel.");
        return;
      }

      const ai = new GoogleGenAI({ apiKey });
      const prompt = `You are a trainer in the Uma Musume Pretty Derby universe. 
      The player just ${winAmount > 0 ? `won ${winAmount} credits` : "lost a spin"}. 
      ${isFreeSpins ? "They are currently in the Free Spins 'Climax' mode." : ""}
      Give a short, enthusiastic 1-sentence reaction or advice in character. 
      Mention a random character name from the series if appropriate.`;
      
      const response = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: prompt,
      });
      
      if (response.text) {
        setState(prev => ({ ...prev, aiMessage: response.text || prev.aiMessage }));
      }
    } catch (e) {
      console.error("AI Error", e);
    }
  };

  const checkWins = (grid: SymbolInstance[][]) => {
    const counts: Record<string, number> = {};
    const winningInstances: Set<string> = new Set();
    let scattersCount = 0;
    const currentMultipliers: number[] = [];

    grid.forEach(col => {
      col.forEach(sym => {
        if (!sym) return;
        if (sym.type === 'normal') {
          counts[sym.id] = (counts[sym.id] || 0) + 1;
        } else if (sym.type === 'scatter' || sym.type === 'super_scatter') {
          scattersCount++;
          winningInstances.add(sym.instanceId);
        } else if (sym.type === 'multiplier') {
          currentMultipliers.push(sym.multiplierValue || 0);
        }
      });
    });

    let win = 0;
    Object.entries(counts).forEach(([id, count]) => {
      if (count >= 8) {
        const symbol = symbols.find(s => s.id === id);
        if (symbol) {
          // Payout formula: base value * (count - 7) * bet
          // This is a simplified version of scatter pays
          const multiplier = count >= 12 ? 10 : count >= 10 ? 4 : 1;
          win += symbol.value * multiplier * (state.bet / 1.20);
          
          // Mark winning instances
          grid.forEach(col => {
            col.forEach(sym => {
              if (sym && sym.id === id) sym.isWinning = true;
            });
          });
        }
      }
    });

    return { win, scattersCount, currentMultipliers };
  };

  const tumble = async (initialGrid: SymbolInstance[][]) => {
    let currentGrid = [...initialGrid.map(col => [...col])];
    let totalTumbleWin = 0;
    let accumulatedMultipliers: number[] = [];
    let totalScatters = 0;

    while (true) {
      const { win, scattersCount, currentMultipliers } = checkWins(currentGrid);
      totalScatters += scattersCount;
      
      if (win === 0) break;

      totalTumbleWin += win;
      if (win > 0) {
        winSound();
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        });
      }
      accumulatedMultipliers = [...accumulatedMultipliers, ...currentMultipliers];

      // Mark winning symbols and update state to show them
      setState(prev => ({ 
        ...prev, 
        grid: currentGrid, 
        currentTumbleWin: totalTumbleWin,
        multipliers: accumulatedMultipliers
      }));

      // Wait for user to see the win
      await new Promise(r => setTimeout(r, 1000));

      // Remove winning symbols
      currentGrid = currentGrid.map(col => col.filter(sym => !sym?.isWinning));
      
      // Fill gaps
      currentGrid = currentGrid.map(col => {
        const missing = ROWS - col.length;
        const newSyms = Array(missing).fill(0).map(() => generateRandomSymbol(state.isSuperFreeSpins));
        return [...newSyms, ...col];
      });

      setState(prev => ({ 
        ...prev, 
        grid: currentGrid
      }));

      await new Promise(r => setTimeout(r, 600));
      
      // Reset winning flags for next check
      currentGrid.forEach(col => col.forEach(sym => { if(sym) sym.isWinning = false; }));
    }

    // Finalize tumble
    const finalMultiplier = accumulatedMultipliers.length > 0 
      ? accumulatedMultipliers.reduce((a, b) => a + b, 0) 
      : 1;
    
    const finalWin = totalTumbleWin * finalMultiplier;

    // Trigger Free Spins
    let freeSpinsTriggered = false;
    let superFreeSpinsTriggered = false;
    if (!state.isFreeSpins && !state.isSuperFreeSpins) {
      if (totalScatters >= 5) {
        superFreeSpinsTriggered = true;
      } else if (totalScatters >= 3) {
        freeSpinsTriggered = true;
      }
    }

    if (finalWin > 0 || freeSpinsTriggered || superFreeSpinsTriggered) {
      if (finalMultiplier > 1) {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        });
      }
      setState(prev => ({ 
        ...prev, 
        balance: prev.balance + finalWin,
        totalWin: finalWin,
        history: [finalWin, ...prev.history].slice(0, 10),
        isFreeSpins: freeSpinsTriggered ? true : prev.isFreeSpins,
        isSuperFreeSpins: superFreeSpinsTriggered ? true : prev.isSuperFreeSpins,
        freeSpinsRemaining: (freeSpinsTriggered || superFreeSpinsTriggered) ? 10 : prev.freeSpinsRemaining
      }));
      updateAIMessage(finalWin, state.isFreeSpins || freeSpinsTriggered || superFreeSpinsTriggered);
    }

    setState(prev => ({ ...prev, isSpinning: false, currentTumbleWin: 0, multipliers: [] }));
  };

  const handleSpin = useCallback(async () => {
    if (state.isSpinning || (state.balance < state.bet && !state.isFreeSpins)) {
      setIsAutoSpin(false);
      return;
    }

    spinSound();
    setState(prev => ({ 
      ...prev, 
      isSpinning: true, 
      balance: prev.isFreeSpins ? prev.balance : prev.balance - prev.bet,
      totalWin: 0,
      currentTumbleWin: 0,
      multipliers: []
    }));

    // Initial spin animation
    const newGrid = Array(COLS).fill(0).map(() => 
      Array(ROWS).fill(0).map(() => generateRandomSymbol(state.isSuperFreeSpins, state.spinsSinceLastScatter))
    );
    
    setState(prev => ({ ...prev, grid: newGrid }));
    await new Promise(r => setTimeout(r, 400));
    
    // Check for scatters to trigger free spins
    const { scattersCount } = checkWins(newGrid);
    if (scattersCount >= 3 && !state.isFreeSpins) {
      scatterSound();
      const isSuper = scattersCount >= 5;
      setState(prev => ({ 
        ...prev, 
        freeSpinsRemaining: 15, 
        isFreeSpins: true,
        isSuperFreeSpins: isSuper,
        spinsSinceLastScatter: 0,
        aiMessage: isSuper ? "SUPER CLIMAX MODE ACTIVATED! Ultimate win potential!" : "CLIMAX MODE ACTIVATED! Let's go for the win!"
      }));
    } else {
      setState(prev => ({ ...prev, spinsSinceLastScatter: prev.spinsSinceLastScatter + 1 }));
    }

    await tumble(newGrid);

    // Handle Free Spins decrement
    setState(prev => {
      if (prev.isFreeSpins) {
        const remaining = prev.freeSpinsRemaining - 1;
        if (remaining <= 0) {
          return { ...prev, freeSpinsRemaining: 0, isFreeSpins: false, isSuperFreeSpins: false };
        }
        return { ...prev, freeSpinsRemaining: remaining };
      }
      return prev;
    });
  }, [state.isSpinning, state.balance, state.bet, state.isFreeSpins, state.isSuperFreeSpins, state.spinsSinceLastScatter, generateRandomSymbol, tumble]);

  // Auto Spin Effect
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (isAutoSpin && !state.isSpinning) {
      timeout = setTimeout(() => {
        if (state.isFreeSpins && state.freeSpinsRemaining > 0) {
          handleSpin();
        } else if (!state.isFreeSpins && state.balance >= state.bet) {
          handleSpin();
        } else {
          setIsAutoSpin(false);
        }
      }, 1000);
    }
    return () => clearTimeout(timeout);
  }, [isAutoSpin, state.isSpinning, state.isFreeSpins, state.freeSpinsRemaining, state.balance, state.bet, handleSpin]);

  const buyFreeSpins = (isSuper = false) => {
    const cost = isSuper ? state.bet * 500 : state.bet * 100;
    if (state.balance < cost) return;

    setState(prev => ({
      ...prev,
      balance: prev.balance - cost,
      freeSpinsRemaining: 15,
      isFreeSpins: true,
      isSuperFreeSpins: isSuper,
      aiMessage: isSuper ? "SUPER CLIMAX! The ultimate race begins!" : "Training complete! Time for the Free Spins!"
    }));
  };

  const adjustBet = (dir: 'up' | 'down') => {
    const currentIndex = BET_STEPS.indexOf(state.bet);
    if (dir === 'up' && currentIndex < BET_STEPS.length - 1) {
      setState(prev => ({ ...prev, bet: BET_STEPS[currentIndex + 1] }));
    } else if (dir === 'down' && currentIndex > 0) {
      setState(prev => ({ ...prev, bet: BET_STEPS[currentIndex - 1] }));
    }
  };

  return (
    <div className="min-h-screen bg-[#1a1a2e] text-white font-sans selection:bg-pink-500/30 overflow-hidden">
      {/* Background Decor */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-pink-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20" />
      </div>

      <main className="relative z-10 max-w-7xl mx-auto px-2 sm:px-4 py-2 flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <header className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-pink-500 to-rose-600 rounded-2xl shadow-[0_4px_0_#881337] border-t border-white/30">
              <Trophy className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tighter uppercase italic leading-none text-white drop-shadow-md">
                Uma Musume <span className="text-pink-400 block">Derby Slots</span>
              </h1>
            </div>
          </div>

          <div className="bg-black/40 backdrop-blur-md border-2 border-purple-500/50 px-4 py-1 rounded-2xl shadow-inner flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-widest text-pink-300 font-bold">Balance</span>
            <span className="text-lg font-mono font-bold text-yellow-400 drop-shadow-sm">
              ${state.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
        </header>

        {/* Game Area */}
        <div className="flex-1 flex flex-row gap-2 min-h-0 overflow-hidden">
          {/* Slot Grid Section */}
          <div className="relative flex flex-col gap-2 flex-1 min-h-0">
            <div className="bg-white/5 backdrop-blur-sm border-2 border-purple-500/30 p-2 rounded-2xl flex items-center gap-3 shadow-inner">
              <div className="w-8 h-8 rounded-full bg-pink-500 flex-shrink-0 flex items-center justify-center text-lg shadow-lg">
                🏇
              </div>
              <p className="text-sm italic text-gray-200 line-clamp-1">
                "{state.aiMessage}"
              </p>
            </div>

            <div 
              ref={gridRef}
              className={cn(
                "flex-1 bg-black/60 backdrop-blur-xl border-4 border-purple-900/50 rounded-3xl p-2 grid grid-cols-6 gap-2 relative overflow-hidden transition-colors duration-500 [perspective:1000px] shadow-2xl",
                state.isFreeSpins ? "border-yellow-500 shadow-[0_0_30px_rgba(234,179,8,0.4)]" : ""
              )}
            >
              {state.isFreeSpins && (
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-t from-yellow-500/10 to-transparent" />
                  <motion.div 
                    animate={{ y: [0, -1000] }}
                    transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0 opacity-20 flex flex-col gap-20 items-center"
                  >
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-20 h-20 text-yellow-400 fill-yellow-400" />
                    ))}
                  </motion.div>
                </div>
              )}

              {state.grid.map((col, x) => (
                <div key={x} className="flex flex-col gap-1 sm:gap-2 [transform-style:preserve-3d]">
                  <AnimatePresence mode="popLayout">
                    {col.map((sym, y) => {
                      if (!sym) return null;
                      const symbolData = sym.type === 'normal' 
                        ? symbols.find(s => s.id === sym.id) 
                        : sym.type === 'scatter' ? scatterSymbol : multiplierSymbol;
                      
                      return (
                        <motion.div
                          key={sym.instanceId}
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ 
                            opacity: 1, 
                            scale: 1,
                          }}
                          exit={{ opacity: 0, scale: 0 }}
                          transition={{ 
                            type: "spring", 
                            stiffness: 500, 
                            damping: 30,
                            mass: 1
                          }}
                          className={cn(
                            "aspect-square rounded-lg sm:rounded-xl flex items-center justify-center text-xl sm:text-3xl relative group cursor-default",
                            sym.isWinning && "ring-2 sm:ring-4 ring-white ring-offset-1 sm:ring-offset-2 ring-offset-black z-10",
                            sym.type === 'multiplier' && "animate-bounce shadow-[0_0_10px_rgba(34,197,94,0.5)]"
                          )}
                        >
                          <div className="relative overflow-hidden rounded-lg sm:rounded-xl">
                            <img 
                              src={symbolData?.image} 
                              alt={symbolData?.name} 
                              className="w-12 h-12 sm:w-16 sm:h-16 object-cover rounded-lg" 
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = 'https://picsum.photos/seed/anime/200/200';
                              }}
                            />
                            <div className="absolute inset-0 bg-gradient-to-tr from-white/40 to-transparent pointer-events-none" />
                          </div>
                          {sym.type === 'multiplier' && (
                            <span className="absolute -bottom-0.5 -right-0.5 sm:-bottom-1 sm:-right-1 bg-black text-white text-[8px] sm:text-[10px] font-bold px-1 sm:px-1.5 py-0.2 sm:py-0.5 rounded-sm sm:rounded-md border border-white/20">
                              x{sym.multiplierValue}
                            </span>
                          )}
                          {sym.isWinning && (
                            <motion.div 
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="absolute inset-0 bg-white/40 rounded-lg sm:rounded-xl"
                            />
                          )}
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              ))}
            </div>

            {/* Win Display Overlay - Adjusted for mobile */}
            <AnimatePresence>
              {(state.totalWin > 0 || state.currentTumbleWin > 0) && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="absolute bottom-4 sm:bottom-8 left-1/2 -translate-x-1/2 bg-gradient-to-r from-pink-600 to-rose-600 px-6 sm:px-10 py-2 sm:py-4 rounded-full shadow-2xl border-2 border-white/30 flex flex-col items-center z-50 min-w-[200px]"
                >
                  <span className="text-[8px] sm:text-[10px] uppercase tracking-[0.3em] font-black text-white/70">Total Win</span>
                  <span className="text-2xl sm:text-4xl font-black italic tracking-tighter">
                    ${(state.totalWin || state.currentTumbleWin).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                  {state.multipliers.length > 0 && (
                    <div className="flex gap-1 sm:gap-2 mt-1 sm:mt-2 overflow-x-auto max-w-full">
                      {state.multipliers.map((m, i) => (
                        <span key={i} className="bg-green-500 text-white text-[8px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-full whitespace-nowrap">x{m}</span>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Sidebar Controls - Optimized for mobile stacking */}
          <aside className="flex flex-col gap-4 sm:gap-6 lg:w-[300px] pb-4 lg:pb-0">
            {/* Scatter Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button 
                onClick={() => setConfirmPurchase('scatter')}
                className="bg-gradient-to-br from-blue-500 to-blue-700 border-t border-l border-white/20 border-b-black/20 border-r-black/20 p-2 rounded-xl shadow-[0_4px_0_#1e3a8a] transition-all active:shadow-none active:translate-y-[4px]"
              >
                <span className="text-[10px] font-bold uppercase text-white drop-shadow-md">Scatter</span>
              </button>
              <button 
                onClick={() => setConfirmPurchase('super')}
                className="bg-gradient-to-br from-red-500 to-red-700 border-t border-l border-white/20 border-b-black/20 border-r-black/20 p-2 rounded-xl shadow-[0_4px_0_#991b1b] transition-all active:shadow-none active:translate-y-[4px]"
              >
                <span className="text-[10px] font-bold uppercase text-white drop-shadow-md">Super</span>
              </button>
            </div>

            {/* Free Spins Status */}
            {state.isFreeSpins && (
              <div className="bg-gradient-to-br from-yellow-400 to-orange-600 p-2 rounded-xl shadow-[0_4px_0_#92400e] border-t border-l border-white/30">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white">Free Spins</span>
                  <Flame className="w-3 h-3 text-white animate-pulse" />
                </div>
                <div className="text-2xl font-black text-center text-white italic drop-shadow-md">
                  {state.freeSpinsRemaining}
                </div>
              </div>
            )}

            {/* Bet Controls */}
            <div className="bg-black/40 backdrop-blur-md border-2 border-purple-500/50 p-2 rounded-xl shadow-inner flex flex-col items-center gap-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-pink-300">Bet</span>
              <div className="text-lg font-mono font-bold text-center bg-black/60 w-full py-1 rounded-lg border border-purple-500/30 text-yellow-400">
                ${state.bet.toFixed(2)}
              </div>
              <div className="flex w-full justify-between gap-1">
                <button 
                  onClick={() => adjustBet('down')}
                  className="flex-1 p-1 bg-gradient-to-br from-purple-600 to-purple-800 rounded-lg shadow-[0_2px_0_#4c1d95] active:shadow-none active:translate-y-[2px]"
                >
                  <ChevronDown className="w-4 h-4 text-white mx-auto" />
                </button>
                <button 
                  onClick={() => adjustBet('up')}
                  className="flex-1 p-1 bg-gradient-to-br from-purple-600 to-purple-800 rounded-lg shadow-[0_2px_0_#4c1d95] active:shadow-none active:translate-y-[2px]"
                >
                  <ChevronUp className="w-4 h-4 text-white mx-auto" />
                </button>
              </div>
            </div>

            {/* Buy Features */}
            <div className="grid grid-cols-2 gap-2">
              <button 
                onClick={() => buyFreeSpins(false)}
                disabled={state.isSpinning || state.isFreeSpins}
                className="bg-gradient-to-br from-pink-500 to-rose-700 border-t border-l border-white/20 border-b-black/20 border-r-black/20 p-2 rounded-xl shadow-[0_4px_0_#881337] transition-all disabled:opacity-50 active:shadow-none active:translate-y-[4px]"
              >
                <span className="block text-[8px] font-bold uppercase text-white">Buy Spins</span>
                <span className="text-[10px] font-mono text-yellow-200">${(state.bet * 100).toFixed(2)}</span>
              </button>

              <button 
                onClick={() => buyFreeSpins(true)}
                disabled={state.isSpinning || state.isFreeSpins}
                className="bg-gradient-to-br from-purple-600 to-indigo-800 border-t border-l border-white/20 border-b-black/20 border-r-black/20 p-2 rounded-xl shadow-[0_4px_0_#312e81] transition-all disabled:opacity-50 active:shadow-none active:translate-y-[4px]"
              >
                <span className="block text-[8px] font-bold uppercase text-white">Super Spins</span>
                <span className="text-[10px] font-mono text-yellow-200">${(state.bet * 500).toFixed(2)}</span>
              </button>
            </div>

            {/* Main Spin Button - Fixed at bottom on mobile */}
            <div className="fixed lg:relative bottom-0 left-0 right-0 lg:bottom-auto bg-[#1a1a2e]/90 lg:bg-transparent backdrop-blur-lg lg:backdrop-blur-none p-4 lg:p-0 border-t lg:border-t-0 border-white/10 lg:border-none z-[60] flex flex-col gap-3">
              <div className="flex gap-2">
                <button 
                  onClick={() => setIsAutoSpin(!isAutoSpin)}
                  className={cn(
                    "flex-1 py-2 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all border-t border-l border-white/20 border-b-black/20 border-r-black/20 shadow-[0_2px_0_#4c1d95] active:shadow-none active:translate-y-[2px]",
                    isAutoSpin ? "bg-gradient-to-br from-pink-500 to-rose-700 text-white" : "bg-gradient-to-br from-purple-600 to-purple-800 text-gray-200"
                  )}
                >
                  {isAutoSpin ? "Auto ON" : "Auto OFF"}
                </button>
                <button 
                  onClick={() => setShowPaytable(!showPaytable)}
                  className="p-2 bg-gradient-to-br from-purple-600 to-purple-800 border-t border-l border-white/20 border-b-black/20 border-r-black/20 rounded-xl shadow-[0_2px_0_#4c1d95] active:shadow-none active:translate-y-[2px]"
                >
                  <Info className="w-4 h-4 text-white" />
                </button>
              </div>

              <button 
                onClick={handleSpin}
                disabled={state.isSpinning || state.balance < state.bet}
                className={cn(
                  "relative w-full py-4 rounded-xl font-black text-xl uppercase italic tracking-tighter transition-all overflow-hidden group border-t border-l border-white/20 border-b-black/20 border-r-black/20 shadow-[0_6px_0_#881337] active:shadow-none active:translate-y-[6px]",
                  state.isSpinning || state.balance < state.bet 
                    ? "bg-gray-700 text-gray-500 cursor-not-allowed" 
                    : "bg-gradient-to-br from-pink-500 to-rose-700 text-white"
                )}
              >
                <div className="relative z-10 flex items-center justify-center gap-2">
                  {state.isSpinning ? (
                    <RotateCcw className="w-6 h-6 animate-spin" />
                  ) : (
                    <>
                      <Play className="w-6 h-6 fill-current" />
                      SPIN
                    </>
                  )}
                </div>
              </button>
            </div>
          </aside>
        </div>

        {/* History / Footer - Hidden on very small mobile */}
        <footer className="hidden sm:flex mt-auto pt-6 border-t border-white/5 justify-between items-center">
          <div className="flex gap-6 overflow-x-auto pb-2">
            {state.history.map((win, i) => (
              <div key={i} className="flex flex-col">
                <span className="text-[8px] uppercase text-gray-500 font-bold">Recent Win</span>
                <span className="text-xs font-mono text-pink-400">${win.toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 text-[10px] text-gray-500 font-bold uppercase tracking-widest">
            <span>RTP: 96.5%</span>
            <span>High Volatility</span>
          </div>
        </footer>
      </main>

      {/* Purchase Confirmation Modal */}
      <AnimatePresence>
        {confirmPurchase && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setConfirmPurchase(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-[#1a1a2e] border border-white/10 p-6 rounded-3xl max-w-sm w-full shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <h2 className="text-xl font-black italic uppercase tracking-tighter mb-4 text-white">Confirm Purchase</h2>
              <p className="text-sm text-gray-300 mb-6">
                Are you sure you want to buy {confirmPurchase === 'super' ? 'Super ' : ''}Free Spins for ${confirmPurchase === 'super' ? (state.bet * 500).toFixed(2) : (state.bet * 100).toFixed(2)}?
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setConfirmPurchase(null)}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-bold uppercase tracking-widest transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    buyFreeSpins(confirmPurchase === 'super');
                    setConfirmPurchase(null);
                  }}
                  className="flex-1 py-3 bg-pink-600 hover:bg-pink-700 rounded-xl font-bold uppercase tracking-widest transition-all"
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Win Overlay */}
      <AnimatePresence>
        {state.totalWin > 0 && (() => {
          const winMultiplier = state.totalWin / state.bet;
          let winType = '';
          let bgColor = 'from-yellow-500 to-orange-600';
          
          if (winMultiplier >= 50) {
            winType = 'SUPER WIN!';
            bgColor = 'from-purple-600 to-pink-600';
          } else if (winMultiplier >= 25) {
            winType = 'MEGA WIN!';
            bgColor = 'from-blue-500 to-indigo-600';
          } else if (winMultiplier >= 10) {
            winType = 'BIG WIN!';
            bgColor = 'from-yellow-500 to-orange-600';
          } else {
            return null;
          }

          return (
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
            >
              <div className={cn("bg-gradient-to-br p-8 rounded-3xl shadow-2xl border-4 border-white/20 text-center", bgColor)}>
                <h2 className="text-4xl font-black italic uppercase tracking-tighter text-white drop-shadow-md">{winType}</h2>
                <p className="text-2xl font-mono font-bold text-white">${state.totalWin.toFixed(2)}</p>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Paytable Modal */}
      <AnimatePresence>
        {showPaytable && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setShowPaytable(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-[#1a1a2e] border border-white/10 p-8 rounded-3xl max-w-2xl w-full shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <h2 className="text-3xl font-black italic uppercase tracking-tighter mb-6 text-pink-500">Paytable & Rules</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                {symbols.map(s => (
                  <div key={s.id} className="bg-white/5 p-3 rounded-xl flex flex-col items-center gap-2">
                    <img src={s.image} alt={s.name} className="w-12 h-12 object-cover rounded-lg" />
                    <span className="text-[10px] font-bold uppercase text-gray-400">{s.name}</span>
                    <span className="text-xs font-mono text-yellow-500">12+: x{s.value * 10}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-4 text-sm text-gray-300">
                <p>• <span className="text-white font-bold">Scatter Pays:</span> 8 or more symbols of the same type anywhere on the grid award a win.</p>
                <p>• <span className="text-white font-bold">Tumble Feature:</span> Winning symbols disappear and new ones fall from above, potentially creating more wins.</p>
                <p>• <span className="text-white font-bold">Multipliers:</span> Multiplier symbols (x2 to x1000) can land randomly. Their values are summed and applied to the total win of the tumble sequence.</p>
                <p>• <span className="text-white font-bold">Free Spins:</span> 4 or more Scatters trigger 15 Free Spins. During Free Spins, multipliers are more frequent.</p>
              </div>
              <button 
                onClick={() => setShowPaytable(false)}
                className="w-full mt-8 py-4 bg-white/5 hover:bg-white/10 rounded-xl font-bold uppercase tracking-widest transition-all"
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
