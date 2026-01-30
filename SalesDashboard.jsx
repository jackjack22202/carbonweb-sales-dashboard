import React, { useState, useEffect, createContext, useContext } from 'react';
import mondaySdk from 'monday-sdk-js';
import { useDashboardData } from './src/hooks/useDashboardData';

// Initialize Monday SDK
const monday = mondaySdk();

// ============ SETTINGS CONTEXT ============
const defaultSettings = {
  topDealsMinThreshold: 5000,
  cwGoal: 100000,
  aeGoal: 100000,
  primaryColor: '#8B5CF6',
  accentColor: '#14B8A6',
  backgroundColor: '#F9FAFB',
  excludedReps: [] // Array of rep names to exclude from leaderboard
};

const SETTINGS_API_URL = import.meta.env.PROD
  ? '/api/settings'
  : (import.meta.env.VITE_SETTINGS_API_URL || '/api/settings');

const SettingsContext = createContext({
  settings: defaultSettings,
  updateSettings: () => {},
  settingsLoading: true
});

const useSettings = () => useContext(SettingsContext);

// Get Monday session token from SDK or URL
const getMondayToken = async () => {
  // Try to get token from Monday SDK (works when embedded as Monday app)
  try {
    const token = await monday.get('sessionToken');
    if (token?.data) {
      sessionStorage.setItem('mondayToken', token.data);
      return token.data;
    }
  } catch (e) {
    console.log('Not in Monday context, checking URL params...');
  }

  // Check URL params as fallback
  const urlParams = new URLSearchParams(window.location.search);
  const urlToken = urlParams.get('token') || urlParams.get('sessionToken');
  if (urlToken) {
    sessionStorage.setItem('mondayToken', urlToken);
    return urlToken;
  }

  // Check cached token from previous session
  const cached = sessionStorage.getItem('mondayToken');
  if (cached) return cached;

  return null;
};

// Load settings - tries Monday Storage first (if token available), falls back to localStorage
const loadSettingsFromAPI = async (token) => {
  // Try Monday Storage API if we have a token
  if (token) {
    try {
      const response = await fetch(SETTINGS_API_URL, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        // Cache to localStorage for faster future loads
        localStorage.setItem('dashboardSettings', JSON.stringify(data));
        console.log('Settings loaded from Monday Storage');
        return { ...defaultSettings, ...data };
      }
    } catch (e) {
      console.warn('Failed to load from Monday Storage:', e);
    }
  }

  // Fallback to localStorage
  try {
    const saved = localStorage.getItem('dashboardSettings');
    if (saved) {
      console.log('Settings loaded from localStorage');
      return { ...defaultSettings, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error('Failed to load settings from localStorage:', e);
  }

  return defaultSettings;
};

// Save settings - saves to localStorage immediately, syncs to Monday Storage if token available
const saveSettingsToAPI = async (settings, token) => {
  // Always save to localStorage for immediate persistence
  try {
    localStorage.setItem('dashboardSettings', JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save to localStorage:', e);
  }

  // Sync to Monday Storage if we have a token
  if (token) {
    try {
      const response = await fetch(SETTINGS_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(settings)
      });
      if (response.ok) {
        console.log('Settings synced to Monday Storage');
      } else {
        console.warn('Failed to sync settings to Monday Storage');
      }
    } catch (e) {
      console.warn('Failed to sync to Monday Storage:', e);
    }
  }
};

// ============ SETTINGS PROVIDER ============
const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(() => {
    // Initial load from localStorage for instant render
    try {
      const saved = localStorage.getItem('dashboardSettings');
      if (saved) return { ...defaultSettings, ...JSON.parse(saved) };
    } catch {}
    return defaultSettings;
  });
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [mondayToken, setMondayToken] = useState(null);

  // On mount: get Monday token and load settings
  useEffect(() => {
    const initSettings = async () => {
      const token = await getMondayToken();
      if (token) {
        setMondayToken(token);
      }

      const loaded = await loadSettingsFromAPI(token);
      setSettings(loaded);
      setSettingsLoading(false);
    };

    initSettings();
  }, []);

  const updateSettings = (newSettings) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    saveSettingsToAPI(updated, mondayToken);
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, settingsLoading }}>
      {children}
    </SettingsContext.Provider>
  );
};

// ============ FALLBACK MOCK DATA (used when API is unavailable) ============
const MOCK_DATA = {
  salesReps: [
    { repId: '1', name: 'Loading...', initials: '...', color: '#8B5CF6', currentMonth: 0, lastMonth: 0 },
  ],
  topDeals: { thisWeek: null, lastWeek: null },
  cwTarget: { current: 0, goal: 100000, label: 'CW Sourced Target' },
  aeTarget: { current: 0, goal: 100000, label: 'AE Sourced Target' },
  news: []
};

// ============ HELPER FUNCTIONS ============
const formatCurrency = (value) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

// Format currency rounded to nearest thousand (e.g., $117K)
const formatCurrencyShort = (value) => {
  const thousands = Math.round(value / 1000);
  return `$${thousands}K`;
};

const getCurrentMonth = () => {
  return new Date().toLocaleDateString('en-US', { month: 'long' });
};

// Lighter grey colors used across widgets
const LIGHT_GREY = '#E8EAED';  // Lighter background grey
const TRACK_GREY = '#EBEDEF';  // Ring track grey
const DIVIDER_GREY = '#D1D5DB'; // Grey for pill dividers

// ============ RANK BADGE COMPONENT (Mario Kart Style) ============
const RankBadge = ({ rank, position = 'left' }) => {
  // Mario Kart style - bold colored numbers with black outline
  // 1 is gold/yellow, 2 is blue, 3 is green
  const badges = {
    1: { color: '#FFD700' },  // Gold for 1st
    2: { color: '#1E88E5' },  // Blue for 2nd
    3: { color: '#43A047' },  // Green for 3rd
  };

  const badge = badges[rank];
  if (!badge) return null;

  const positionClass = position === 'left' ? '-left-3' : '-right-1';

  return (
    <div
      className={`absolute -top-1 ${positionClass} flex items-center justify-center`}
      style={{
        fontSize: '22px',
        fontWeight: 900,
        fontStyle: 'italic',
        color: badge.color,
        textShadow: '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, -2px 0 0 #000, 2px 0 0 #000, 0 -2px 0 #000, 0 2px 0 #000',
        fontFamily: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
        lineHeight: 1,
      }}
    >
      {rank}
    </div>
  );
};

// ============ AVATAR COMPONENT ============
const Avatar = ({ initials, color, size = 40, photoUrl = null }) => {
  const [imgError, setImgError] = useState(false);

  // Show photo if URL exists and hasn't errored
  if (photoUrl && !imgError) {
    return (
      <img
        src={photoUrl}
        alt={initials}
        className="rounded-full flex-shrink-0 object-cover"
        style={{
          width: size,
          height: size,
        }}
        onError={() => setImgError(true)}
      />
    );
  }

  // Fallback to initials
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        fontSize: size * 0.38
      }}
    >
      {initials}
    </div>
  );
};

// ============ CARD WRAPPER ============
const Card = ({ children, className = '' }) => (
  <div
    className={`bg-white rounded-2xl ${className}`}
    style={{
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      border: '1px solid #F3F4F6'
    }}
  >
    {children}
  </div>
);

// ============ LOADING SKELETON ============
const LoadingSkeleton = () => (
  <div className="animate-pulse">
    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
    <div className="h-8 bg-gray-200 rounded w-1/2"></div>
  </div>
);

// ============ SETTINGS PANEL ============
const SettingsPanel = ({ isOpen, onClose, availableReps = [] }) => {
  const { settings, updateSettings } = useSettings();
  const [localSettings, setLocalSettings] = useState(settings);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings, isOpen]);

  const handleSave = () => {
    updateSettings(localSettings);
    onClose();
  };

  const handleReset = () => {
    setLocalSettings(defaultSettings);
  };

  const toggleRepExclusion = (repName) => {
    const excluded = localSettings.excludedReps || [];
    if (excluded.includes(repName)) {
      setLocalSettings({
        ...localSettings,
        excludedReps: excluded.filter(n => n !== repName)
      });
    } else {
      setLocalSettings({
        ...localSettings,
        excludedReps: [...excluded, repName]
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-xl font-semibold text-gray-800">Dashboard Settings</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh] space-y-6">
          {/* Top Deals Settings */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Top Deals</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Minimum Deal Threshold</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                  <input
                    type="number"
                    value={localSettings.topDealsMinThreshold}
                    onChange={(e) => setLocalSettings({ ...localSettings, topDealsMinThreshold: parseInt(e.target.value) || 0 })}
                    className="w-full pl-8 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">Only deals with scopes above this amount will appear</p>
              </div>
            </div>
          </div>

          {/* Monthly Goals */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Monthly Goals</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">CW Sourced Goal</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                  <input
                    type="number"
                    value={localSettings.cwGoal}
                    onChange={(e) => setLocalSettings({ ...localSettings, cwGoal: parseInt(e.target.value) || 0 })}
                    className="w-full pl-8 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">AE Sourced Goal</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                  <input
                    type="number"
                    value={localSettings.aeGoal}
                    onChange={(e) => setLocalSettings({ ...localSettings, aeGoal: parseInt(e.target.value) || 0 })}
                    className="w-full pl-8 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Sales Reps Filter */}
          {availableReps.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Leaderboard Reps</h3>
              <p className="text-xs text-gray-400 mb-3">Uncheck reps to hide them from the leaderboard</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {availableReps.map((rep) => {
                  const isExcluded = (localSettings.excludedReps || []).includes(rep.name);
                  return (
                    <label
                      key={rep.repId}
                      className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                        isExcluded ? 'bg-gray-50 opacity-60' : 'hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={!isExcluded}
                        onChange={() => toggleRepExclusion(rep.name)}
                        className="w-4 h-4 rounded border-gray-300 text-purple-500 focus:ring-purple-500"
                      />
                      <Avatar initials={rep.initials} color={rep.color} size={32} photoUrl={rep.photoUrl} />
                      <span className={`text-sm ${isExcluded ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                        {rep.name}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Colors */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Colors</h3>
            <p className="text-xs text-gray-400 mb-3">These colors are used in the leaderboard bars and target ring widgets</p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">CW Sourced</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={localSettings.primaryColor}
                    onChange={(e) => setLocalSettings({ ...localSettings, primaryColor: e.target.value })}
                    className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer"
                  />
                  <span className="text-xs text-gray-400">{localSettings.primaryColor}</span>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">AE Sourced</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={localSettings.accentColor}
                    onChange={(e) => setLocalSettings({ ...localSettings, accentColor: e.target.value })}
                    className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer"
                  />
                  <span className="text-xs text-gray-400">{localSettings.accentColor}</span>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Background</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={localSettings.backgroundColor}
                    onChange={(e) => setLocalSettings({ ...localSettings, backgroundColor: e.target.value })}
                    className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer"
                  />
                  <span className="text-xs text-gray-400">{localSettings.backgroundColor}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-100 bg-gray-50">
          <button
            onClick={handleReset}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
            Reset to Defaults
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm text-white bg-purple-500 hover:bg-purple-600 rounded-lg transition-colors"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ FULLSCREEN HOOK ============
const useFullscreen = () => {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        // Enter fullscreen
        const elem = document.documentElement;
        if (elem.requestFullscreen) {
          await elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) {
          // Safari
          await elem.webkitRequestFullscreen();
        }
      } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          // Safari
          await document.webkitExitFullscreen();
        }
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  };

  return { isFullscreen, toggleFullscreen };
};

// ============ HIDDEN CONTROL BUTTONS (Settings + Fullscreen) ============
const ControlButtons = ({ onSettingsClick, isFullscreen, onFullscreenToggle }) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div
      className="fixed bottom-4 right-4 z-40"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      style={{ width: '120px', height: '80px' }}
    >
      {/* Invisible hover area that's always active */}
      <div className="absolute inset-0" />
      {/* Buttons positioned in center-right of hover area */}
      <div className={`absolute bottom-2 right-2 flex gap-2 transition-all duration-300 ${
        isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
      }`}>
        {/* Fullscreen button */}
        <button
          onClick={onFullscreenToggle}
          className="p-3 rounded-full bg-white shadow-lg hover:bg-gray-50 transition-colors"
          style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
          title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
        >
          {isFullscreen ? (
            // Exit fullscreen icon (compress)
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
            </svg>
          ) : (
            // Enter fullscreen icon (expand)
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
          )}
        </button>
        {/* Settings button */}
        <button
          onClick={onSettingsClick}
          className="p-3 rounded-full bg-white shadow-lg hover:bg-gray-50 transition-colors"
          style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
          title="Settings"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>
    </div>
  );
};

// ============ TARGET RING WIDGET - SMOOTH ANIMATED RING ============
const TargetRing = ({ current, goal, label, color }) => {
  const { settings } = useSettings();
  const [animatedPercentage, setAnimatedPercentage] = useState(0);
  const percentage = (current / goal) * 100;

  // Unique ID for this widget's SVG gradient
  const filterId = React.useMemo(() => `ring-${Math.random().toString(36).substr(2, 9)}`, []);

  useEffect(() => {
    // Smooth easing animation
    const duration = 2000;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 3);

      setAnimatedPercentage(eased * percentage);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [percentage]);

  // Larger ring dimensions
  const size = 240;
  const strokeWidth = 24;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const displayLaps = Math.floor(animatedPercentage / 100);
  const displayRemainder = animatedPercentage % 100;

  // Use passed color prop, or fall back to accentColor
  const mainColor = color || settings.accentColor;
  const exceededGoal = animatedPercentage >= 100;
  const multiplier = Math.floor(animatedPercentage / 100);

  const animatedValue = (current * (animatedPercentage / percentage)) || 0;

  // Calculate stroke offset for current progress
  const currentOffset = circumference - (displayRemainder / 100) * circumference;
  const cx = size / 2;
  const cy = size / 2;

  return (
    <Card className="p-6 h-full flex flex-col overflow-hidden relative">
      <h2 className="text-2xl font-bold text-gray-800">{label}</h2>

      {/* Main content - absolutely positioned to center vertically */}
      <div className="absolute inset-x-0 flex items-center px-6" style={{ top: '50px', bottom: '50px' }}>
        <div className="flex items-center gap-6 w-full justify-between">
          {/* Left side - Stats (bigger text) */}
          <div className="flex-shrink-0">
            <div className="mb-2">
              <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">REVENUE</p>
              <p className="text-5xl font-bold" style={{ color: mainColor }}>
                {formatCurrency(animatedValue)}
              </p>
            </div>

            <div>
              <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">GOAL</p>
              <p className="text-3xl font-bold text-gray-700">
                {formatCurrency(goal)}
              </p>
            </div>
          </div>

          {/* Right side - Ring */}
          <div className="flex-shrink-0">
            <div className="relative" style={{ width: size, height: size }}>
              <svg width={size} height={size}>
              {/* Gradient definition */}
              <defs>
                <linearGradient id={`ringGradient-${filterId}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={mainColor} />
                  <stop offset="100%" stopColor={mainColor} />
                </linearGradient>
              </defs>

              {/* Background ring (track) */}
              <circle
                cx={cx}
                cy={cy}
                r={radius}
                fill="none"
                stroke={TRACK_GREY}
                strokeWidth={strokeWidth}
              />

              {/* Completed lap layers (for >100%) */}
              {Array.from({ length: Math.min(displayLaps, 5) }).map((_, i) => (
                <circle
                  key={`lap-${i}`}
                  cx={cx}
                  cy={cy}
                  r={radius}
                  fill="none"
                  stroke={mainColor}
                  strokeWidth={strokeWidth}
                  opacity={0.3 + (i * 0.1)}
                  style={{
                    transform: 'rotate(-90deg)',
                    transformOrigin: 'center',
                  }}
                />
              ))}

              {/* Current progress arc */}
              <circle
                cx={cx}
                cy={cy}
                r={radius}
                fill="none"
                stroke={`url(#ringGradient-${filterId})`}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={currentOffset}
                style={{
                  transform: 'rotate(-90deg)',
                  transformOrigin: 'center',
                }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-5xl font-bold" style={{ color: mainColor }}>
                {Math.round(animatedPercentage)}%
              </span>
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* Badge - absolutely positioned at bottom left, doesn't affect layout */}
      {exceededGoal && (
        <div className="absolute bottom-5 left-6">
          <span
            className="inline-block px-4 py-1.5 rounded-full text-sm font-bold"
            style={{ backgroundColor: '#D1FAE5', color: '#059669' }}
          >
            {multiplier}x GOAL
          </span>
        </div>
      )}
    </Card>
  );
};

// ============ TOP SCOPES SOLD COMPONENT ============
const TopScopesSold = ({ thisWeek, lastWeek }) => {
  const ScopeCard = ({ title, deal, isThisWeek }) => (
    <div className="flex-1 flex flex-col">
      <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2">{title}</p>
      {deal ? (
        <div className="flex-1 flex items-center justify-center gap-5">
          {/* AE Avatar x SE Avatar */}
          <div className="flex items-center gap-1">
            <Avatar initials={deal.rep.initials} color={deal.rep.color} size={48} photoUrl={deal.rep.photoUrl} />
            <span className="text-gray-400 text-lg font-light mx-1">×</span>
            <Avatar
              initials={deal.se?.initials || 'SE'}
              color={deal.se?.color || '#6B7280'}
              size={48}
              photoUrl={deal.se?.photoUrl || null}
            />
          </div>
          {/* Grey pill divider */}
          <div className="w-1 h-14 rounded-full" style={{ backgroundColor: DIVIDER_GREY }} />
          {/* Deal Data */}
          <div className="text-center">
            <p className="font-semibold text-gray-800">{deal.company}</p>
            <p className="text-2xl font-bold" style={{ color: isThisWeek ? '#16A34A' : '#1F2937' }}>
              {formatCurrency(deal.value)}
            </p>
            <p className="text-xs text-gray-500">{deal.rep.name} + {deal.se?.name || 'SE'}</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <span className="text-2xl mr-2">📭</span>
          <p className="text-sm">No qualifying scopes</p>
        </div>
      )}
    </div>
  );

  return (
    <Card className="p-5 h-full flex flex-col">
      <h2 className="text-2xl font-bold text-gray-800 mb-3">Top Scopes Sold</h2>
      <div className="flex-1 flex flex-col">
        <ScopeCard title="THIS WEEK" deal={thisWeek} isThisWeek={true} />
        <div className="border-t border-gray-100 my-2" />
        <ScopeCard title="LAST WEEK" deal={lastWeek} isThisWeek={false} />
      </div>
    </Card>
  );
};

// ============ SALES LEADERBOARD - STACKED BAR CHART (CW + AE) ============
const SalesLeaderboard = ({ data, loading, availableHeight }) => {
  const { settings } = useSettings();
  const [tooltip, setTooltip] = useState({ show: false, content: '', x: 0, y: 0 });
  const [timePeriod, setTimePeriod] = useState('thisMonth'); // 'thisMonth', 'lastMonth', 'quarter'

  // Filter out excluded reps
  const filteredData = data ? data.filter(rep => !settings.excludedReps?.includes(rep.name)) : [];

  const handleMouseEnter = (e, content) => {
    setTooltip({ show: true, content, x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e) => {
    if (tooltip.show) {
      setTooltip(prev => ({ ...prev, x: e.clientX, y: e.clientY }));
    }
  };

  const handleMouseLeave = () => {
    setTooltip({ show: false, content: '', x: 0, y: 0 });
  };

  if (loading || !data || filteredData.length === 0) {
    return (
      <Card className="p-5 h-full flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-800">Sales Leaderboard</h2>
        </div>
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <LoadingSkeleton />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <p>No sales data available</p>
          </div>
        )}
      </Card>
    );
  }

  // Get the value to sort/display based on time period
  const getDisplayValue = (rep) => {
    switch (timePeriod) {
      case 'lastMonth':
        return rep.lastMonth;
      case 'quarter':
        // Quarter = current month + last month (approximation)
        return rep.currentMonth + rep.lastMonth;
      default:
        return rep.currentMonth;
    }
  };

  const sortedData = [...filteredData].sort((a, b) => getDisplayValue(b) - getDisplayValue(a));
  const maxValue = Math.max(...sortedData.map(d => Math.max(getDisplayValue(d), d.lastMonth)));
  const topPerformer = sortedData[0];

  // Colors for stacked bars
  const cwColor = settings.primaryColor; // Purple for CW Sourced
  const aeColor = settings.accentColor;  // Teal for AE Sourced

  // Dynamic scaling based on number of reps
  const repCount = sortedData.length;
  const headerHeight = 52;
  const legendHeight = 48;
  const containerPadding = 40;
  const availableForBars = (availableHeight || 400) - headerHeight - legendHeight - containerPadding;

  // Calculate ideal bar height - max 60px, min 32px
  const idealBarHeight = Math.min(60, Math.max(32, availableForBars / repCount - 8));
  const avatarSize = Math.min(48, Math.max(32, idealBarHeight - 4));
  const barHeight = idealBarHeight - 6;
  const gap = Math.min(12, Math.max(4, (availableForBars - (idealBarHeight * repCount)) / (repCount - 1 || 1)));

  return (
    <Card className="p-5 h-full flex flex-col">
      {/* Global tooltip */}
      {tooltip.show && (
        <div
          className="fixed z-50 px-3 py-2 text-sm bg-gray-900 text-white rounded-lg shadow-lg pointer-events-none whitespace-nowrap"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y - 10,
            transform: 'translateY(-100%)'
          }}
        >
          {tooltip.content}
        </div>
      )}

      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-gray-800">Sales Leaderboard</h2>
        <select
          value={timePeriod}
          onChange={(e) => setTimePeriod(e.target.value)}
          className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600 cursor-pointer"
        >
          <option value="thisMonth">This Month</option>
          <option value="lastMonth">Last Month</option>
          <option value="quarter">This Quarter</option>
        </select>
      </div>

      <div className="flex-1 flex flex-col justify-evenly" style={{ gap: `${gap}px` }}>
        {sortedData.map((rep) => {
          const isTop = rep.repId === topPerformer.repId;
          const displayValue = getDisplayValue(rep);
          const displayWidthPercent = (displayValue / maxValue) * 100;

          // For "This Month" view, show stacked CW/AE bars with last month comparison
          // For other views, show single color bar
          const showStacked = timePeriod === 'thisMonth';
          const lastMonthWidthPercent = timePeriod === 'thisMonth' ? (rep.lastMonth / maxValue) * 100 : 0;

          // Calculate stacked bar widths (only for this month view)
          const cwWidthPercent = showStacked ? ((rep.currentMonthCW || 0) / maxValue) * 100 : 0;
          const aeWidthPercent = showStacked ? ((rep.currentMonthAE || 0) / maxValue) * 100 : 0;
          const totalCurrentPercent = showStacked ? cwWidthPercent + aeWidthPercent : displayWidthPercent;

          return (
            <div key={rep.repId} className="flex items-center gap-3">
              {/* Avatar with rank badge on left for top 3 */}
              <div className="relative flex-shrink-0 ml-4">
                <RankBadge rank={sortedData.indexOf(rep) + 1} position="left" />
                <Avatar initials={rep.initials} color={rep.color} size={avatarSize} photoUrl={rep.photoUrl} />
              </div>

              {/* Bar container */}
              <div
                className="flex-1 relative rounded-xl overflow-visible"
                style={{ height: `${barHeight}px` }}
              >
                {/* Last month bar (lighter grey) - only show for "This Month" view */}
                {showStacked && (
                  <div
                    className="absolute inset-y-0 left-0 rounded-xl cursor-pointer"
                    style={{
                      width: `${lastMonthWidthPercent}%`,
                      backgroundColor: LIGHT_GREY,
                      height: `${barHeight}px`,
                    }}
                    onMouseEnter={(e) => handleMouseEnter(e, `Last Month: ${formatCurrency(rep.lastMonth)}`)}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                  />
                )}

                {/* Stacked/Single bar */}
                <div
                  className="absolute inset-y-0 left-0 flex rounded-xl overflow-hidden transition-all duration-1000 ease-out"
                  style={{ width: `${totalCurrentPercent}%`, height: `${barHeight}px` }}
                >
                  {showStacked ? (
                    <>
                      {/* CW Sourced portion (purple) */}
                      {cwWidthPercent > 0 && (
                        <div
                          className="h-full cursor-pointer"
                          style={{
                            width: `${(cwWidthPercent / totalCurrentPercent) * 100}%`,
                            backgroundColor: cwColor,
                          }}
                          onMouseEnter={(e) => handleMouseEnter(e, `CW Sourced: ${formatCurrency(rep.currentMonthCW || 0)}`)}
                          onMouseMove={handleMouseMove}
                          onMouseLeave={handleMouseLeave}
                        />
                      )}
                      {/* AE Sourced portion (teal) */}
                      {aeWidthPercent > 0 && (
                        <div
                          className="h-full cursor-pointer"
                          style={{
                            width: `${(aeWidthPercent / totalCurrentPercent) * 100}%`,
                            backgroundColor: aeColor,
                          }}
                          onMouseEnter={(e) => handleMouseEnter(e, `AE Sourced: ${formatCurrency(rep.currentMonthAE || 0)}`)}
                          onMouseMove={handleMouseMove}
                          onMouseLeave={handleMouseLeave}
                        />
                      )}
                    </>
                  ) : (
                    /* Single bar for Last Month / Quarter view */
                    <div
                      className="h-full w-full cursor-pointer"
                      style={{ backgroundColor: cwColor }}
                      onMouseEnter={(e) => handleMouseEnter(e, `${timePeriod === 'lastMonth' ? 'Last Month' : 'This Quarter'}: ${formatCurrency(displayValue)}`)}
                      onMouseMove={handleMouseMove}
                      onMouseLeave={handleMouseLeave}
                    />
                  )}
                </div>

                {/* Value label - black text OUTSIDE the bar */}
                <div
                  className="absolute inset-y-0 flex items-center pointer-events-none"
                  style={{ left: `${totalCurrentPercent}%`, paddingLeft: '8px' }}
                >
                  <span className="text-gray-900 text-sm font-semibold whitespace-nowrap">
                    {formatCurrencyShort(displayValue)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-4 justify-center pt-3 border-t border-gray-100 mt-3">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: cwColor }} />
          <span className="text-xs text-gray-500">CW Sourced</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: aeColor }} />
          <span className="text-xs text-gray-500">AE Sourced</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: LIGHT_GREY }} />
          <span className="text-xs text-gray-500">Last Month</span>
        </div>
      </div>
    </Card>
  );
};

// ============ SALES NEWS ============
const SalesNews = ({ articles, loading, onRefresh }) => {
  const getAccentColor = (type) => {
    switch (type) {
      case 'win': return '#14B8A6';
      case 'alert': return '#F59E0B';
      case 'update': return '#3B82F6';
      case 'stats': return '#8B5CF6';
      default: return '#6B7280';
    }
  };

  const getBgColor = (type) => {
    switch (type) {
      case 'win': return '#F0FDF9';
      case 'alert': return '#FFFBEB';
      case 'update': return '#EFF6FF';
      case 'stats': return '#F5F3FF';
      default: return '#F9FAFB';
    }
  };

  return (
    <Card className="p-5 h-full flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-gray-800">Sales News</h2>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
        >
          <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {loading && articles.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <LoadingSkeleton />
        </div>
      ) : articles.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <p>No recent news</p>
        </div>
      ) : (
        <div
          className="flex-1 overflow-y-auto space-y-3 pr-1"
          style={{ scrollbarWidth: 'thin', scrollbarColor: '#E5E7EB transparent' }}
        >
          {articles.map((article) => (
            <div
              key={article.id}
              className="p-4 rounded-xl"
              style={{
                backgroundColor: getBgColor(article.type),
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                borderLeft: `4px solid ${getAccentColor(article.type)}`
              }}
            >
              <div className="flex items-start gap-3">
                <span className="text-xl flex-shrink-0">{article.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="font-semibold text-gray-800 text-sm">{article.headline}</h3>
                    {article.rep && (
                      <Avatar initials={article.rep.initials} color={article.rep.color} size={22} photoUrl={article.rep.photoUrl} />
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mb-2 leading-relaxed">{article.body}</p>
                  <p className="text-xs text-gray-400">{article.timestamp}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

// ============ MAIN DASHBOARD COMPONENT ============
function DashboardContent() {
  const { settings } = useSettings();
  const { data, loading, error, refresh, lastUpdated } = useDashboardData({
    minThreshold: settings.topDealsMinThreshold
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [leaderboardHeight, setLeaderboardHeight] = useState(400);
  const { isFullscreen, toggleFullscreen } = useFullscreen();

  // Measure available height for leaderboard
  useEffect(() => {
    const updateHeight = () => {
      // Calculate: viewport height - top row (300px) - padding (40px) - gap (16px) - bottom margin for last updated (24px)
      const available = window.innerHeight - 300 - 40 - 16 - 24;
      setLeaderboardHeight(Math.max(300, available));
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  // Use real data if available, otherwise fall back to mock
  const dashboardData = data || MOCK_DATA;

  // Apply settings overrides for goals
  const cwTarget = {
    ...dashboardData.cwTarget,
    goal: settings.cwGoal
  };
  const aeTarget = {
    ...dashboardData.aeTarget,
    goal: settings.aeGoal
  };

  return (
    <div
      className="w-screen h-screen p-5 pb-8 overflow-hidden relative"
      style={{ backgroundColor: settings.backgroundColor }}
    >
      {/* Error banner */}
      {error && !loading && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center justify-between">
          <span>Failed to load live data: {error}</span>
          <button
            onClick={refresh}
            className="ml-4 px-3 py-1 bg-red-100 hover:bg-red-200 rounded text-red-800 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Grid Layout: wider top widgets, fixed height top row */}
      <div
        className="h-full grid gap-4"
        style={{
          gridTemplateColumns: '1.2fr 1.2fr 1fr',
          gridTemplateRows: '300px 1fr'
        }}
      >
        {/* Row 1: Two matching target rings + Top Deals - fixed height */}
        <div style={{ height: '300px' }}>
          <TargetRing {...cwTarget} color={settings.primaryColor} />
        </div>
        <div style={{ height: '300px' }}>
          <TargetRing {...aeTarget} color={settings.accentColor} />
        </div>
        <div style={{ height: '300px' }}>
          <TopScopesSold
            thisWeek={dashboardData.topDeals.thisWeek}
            lastWeek={dashboardData.topDeals.lastWeek}
          />
        </div>

        {/* Row 2: Leaderboard (2 cols) + News */}
        <div style={{ gridColumn: 'span 2' }}>
          <SalesLeaderboard
            data={dashboardData.salesReps}
            loading={loading && !data}
            availableHeight={leaderboardHeight}
          />
        </div>

        <SalesNews articles={dashboardData.news} loading={loading} onRefresh={refresh} />
      </div>

      {/* Last updated indicator - bottom center */}
      {lastUpdated && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-gray-400">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </div>
      )}

      {/* Control Buttons (Fullscreen + Settings) & Panel */}
      <ControlButtons
        onSettingsClick={() => setSettingsOpen(true)}
        isFullscreen={isFullscreen}
        onFullscreenToggle={toggleFullscreen}
      />
      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        availableReps={dashboardData.salesReps}
      />
    </div>
  );
}

export default function SalesDashboard() {
  return (
    <SettingsProvider>
      <DashboardContent />
    </SettingsProvider>
  );
}
