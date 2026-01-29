import React, { useState, useEffect, createContext, useContext } from 'react';
import { useDashboardData } from './src/hooks/useDashboardData';

// ============ SETTINGS CONTEXT ============
const defaultSettings = {
  topDealsMinThreshold: 5000,
  cwGoal: 100000,
  aeGoal: 100000,
  primaryColor: '#8B5CF6',
  accentColor: '#14B8A6',
  backgroundColor: '#F9FAFB'
};

const SettingsContext = createContext({
  settings: defaultSettings,
  updateSettings: () => {}
});

const useSettings = () => useContext(SettingsContext);

// Load settings from localStorage
const loadSettings = () => {
  try {
    const saved = localStorage.getItem('dashboardSettings');
    if (saved) {
      return { ...defaultSettings, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
  return defaultSettings;
};

// Save settings to localStorage
const saveSettings = (settings) => {
  try {
    localStorage.setItem('dashboardSettings', JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
};

// ============ SETTINGS PROVIDER ============
const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(loadSettings);

  const updateSettings = (newSettings) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    saveSettings(updated);
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
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

const getCurrentMonth = () => {
  return new Date().toLocaleDateString('en-US', { month: 'long' });
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
const SettingsPanel = ({ isOpen, onClose }) => {
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

          {/* Colors */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Colors</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Primary</label>
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
                <label className="block text-sm text-gray-600 mb-1">Accent</label>
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

// ============ HIDDEN SETTINGS BUTTON ============
const SettingsButton = ({ onClick }) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div
      className="fixed bottom-4 right-4 z-40"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      style={{ width: '80px', height: '80px' }}
    >
      {/* Invisible hover area that's always active */}
      <div className="absolute inset-0" />
      {/* Button positioned in center-right of hover area */}
      <button
        onClick={onClick}
        className={`absolute bottom-2 right-2 p-3 rounded-full bg-white shadow-lg transition-all duration-300 ${
          isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
        } hover:bg-gray-50`}
        style={{
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
        }}
      >
        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
    </div>
  );
};

// ============ TARGET RING WIDGET - ANIMATED LAPS WITH APPLE WATCH OVERLAP ============
const TargetRing = ({ current, goal, label }) => {
  const { settings } = useSettings();
  const [animatedPercentage, setAnimatedPercentage] = useState(0);
  const percentage = (current / goal) * 100;

  // Unique ID for this widget's SVG filters
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

  const size = 180;
  const strokeWidth = 18;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const displayLaps = Math.floor(animatedPercentage / 100);
  const displayRemainder = animatedPercentage % 100;

  const mainColor = settings.accentColor;
  const darkerColor = settings.accentColor;
  const exceededGoal = animatedPercentage >= 100;
  const multiplier = Math.floor(animatedPercentage / 100);

  const animatedValue = (current * (animatedPercentage / percentage)) || 0;

  const renderRings = () => {
    const rings = [];
    const cx = size / 2;
    const cy = size / 2;

    // SVG Filters for depth effects (unique IDs per widget)
    rings.push(
      <defs key="defs">
        <filter id={`dropShadow-${filterId}`} x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="rgba(0,0,0,0.15)" />
        </filter>
        <linearGradient id={`ringGradient-${filterId}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={mainColor} />
          <stop offset="100%" stopColor={darkerColor} />
        </linearGradient>
      </defs>
    );

    // Background ring (track)
    rings.push(
      <circle
        key="bg"
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="#E5E7EB"
        strokeWidth={strokeWidth}
      />
    );

    // Draw underlying completed lap layers - fixed number to prevent shake
    const maxLapLayers = 10;
    for (let i = 0; i < maxLapLayers; i++) {
      const layerOpacity = i < displayLaps ? Math.min(0.4 + (i * 0.1), 0.8) : 0;
      rings.push(
        <circle
          key={`lap-layer-${i}`}
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={mainColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          opacity={layerOpacity}
          style={{
            transform: 'rotate(-90deg)',
            transformOrigin: 'center',
          }}
        />
      );
    }

    // Current progress arc (the "top" layer that creates overlap)
    const currentOffset = circumference - (displayRemainder / 100) * circumference;

    // Main current progress arc
    rings.push(
      <circle
        key="current-progress"
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
    );

    // End cap dot - follows the progress
    const endAngle = (displayRemainder / 100) * 360;
    const endX = cx + radius * Math.cos((endAngle - 90) * Math.PI / 180);
    const endY = cy + radius * Math.sin((endAngle - 90) * Math.PI / 180);

    // Shadow for end cap
    rings.push(
      <circle
        key="end-cap-shadow"
        cx={endX}
        cy={endY}
        r={strokeWidth / 2 - 1}
        fill="rgba(0,0,0,0.15)"
        style={{ transform: 'translate(1px, 1px)' }}
      />
    );

    // End cap - fits within stroke
    rings.push(
      <circle
        key="end-cap"
        cx={endX}
        cy={endY}
        r={strokeWidth / 2 - 2}
        fill={mainColor}
      />
    );

    // Inner highlight on end cap
    rings.push(
      <circle
        key="end-cap-highlight"
        cx={endX - 1}
        cy={endY - 1}
        r={strokeWidth / 6}
        fill="rgba(255,255,255,0.4)"
      />
    );

    return rings;
  };

  return (
    <Card className="p-6 h-full flex flex-col overflow-hidden">
      <h2 className="text-lg font-semibold text-gray-800 mb-3">{label}</h2>

      <div className="flex-1 flex items-center gap-5">
        {/* Left side - Stats */}
        <div className="flex-shrink-0 min-w-0">
          <div className="mb-3">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">REVENUE</p>
            <p className="text-2xl font-bold" style={{ color: mainColor }}>
              {formatCurrency(animatedValue)}
            </p>
          </div>

          <div className="mb-3">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">GOAL</p>
            <p className="text-lg font-semibold text-gray-700">
              {formatCurrency(goal)}
            </p>
          </div>

          {exceededGoal && (
            <span
              className="inline-block px-3 py-1 rounded-full text-xs font-semibold"
              style={{ backgroundColor: '#D1FAE5', color: '#059669' }}
            >
              {multiplier}x GOAL
            </span>
          )}
        </div>

        {/* Right side - Ring */}
        <div className="flex-1 flex justify-center items-center">
          <div className="relative" style={{ width: size, height: size }}>
            <svg width={size} height={size}>
              {renderRings()}
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl font-bold" style={{ color: mainColor }}>
                {Math.round(animatedPercentage)}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

// ============ TOP DEALS COMPONENT ============
const TopDeals = ({ thisWeek, lastWeek }) => {
  const DealCard = ({ title, deal }) => (
    <div className="flex-1 flex flex-col">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">{title}</p>
      {deal ? (
        <div className="flex-1 flex items-center justify-center gap-3">
          <Avatar initials={deal.rep.initials} color={deal.rep.color} size={48} photoUrl={deal.rep.photoUrl} />
          <div className="text-center">
            <p className="font-medium text-gray-800 text-sm">{deal.company}</p>
            <p className="text-2xl font-bold" style={{ color: deal.rep.color }}>{formatCurrency(deal.value)}</p>
            <p className="text-sm text-gray-500">{deal.rep.name}</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <span className="text-2xl mr-2">📭</span>
          <p className="text-sm">No qualifying deals</p>
        </div>
      )}
    </div>
  );

  return (
    <Card className="p-5 h-full flex flex-col">
      <h2 className="text-lg font-semibold text-gray-800 mb-2">Top Deals</h2>
      <div className="flex-1 flex flex-col">
        <DealCard title="THIS WEEK" deal={thisWeek} />
        <div className="border-t border-gray-100 my-2" />
        <DealCard title="LAST WEEK" deal={lastWeek} />
      </div>
    </Card>
  );
};

// ============ SALES LEADERBOARD - STACKED BAR CHART (CW + AE) ============
const SalesLeaderboard = ({ data, loading }) => {
  const { settings } = useSettings();

  if (loading || !data || data.length === 0) {
    return (
      <Card className="p-5 h-full flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Sales Leaderboard</h2>
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

  const sortedData = [...data].sort((a, b) => b.currentMonth - a.currentMonth);
  const maxValue = Math.max(...sortedData.map(d => Math.max(d.currentMonth, d.lastMonth)));
  const topPerformer = sortedData[0];

  // Colors for stacked bars
  const cwColor = settings.primaryColor; // Purple for CW Sourced
  const aeColor = settings.accentColor;  // Teal for AE Sourced

  return (
    <Card className="p-5 h-full flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Sales Leaderboard</h2>
        <select className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
          <option>This Month</option>
          <option>Last Month</option>
          <option>This Quarter</option>
        </select>
      </div>

      <div className="flex-1 flex flex-col justify-start gap-3 overflow-y-auto">
        {sortedData.map((rep) => {
          const isTop = rep.repId === topPerformer.repId;
          const lastMonthWidthPercent = (rep.lastMonth / maxValue) * 100;

          // Calculate stacked bar widths
          const cwWidthPercent = ((rep.currentMonthCW || 0) / maxValue) * 100;
          const aeWidthPercent = ((rep.currentMonthAE || 0) / maxValue) * 100;
          const totalCurrentPercent = cwWidthPercent + aeWidthPercent;

          return (
            <div key={rep.repId} className="flex items-center gap-3">
              {/* Avatar with trophy for top */}
              <div className="relative flex-shrink-0">
                <Avatar initials={rep.initials} color={rep.color} size={42} photoUrl={rep.photoUrl} />
                {isTop && (
                  <span className="absolute -top-2 -right-1 text-sm">🏆</span>
                )}
              </div>

              {/* Bar container */}
              <div className="flex-1 h-11 relative rounded-xl overflow-hidden bg-gray-50">
                {/* Last month bar (grey) - always show as reference */}
                <div
                  className="absolute inset-y-0 left-0 rounded-xl"
                  style={{
                    width: `${lastMonthWidthPercent}%`,
                    backgroundColor: '#D1D5DB',
                  }}
                />

                {/* Stacked current month bars */}
                <div
                  className="absolute inset-y-0 left-0 flex rounded-xl overflow-hidden transition-all duration-1000 ease-out"
                  style={{ width: `${totalCurrentPercent}%` }}
                >
                  {/* CW Sourced portion (purple) */}
                  {cwWidthPercent > 0 && (
                    <div
                      style={{
                        width: `${(cwWidthPercent / totalCurrentPercent) * 100}%`,
                        backgroundColor: cwColor,
                      }}
                    />
                  )}
                  {/* AE Sourced portion (teal) */}
                  {aeWidthPercent > 0 && (
                    <div
                      style={{
                        width: `${(aeWidthPercent / totalCurrentPercent) * 100}%`,
                        backgroundColor: aeColor,
                      }}
                    />
                  )}
                </div>

                {/* Value label overlay */}
                <div
                  className="absolute inset-y-0 left-0 flex items-center justify-end pr-4 pointer-events-none"
                  style={{ width: `${totalCurrentPercent}%` }}
                >
                  <span className="text-white text-sm font-semibold drop-shadow-sm">
                    {formatCurrency(rep.currentMonth)}
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
          <div className="w-3 h-3 rounded" style={{ backgroundColor: '#D1D5DB' }} />
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
        <h2 className="text-lg font-semibold text-gray-800">Sales News</h2>
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
      className="w-screen h-screen p-5 overflow-hidden"
      style={{ backgroundColor: settings.backgroundColor }}
    >
      {/* Last updated indicator */}
      {lastUpdated && (
        <div className="absolute top-2 right-4 text-xs text-gray-400">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </div>
      )}

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
          <TargetRing {...cwTarget} />
        </div>
        <div style={{ height: '300px' }}>
          <TargetRing {...aeTarget} />
        </div>
        <div style={{ height: '300px' }}>
          <TopDeals
            thisWeek={dashboardData.topDeals.thisWeek}
            lastWeek={dashboardData.topDeals.lastWeek}
          />
        </div>

        {/* Row 2: Leaderboard (2 cols) + News */}
        <div style={{ gridColumn: 'span 2' }}>
          <SalesLeaderboard data={dashboardData.salesReps} loading={loading && !data} />
        </div>

        <SalesNews articles={dashboardData.news} loading={loading} onRefresh={refresh} />
      </div>

      {/* Settings Button & Panel */}
      <SettingsButton onClick={() => setSettingsOpen(true)} />
      <SettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
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
