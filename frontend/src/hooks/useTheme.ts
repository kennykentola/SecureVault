import { useState, useEffect } from 'react';

const THEMES = [
  { id: 'light', name: 'Light', color: '#f8fafc' },
  { id: 'dark', name: 'Dark', color: '#0d1117' },
  { id: 'blue', name: 'Blue', color: '#3b82f6' },
  { id: 'purple', name: 'Purple', color: '#9333ea' },
  { id: 'lemon', name: 'Lemon', color: '#eab308' },
  { id: 'rose', name: 'Rose', color: '#e11d48' },
  { id: 'mint', name: 'Mint', color: '#10b981' },
  { id: 'orange', name: 'Orange', color: '#f97316' },
  { id: 'cyan', name: 'Cyan', color: '#06b6d4' },
  { id: 'teal', name: 'Teal', color: '#14b8a6' },
  { id: 'indigo', name: 'Indigo', color: '#6366f1' },
  { id: 'pink', name: 'Pink', color: '#ec4899' },
];

export const useTheme = () => {
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    const saved = localStorage.getItem('app-theme');
    if (saved) {
      setTheme(saved);
      document.documentElement.setAttribute('data-theme', saved);
    }
  }, []);

  const changeTheme = (newTheme: string) => {
    setTheme(newTheme);
    localStorage.setItem('app-theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  return { theme, changeTheme, THEMES };
};