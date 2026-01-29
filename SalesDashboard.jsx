import React, { useState, useEffect } from 'react';
import { useDashboardData } from './src/hooks/useDashboardData';

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
const Avatar = ({ initials, color, size = 40 }) => (
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

// ============ ERROR DISPLAY ============
const ErrorDisplay = ({ message, onRetry }) => (
  <div className="flex flex-col items-center justify-center h-full text-center p-4">
    <span className="text-4xl mb-2">⚠️</span>
    <p className="text-gray-600 mb-4">{message}</p>
    <button
      onClick={onRetry}
      className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
    >
      Retry
    </button>
  </div>
);

// ============ TARGET RING WIDGET - ANIMATED LAPS WITH APPLE WATCH OVERLAP ============
const TargetRing = ({ current, goal, label }) => {
  const [animatedPercentage, setAnimatedPercentage] = useState(0);
  const percentage = (current / goal) * 100;
  const totalLaps = Math.floor(percentage / 100);
  const finalRemainder = percentage % 100;

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

  const mainColor = '#14B8A6';
  const darkerColor = '#0D9488';
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
    // Pre-render up to 10 lap layers (more than enough for most cases)
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

    // Shadow for end cap - subtle, fits within bar
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
              {multiplier}x GOAL 🔥
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
          <Avatar initials={deal.rep.initials} color={deal.rep.color} size={48} />
          <div className="text-center">
            <p className="font-medium text-gray-800 text-sm">{deal.company}</p>
            <p className="text-2xl font-bold" style={{ color: deal.rep.color }}>{formatCurrency(deal.value)}</p>
            <p className="text-sm text-gray-500">{deal.rep.name}</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <span className="text-2xl mr-2">📭</span>
          <p className="text-sm">No deals this week</p>
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

// ============ SALES LEADERBOARD - GREY LAST MONTH BAR ============
const SalesLeaderboard = ({ data, loading }) => {
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
        {sortedData.map((rep, index) => {
          const isTop = rep.repId === topPerformer.repId;
          const currentWidthPercent = (rep.currentMonth / maxValue) * 100;
          const lastMonthWidthPercent = (rep.lastMonth / maxValue) * 100;
          const beatLastMonth = rep.currentMonth >= rep.lastMonth;

          return (
            <div key={rep.repId} className="flex items-center gap-3">
              {/* Avatar with trophy for top */}
              <div className="relative flex-shrink-0">
                <Avatar initials={rep.initials} color={rep.color} size={42} />
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

                {/* Current month bar (purple) */}
                <div
                  className="absolute inset-y-0 left-0 rounded-xl transition-all duration-1000 ease-out flex items-center justify-end pr-4"
                  style={{
                    width: `${currentWidthPercent}%`,
                    background: 'linear-gradient(90deg, #8B5CF6, #A78BFA)',
                  }}
                >
                  <span className="text-white text-sm font-semibold">
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
          <div className="w-3 h-3 rounded" style={{ background: 'linear-gradient(90deg, #8B5CF6, #A78BFA)' }} />
          <span className="text-xs text-gray-500">{getCurrentMonth()}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: '#E5E7EB' }} />
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
                      <Avatar initials={article.rep.initials} color={article.rep.color} size={22} />
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
export default function SalesDashboard() {
  const { data, loading, error, refresh, lastUpdated } = useDashboardData();

  // Use real data if available, otherwise fall back to mock
  const dashboardData = data || MOCK_DATA;

  return (
    <div
      className="w-screen h-screen p-5 overflow-hidden"
      style={{ backgroundColor: '#F9FAFB' }}
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
          <TargetRing {...dashboardData.cwTarget} />
        </div>
        <div style={{ height: '300px' }}>
          <TargetRing {...dashboardData.aeTarget} />
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
    </div>
  );
}
