import React, { useState, useEffect, useMemo } from 'react';

// ユーティリティ関数
const parsePercentage = (val) => {
  if (!val) return 0;
  const str = String(val).replace('%', '').trim();
  return parseFloat(str) || 0;
};

const parseNumber = (val) => {
  if (!val) return 0;
  const str = String(val).replace(/,/g, '').trim();
  return parseInt(str) || 0;
};

const extractCountryPercent = (val) => {
  if (!val) return { country: '', percent: 0 };
  const match = String(val).match(/(.+?)=(\d+\.?\d*)%/);
  if (match) return { country: match[1], percent: parseFloat(match[2]) };
  return { country: '', percent: 0 };
};

// BAS計算
const calculateBAS = (influencer, targetProfile) => {
  const infFemale = parsePercentage(influencer['フォロワーの女性割合']);
  const genderSim = 1 - Math.abs(targetProfile.femaleRatio - infFemale) / 100;
  const targetAgeKey = `フォロワーの${targetProfile.ageRange}の${targetProfile.targetGender === 'female' ? '女性' : '男性'}の割合`;
  const infAgeRatio = parsePercentage(influencer[targetAgeKey] || 0);
  const ageSim = Math.min(infAgeRatio / 50, 1);
  const countryData = extractCountryPercent(influencer['フォロワーの所在地１位']);
  const countrySim = countryData.country === targetProfile.country ? countryData.percent / 100 : 0;
  const interests = [influencer['興味１位'], influencer['興味２位'], influencer['興味３位'], influencer['興味４位'], influencer['興味５位']].filter(Boolean).join(' ').toLowerCase();
  const matchCount = targetProfile.interests.filter(i => interests.includes(i.toLowerCase())).length;
  const interestSim = Math.min(matchCount / 3, 1);
  return 0.30 * genderSim + 0.25 * ageSim + 0.20 * countrySim + 0.25 * interestSim;
};

// Ri計算
const calculateRi = (influencer) => {
  const eg = parsePercentage(influencer['EG率（｛いいね ＋ コメント｝ ÷ フォロワー数）']);
  const activeRate = parsePercentage(influencer['アクティブ率']);
  return Math.min((eg / 100 * 2.5 + activeRate / 100 * 0.4), 1);
};

// OPS計算
const calculateOPS = (inf1, inf2) => {
  const f1 = parsePercentage(inf1['フォロワーの女性割合']);
  const f2 = parsePercentage(inf2['フォロワーの女性割合']);
  const genderSim = 1 - Math.abs(f1 - f2) / 100;
  const a1 = parsePercentage(inf1['フォロワーの25-34歳の女性の割合']);
  const a2 = parsePercentage(inf2['フォロワーの25-34歳の女性の割合']);
  const ageSim = 1 - Math.abs(a1 - a2) / 100;
  const c1 = extractCountryPercent(inf1['フォロワーの所在地１位']);
  const c2 = extractCountryPercent(inf2['フォロワーの所在地１位']);
  const countrySim = c1.country === c2.country ? Math.min(c1.percent, c2.percent) / 100 : 0;
  const i1 = [inf1['興味１位'], inf1['興味２位'], inf1['興味３位']].join(' ');
  const i2 = [inf2['興味１位'], inf2['興味２位'], inf2['興味３位']].join(' ');
  const commonInterests = ['Restaurant', 'Clothes', 'Beauty', 'Coffee', 'Toys'];
  const interestSim = commonInterests.filter(i => i1.includes(i) && i2.includes(i)).length / 5;
  return 0.25 * genderSim + 0.25 * ageSim + 0.25 * countrySim + 0.25 * interestSim;
};

// 文脈推定
const inferContext = (influencer) => {
  const profile = (influencer['プロフィール'] || '').toLowerCase();
  const interests = [influencer['興味１位'], influencer['興味２位'], influencer['興味３位']].join(' ').toLowerCase();
  const contexts = [];
  if (interests.includes('beauty') || profile.includes('beauty') || profile.includes('makeup')) contexts.push('美容');
  if (interests.includes('restaurant') || interests.includes('food') || profile.includes('グルメ')) contexts.push('グルメ');
  if (interests.includes('clothes') || interests.includes('fashion') || profile.includes('fashion')) contexts.push('ファッション');
  if (interests.includes('travel') || profile.includes('travel') || profile.includes('旅行')) contexts.push('旅行');
  if (interests.includes('toys') || interests.includes('baby') || profile.includes('disney')) contexts.push('ライフスタイル');
  if (interests.includes('coffee') || profile.includes('cafe') || profile.includes('カフェ')) contexts.push('カフェ');
  if (profile.includes('yoga') || profile.includes('fitness') || profile.includes('pilates')) contexts.push('健康');
  if (profile.includes('model') || profile.includes('モデル')) contexts.push('モデル');
  if (profile.includes('ol') || profile.includes('会社員')) contexts.push('OL');
  if (profile.includes('director') || profile.includes('founder')) contexts.push('クリエイター');
  return contexts.length > 0 ? contexts : ['一般'];
};

// チームメトリクス計算
const calculateTeamMetrics = (team) => {
  if (team.length === 0) return null;
  const avgBas = team.reduce((sum, inf) => sum + inf.bas, 0) / team.length;
  const minRi = Math.min(...team.map(inf => inf.ri));
  const avgRi = team.reduce((sum, inf) => sum + inf.ri, 0) / team.length;
  const totalReach = team.reduce((sum, inf) => sum + inf.followers * inf.ri, 0);
  let opsSum = 0, opsCount = 0, minOps = 1;
  for (let i = 0; i < team.length; i++) {
    for (let j = i + 1; j < team.length; j++) {
      const ops = calculateOPS(team[i], team[j]);
      opsSum += ops; opsCount++; minOps = Math.min(minOps, ops);
    }
  }
  const avgOps = opsCount > 0 ? opsSum / opsCount : 0;
  const eor5 = Math.floor(minRi * minOps * totalReach);
  const uniqueContexts = new Set();
  team.forEach(inf => inf.contexts.forEach(ctx => uniqueContexts.add(ctx)));
  const contextScore = uniqueContexts.size / 5;
  const totalScore = avgBas * 0.25 + avgRi * 0.20 + avgOps * 0.25 + contextScore * 0.30;
  return { avgBas, minRi, avgRi, avgOps, minOps, eor5, contextCount: uniqueContexts.size, contexts: Array.from(uniqueContexts), totalReach, totalScore };
};

// 5パターン生成
const generate5Patterns = (candidates, targetProfile) => {
  const scored = candidates.map(inf => ({
    ...inf, bas: calculateBAS(inf, targetProfile), ri: calculateRi(inf), contexts: inferContext(inf), followers: parseNumber(inf['フォロワー数'])
  }));
  const patterns = [];
  const usedCombinations = new Set();

  // パターン1: BAS最適化
  const p1 = [...scored].sort((a, b) => b.bas - a.bas).slice(0, 5);
  patterns.push({ name: 'BAS最適化', desc: 'ブランド適合度を最大化', icon: '🎯', team: p1, metrics: calculateTeamMetrics(p1) });
  usedCombinations.add(p1.map(i => i['アカウント名']).sort().join(','));

  // パターン2: 文脈分散
  const p2 = []; const usedIds2 = new Set();
  const ctxPriority = ['美容', 'ファッション', 'グルメ', 'ライフスタイル', '旅行', 'カフェ', '健康', 'モデル', 'クリエイター', 'OL'];
  for (const ctx of ctxPriority) {
    if (p2.length >= 5) break;
    const c = scored.filter(inf => !usedIds2.has(inf['アカウント名']) && inf.contexts.includes(ctx)).sort((a, b) => b.bas - a.bas)[0];
    if (c) { p2.push(c); usedIds2.add(c['アカウント名']); }
  }
  for (const inf of scored.sort((a, b) => b.bas - a.bas)) { if (p2.length >= 5) break; if (!usedIds2.has(inf['アカウント名'])) { p2.push(inf); usedIds2.add(inf['アカウント名']); } }
  const k2 = p2.map(i => i['アカウント名']).sort().join(',');
  if (!usedCombinations.has(k2)) { patterns.push({ name: '文脈分散', desc: '異なる生活文脈から選出', icon: '🌈', team: p2, metrics: calculateTeamMetrics(p2) }); usedCombinations.add(k2); }

  // パターン3: OPS最適化
  let bestOps = [], bestOpsScore = 0;
  const top20 = [...scored].sort((a, b) => b.bas - a.bas).slice(0, 20);
  for (let s = 0; s < Math.min(10, top20.length); s++) {
    const team = [top20[s]]; const rem = top20.filter((_, i) => i !== s);
    while (team.length < 5 && rem.length > 0) {
      let best = null, bestAvg = 0;
      for (const c of rem) {
        if (team.some(t => t['アカウント名'] === c['アカウント名'])) continue;
        let sum = 0; for (const m of team) sum += calculateOPS(m, c);
        const avg = sum / team.length;
        if (avg > bestAvg) { bestAvg = avg; best = c; }
      }
      if (best) { team.push(best); rem.splice(rem.indexOf(best), 1); } else break;
    }
    const m = calculateTeamMetrics(team);
    if (m && m.avgOps > bestOpsScore) { bestOpsScore = m.avgOps; bestOps = team; }
  }
  const k3 = bestOps.map(i => i['アカウント名']).sort().join(',');
  if (bestOps.length === 5 && !usedCombinations.has(k3)) { patterns.push({ name: 'OPS最適化', desc: 'フォロワー重複率を最大化', icon: '🔗', team: bestOps, metrics: calculateTeamMetrics(bestOps) }); usedCombinations.add(k3); }

  // パターン4: Ri最適化
  const p4 = [...scored].filter(inf => inf.bas >= 0.5).sort((a, b) => b.ri - a.ri).slice(0, 5);
  const k4 = p4.map(i => i['アカウント名']).sort().join(',');
  if (p4.length === 5 && !usedCombinations.has(k4)) { patterns.push({ name: 'Ri最適化', desc: '到達成立率を最大化', icon: '📡', team: p4, metrics: calculateTeamMetrics(p4) }); usedCombinations.add(k4); }

  // パターン5: バランス
  const bal = scored.map(inf => ({ ...inf, balanceScore: inf.bas * 0.4 + inf.ri * 0.3 + (inf.contexts.length / 5) * 0.3 })).sort((a, b) => b.balanceScore - a.balanceScore);
  const p5 = []; const usedIds5 = new Set(), usedCtx5 = new Set();
  for (const inf of bal) { if (p5.length >= 5) break; const hasNew = inf.contexts.some(c => !usedCtx5.has(c)); if (p5.length < 3 || hasNew) { p5.push(inf); usedIds5.add(inf['アカウント名']); inf.contexts.forEach(c => usedCtx5.add(c)); } }
  for (const inf of bal) { if (p5.length >= 5) break; if (!usedIds5.has(inf['アカウント名'])) p5.push(inf); }
  const k5 = p5.map(i => i['アカウント名']).sort().join(',');
  if (p5.length === 5 && !usedCombinations.has(k5)) { patterns.push({ name: 'バランス', desc: '全指標のバランスを重視', icon: '⚖️', team: p5, metrics: calculateTeamMetrics(p5) }); usedCombinations.add(k5); }

  return patterns.sort((a, b) => (b.metrics?.totalScore || 0) - (a.metrics?.totalScore || 0));
};

// GVA Logo SVG Component
const GVALogo = ({ size = 40 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <path d="M50 10 L90 75 L80 75 L50 25 L20 75 L10 75 Z" fill="currentColor"/>
  </svg>
);

// メインアプリ
export default function ContactStructureDesigner() {
  const [csvData, setCsvData] = useState([]);
  const [selectedInfluencers, setSelectedInfluencers] = useState(new Set());
  const [targetProfile, setTargetProfile] = useState({ femaleRatio: 70, ageRange: '25-34歳', targetGender: 'female', country: '日本', interests: ['Beauty', 'Restaurant', 'Clothes'] });
  const [results, setResults] = useState(null);
  const [activeTab, setActiveTab] = useState('select');
  const [searchTerm, setSearchTerm] = useState('');
  const [showCriteria, setShowCriteria] = useState(false);
  const [selectedPattern, setSelectedPattern] = useState(0);
  const [selectedUGC, setSelectedUGC] = useState(new Set());
  const [ugcSearchTerm, setUgcSearchTerm] = useState('');
  const [adBudget, setAdBudget] = useState({ enabled: true, frequency: 3 });
  const [savedResults, setSavedResults] = useState([]);

  useEffect(() => {
    const sampleData = [
      { 'アカウント名': '@chacch1', '名前': '新田さちか', 'フォロワー数': '449993', 'フォロワーの女性割合': '52.60%', 'フォロワーの25-34歳の女性の割合': '24.79%', 'フォロワーの所在地１位': '日本=73.05%', '興味１位': 'Restaurants, Food & Grocery=51.33%', '興味２位': 'Toys, Children & Baby=42.47%', '興味３位': 'Beauty & Cosmetics=25.68%', 'EG率（｛いいね ＋ コメント｝ ÷ フォロワー数）': '2.45%', 'アクティブ率': '68.14%', 'プロフィール': 'Founder @vallan.jp 美容・健康ヲタ' },
      { 'アカウント名': '@maari.0108', '名前': '麻亜里', 'フォロワー数': '302114', 'フォロワーの女性割合': '51.28%', 'フォロワーの25-34歳の女性の割合': '28.13%', 'フォロワーの所在地１位': '日本=68.96%', '興味１位': 'Restaurants, Food & Grocery=56.76%', '興味２位': 'Clothes, Shoes=39.18%', '興味３位': 'Beauty & Cosmetics=33.39%', 'EG率（｛いいね ＋ コメント｝ ÷ フォロワー数）': '3.94%', 'アクティブ率': '56.43%', 'プロフィール': 'yoga model 丁寧な暮らし 美容・健康オタク' },
      { 'アカウント名': '@xoemomo', '名前': 'momoe.', 'フォロワー数': '218843', 'フォロワーの女性割合': '83.30%', 'フォロワーの25-34歳の女性の割合': '33.73%', 'フォロワーの所在地１位': '日本=94.84%', '興味１位': 'Toys, Children & Baby=50.07%', '興味２位': 'Restaurants, Food & Grocery=49.34%', '興味３位': 'Clothes, Shoes=42.95%', 'EG率（｛いいね ＋ コメント｝ ÷ フォロワー数）': '3.36%', 'アクティブ率': '71.09%', 'プロフィール': 'disney ライフスタイル' },
      { 'アカウント名': '@yy0904._', '名前': '緩苺', 'フォロワー数': '253372', 'フォロワーの女性割合': '57.07%', 'フォロワーの25-34歳の女性の割合': '21.74%', 'フォロワーの所在地１位': '日本=61.77%', '興味１位': 'Restaurants, Food & Grocery=36.40%', '興味２位': 'Clothes, Shoes=34.33%', '興味３位': 'Beauty & Cosmetics=25.97%', 'EG率（｛いいね ＋ コメント｝ ÷ フォロワー数）': '3.20%', 'アクティブ率': '67.11%', 'プロフィール': 'fashion entertainment' },
      { 'アカウント名': '@_021miu', '名前': 'oto', 'フォロワー数': '173579', 'フォロワーの女性割合': '72.90%', 'フォロワーの25-34歳の女性の割合': '31.43%', 'フォロワーの所在地１位': '日本=93.97%', '興味１位': 'Clothes, Shoes=48.68%', '興味２位': 'Restaurants, Food & Grocery=42.35%', '興味３位': 'Beauty & Cosmetics=41.03%', 'EG率（｛いいね ＋ コメント｝ ÷ フォロワー数）': '4.07%', 'アクティブ率': '81.14%', 'プロフィール': 'fashion contact DM' },
      { 'アカウント名': '@my.starry.life', '名前': 'Shiho Kasai', 'フォロワー数': '195012', 'フォロワーの女性割合': '78.82%', 'フォロワーの25-34歳の女性の割合': '33.57%', 'フォロワーの所在地１位': '日本=93.88%', '興味１位': 'Restaurants, Food & Grocery=48.13%', '興味２位': 'Toys, Children & Baby=46.45%', '興味３位': 'Clothes, Shoes=43.93%', 'EG率（｛いいね ＋ コメント｝ ÷ フォロワー数）': '16.75%', 'アクティブ率': '80.95%', 'プロフィール': 'travel lifestyle NZ' },
      { 'アカウント名': '@miraisaitou716', '名前': '斎藤みらい', 'フォロワー数': '185565', 'フォロワーの女性割合': '78.33%', 'フォロワーの25-34歳の女性の割合': '34.93%', 'フォロワーの所在地１位': '日本=74.32%', '興味１位': 'Restaurants, Food & Grocery=60.79%', '興味２位': 'Beauty & Cosmetics=49.11%', '興味３位': 'Clothes, Shoes=47.71%', 'EG率（｛いいね ＋ コメント｝ ÷ フォロワー数）': '3.69%', 'アクティブ率': '55.00%', 'プロフィール': 'beauty makeup contact mail' },
      { 'アカウント名': '@urchin.sh', '名前': '志', 'フォロワー数': '179631', 'フォロワーの女性割合': '82.51%', 'フォロワーの25-34歳の女性の割合': '36.81%', 'フォロワーの所在地１位': '日本=92.60%', '興味１位': 'Restaurants, Food & Grocery=51.31%', '興味２位': 'Clothes, Shoes=45.97%', '興味３位': 'Beauty & Cosmetics=41.30%', 'EG率（｛いいね ＋ コメント｝ ÷ フォロワー数）': '2.42%', 'アクティブ率': '78.53%', 'プロフィール': '歯医者予約 美容 健康' },
      { 'アカウント名': '@immiu3', '名前': 'miu.', 'フォロワー数': '193693', 'フォロワーの女性割合': '89.81%', 'フォロワーの25-34歳の女性の割合': '48.24%', 'フォロワーの所在地１位': '日本=91.98%', '興味１位': 'Restaurants, Food & Grocery=59.00%', '興味２位': 'Beauty & Cosmetics=44.98%', '興味３位': 'Clothes, Shoes=43.85%', 'EG率（｛いいね ＋ コメント｝ ÷ フォロワー数）': '0.01%', 'アクティブ率': '71.68%', 'プロフィール': 'tokyo director @loemtokyo クリエイター' },
      { 'アカウント名': '@__mamico', '名前': 'TAKADA MAMI', 'フォロワー数': '192013', 'フォロワーの女性割合': '89.87%', 'フォロワーの25-34歳の女性の割合': '42.00%', 'フォロワーの所在地１位': '日本=89.59%', '興味１位': 'Restaurants, Food & Grocery=58.58%', '興味２位': 'Clothes, Shoes=56.39%', '興味３位': 'Beauty & Cosmetics=54.41%', 'EG率（｛いいね ＋ コメント｝ ÷ フォロワー数）': '1.38%', 'アクティブ率': '70.64%', 'プロフィール': 'eye designer salon OL' },
      { 'アカウント名': '@soralani__', '名前': '渡辺そら', 'フォロワー数': '101593', 'フォロワーの女性割合': '89.60%', 'フォロワーの25-34歳の女性の割合': '38.97%', 'フォロワーの所在地１位': '日本=95.17%', '興味１位': 'Toys, Children & Baby=53.83%', '興味２位': 'Restaurants, Food & Grocery=49.40%', '興味３位': 'Clothes, Shoes=44.05%', 'EG率（｛いいね ＋ コメント｝ ÷ フォロワー数）': '4.69%', 'アクティブ率': '78.51%', 'プロフィール': 'honolulu tokyo disney travel' },
      { 'アカウント名': '@arisa97k', '名前': '山田ありさ', 'フォロワー数': '74910', 'フォロワーの女性割合': '85.80%', 'フォロワーの25-34歳の女性の割合': '40.55%', 'フォロワーの所在地１位': '日本=90.24%', '興味１位': 'Restaurants, Food & Grocery=50.02%', '興味２位': 'Clothes, Shoes=47.79%', '興味３位': 'Beauty & Cosmetics=42.70%', 'EG率（｛いいね ＋ コメント｝ ÷ フォロワー数）': '3.51%', 'アクティブ率': '76.57%', 'プロフィール': 'iris select director fashion クリエイター' },
    ];
    setCsvData(sampleData);
  }, []);

  const filteredData = useMemo(() => {
    if (!searchTerm) return csvData;
    return csvData.filter(inf => inf['アカウント名']?.toLowerCase().includes(searchTerm.toLowerCase()) || inf['名前']?.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [csvData, searchTerm]);

  const ugcCandidates = useMemo(() => {
    if (!results || !results.patterns[selectedPattern]) return [];
    const selectedIds = new Set(results.patterns[selectedPattern].team.map(inf => inf['アカウント名']));
    return csvData.filter(inf => selectedInfluencers.has(inf['アカウント名']) && !selectedIds.has(inf['アカウント名']))
      .map(inf => ({ ...inf, bas: calculateBAS(inf, targetProfile), ri: calculateRi(inf), contexts: inferContext(inf), followers: parseNumber(inf['フォロワー数']) }))
      .sort((a, b) => b.bas - a.bas);
  }, [results, selectedPattern, csvData, selectedInfluencers, targetProfile]);

  const filteredUgcCandidates = useMemo(() => {
    if (!ugcSearchTerm) return ugcCandidates;
    return ugcCandidates.filter(inf => inf['アカウント名']?.toLowerCase().includes(ugcSearchTerm.toLowerCase()) || inf['名前']?.toLowerCase().includes(ugcSearchTerm.toLowerCase()));
  }, [ugcCandidates, ugcSearchTerm]);

  const recontactMetrics = useMemo(() => {
    const ugcCount = selectedUGC.size;
    // インフルエンサー5名の平均OPS（フォロワー重複率）を使用
    const avgOps = results?.patterns[selectedPattern]?.metrics?.avgOps || 0;
    const pRecontact = ugcCount > 0 && avgOps > 0 ? 1 - Math.pow(1 - avgOps, ugcCount) : 0;
    const freqInf = 3.5;
    const freqUgc = ugcCount > 0 ? Math.min(ugcCount * avgOps * 2, 2) : 0;
    const freqAd = adBudget.enabled ? adBudget.frequency : 0;
    const freqTotal = freqInf + freqUgc + freqAd;
    return { ugcCount, avgOps, pRecontact, freqInf, freqUgc, freqAd, freqTotal };
  }, [selectedUGC, adBudget, results, selectedPattern]);

  const handleSelectAll = () => { if (selectedInfluencers.size === csvData.length) setSelectedInfluencers(new Set()); else setSelectedInfluencers(new Set(csvData.map(inf => inf['アカウント名']))); };
  const handleToggleInfluencer = (id) => { const n = new Set(selectedInfluencers); if (n.has(id)) n.delete(id); else n.add(id); setSelectedInfluencers(n); };
  const handleToggleUGC = (id) => { const n = new Set(selectedUGC); if (n.has(id)) n.delete(id); else n.add(id); setSelectedUGC(n); };
  const handleSelectAllUGC = () => { if (selectedUGC.size === ugcCandidates.length) setSelectedUGC(new Set()); else setSelectedUGC(new Set(ugcCandidates.map(inf => inf['アカウント名']))); };

  const handleOptimize = () => {
    const selectedData = csvData.filter(inf => selectedInfluencers.has(inf['アカウント名']));
    if (selectedData.length < 5) { alert('最低5名のインフルエンサーを選択してください'); return; }
    const patterns = generate5Patterns(selectedData, targetProfile);
    setResults({ patterns });
    setSelectedPattern(0);
    setSelectedUGC(new Set());
    setActiveTab('results');
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split('\n');
      const headers = lines[0].split(',').map(h => h.trim().replace(/^\uFEFF/, ''));
      const data = lines.slice(1).filter(line => line.trim()).map(line => {
        const values = []; let current = '', inQuotes = false;
        for (const char of line) { if (char === '"') inQuotes = !inQuotes; else if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; } else current += char; }
        values.push(current.trim());
        const obj = {}; headers.forEach((header, i) => { obj[header] = values[i] || ''; }); return obj;
      });
      setCsvData(data);
      setSelectedInfluencers(new Set());
    };
    reader.readAsText(file, 'UTF-8');
  };

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportData, setExportData] = useState('');
  const [selectedSavedResult, setSelectedSavedResult] = useState(null);

  // 保存済み結果からエクスポートデータを生成
  const generateExportDataFromSaved = (saved) => {
    let text = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    text += '　TPA 接触構造設計レポート\n';
    text += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
    text += `📅 作成日時: ${saved.date}\n`;
    text += `🎯 パターン: ${saved.patternName}\n\n`;
    
    text += '┌─────────────────────────────────────────┐\n';
    text += '│  1. 再接触設計 インフルエンサー 5名      │\n';
    text += '└─────────────────────────────────────────┘\n\n';
    saved.team5.forEach((inf, i) => {
      text += `  ${i + 1}. ${inf.name}\n`;
      text += `     ${inf.account}\n`;
      text += `     フォロワー: ${inf.followers.toLocaleString()} | BAS: ${(inf.bas * 100).toFixed(1)}% | Ri: ${(inf.ri * 100).toFixed(1)}%\n\n`;
    });
    
    text += '┌─────────────────────────────────────────┐\n';
    text += `│  2. UGC クリエイター ${saved.ugcList.length}名                  │\n`;
    text += '└─────────────────────────────────────────┘\n\n';
    saved.ugcList.forEach((inf, i) => {
      text += `  ${i + 1}. ${inf.name} (${inf.account})\n`;
      text += `     フォロワー: ${inf.followers.toLocaleString()} | BAS: ${(inf.bas * 100).toFixed(1)}%\n`;
    });
    
    text += '\n┌─────────────────────────────────────────┐\n';
    text += '│  3. スコアサマリー                       │\n';
    text += '└─────────────────────────────────────────┘\n\n';
    text += `  📊 総合スコア:      ${(saved.metrics.totalScore * 100).toFixed(1)}\n`;
    text += `  📈 平均BAS:         ${(saved.metrics.avgBas * 100).toFixed(1)}%\n`;
    text += `  🔗 平均OPS:         ${(saved.metrics.avgOps * 100).toFixed(1)}%\n`;
    text += `  👥 EOR₅推定:        ${saved.metrics.eor5.toLocaleString()}\n`;
    text += `  🔄 重複接触確率:    ${(saved.metrics.pRecontact * 100).toFixed(1)}%\n`;
    text += `  📍 Freq_total:      ${saved.metrics.freqTotal.toFixed(1)}回\n`;
    
    text += '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    text += '　GOOD VIBES AGENCY | TPA\n';
    text += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    
    return text;
  };

  // 現在の選択からエクスポートデータを生成
  const generateExportDataFromCurrent = () => {
    if (!results) return '';
    const pattern = results.patterns[selectedPattern];
    const ugcList = ugcCandidates.filter(inf => selectedUGC.has(inf['アカウント名']));
    
    const saved = {
      date: new Date().toLocaleString('ja-JP'),
      patternName: pattern.name,
      team5: pattern.team.map(inf => ({ name: inf['名前'], account: inf['アカウント名'], followers: inf.followers, bas: inf.bas, ri: inf.ri })),
      ugcList: ugcList.map(inf => ({ name: inf['名前'], account: inf['アカウント名'], followers: inf.followers, bas: inf.bas })),
      metrics: { ...pattern.metrics, ...recontactMetrics }
    };
    
    return generateExportDataFromSaved(saved);
  };

  const handleSaveResult = () => {
    if (!results) return;
    const pattern = results.patterns[selectedPattern];
    const ugcList = ugcCandidates.filter(inf => selectedUGC.has(inf['アカウント名']));
    const saved = { 
      id: Date.now(), 
      date: new Date().toLocaleString('ja-JP'), 
      patternName: pattern.name, 
      team5: pattern.team.map(inf => ({ name: inf['名前'], account: inf['アカウント名'], followers: inf.followers, bas: inf.bas, ri: inf.ri, contexts: inf.contexts })), 
      ugcList: ugcList.map(inf => ({ name: inf['名前'], account: inf['アカウント名'], followers: inf.followers, bas: inf.bas })), 
      metrics: { ...pattern.metrics, ...recontactMetrics }, 
      targetProfile: { ...targetProfile } 
    };
    setSavedResults(prev => [...prev, saved]);
    
    // 保存後に自動でエクスポートモーダルを開く
    setExportData(generateExportDataFromSaved(saved));
    setSelectedSavedResult(saved);
    setShowExportModal(true);
  };

  const handleViewSavedResult = (saved) => {
    setExportData(generateExportDataFromSaved(saved));
    setSelectedSavedResult(saved);
    setShowExportModal(true);
  };

  const handleDeleteSavedResult = (id) => {
    setSavedResults(prev => prev.filter(r => r.id !== id));
  };

  const handleExportCSV = () => {
    const data = generateExportDataFromCurrent();
    setExportData(data);
    setSelectedSavedResult(null);
    setShowExportModal(true);
  };

  const handleDownloadCSV = () => {
    const filename = selectedSavedResult 
      ? `TPA-${selectedSavedResult.patternName}-${selectedSavedResult.date.replace(/[\/\s:]/g, '-')}.txt`
      : results 
        ? `TPA-${results.patterns[selectedPattern].name}-${new Date().toISOString().slice(0, 10)}.txt`
        : `TPA-report-${new Date().toISOString().slice(0, 10)}.txt`;
    
    const dataUrl = 'data:text/plain;charset=utf-8,' + encodeURIComponent(exportData);
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(exportData).then(() => {
      alert('クリップボードにコピーしました');
    }).catch(() => {
      // フォールバック
      const textarea = document.createElement('textarea');
      textarea.value = exportData;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      alert('クリップボードにコピーしました');
    });
  };

  const getScoreColor = (score, type) => {
    if (type === 'bas') { if (score >= 0.75) return '#34c759'; if (score >= 0.65) return '#007aff'; if (score >= 0.50) return '#ff9500'; return '#ff3b30'; }
    if (type === 'ri') { if (score >= 0.35) return '#34c759'; if (score >= 0.25) return '#007aff'; if (score >= 0.15) return '#ff9500'; return '#ff3b30'; }
    if (type === 'ops') { if (score >= 0.70) return '#34c759'; if (score >= 0.55) return '#007aff'; if (score >= 0.40) return '#ff9500'; return '#ff3b30'; }
    return '#007aff';
  };

  const tabs = [
    { id: 'select', label: 'インフルエンサー選択', num: '1' },
    { id: 'config', label: 'ターゲット設定', num: '2' },
    { id: 'results', label: '5パターン分析', num: '3' },
    { id: 'ugc', label: 'UGC選択', num: '4', disabled: !results },
    { id: 'recontact', label: '重複接触確率', num: '5', disabled: !results },
    { id: 'frequency', label: '統合Frequency', num: '6', disabled: !results },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#000', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif', color: '#f5f5f7', WebkitFontSmoothing: 'antialiased' }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .fade-in { animation: fadeIn 0.4s ease-out; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #424245; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #636366; }
        .glass { background: rgba(29, 29, 31, 0.72); backdrop-filter: saturate(180%) blur(20px); -webkit-backdrop-filter: saturate(180%) blur(20px); }
        .card { background: #1d1d1f; border-radius: 18px; border: 1px solid #424245; }
        .card-hover { transition: all 0.3s cubic-bezier(0.25, 0.1, 0.25, 1); }
        .card-hover:hover { transform: scale(1.02); border-color: #636366; }
        .btn { display: inline-flex; align-items: center; justify-content: center; padding: 12px 24px; border-radius: 980px; font-size: 17px; font-weight: 400; cursor: pointer; transition: all 0.2s ease; border: none; }
        .btn-primary { background: #0071e3; color: #fff; }
        .btn-primary:hover { background: #0077ed; }
        .btn-secondary { background: transparent; border: 1px solid #424245; color: #f5f5f7; }
        .btn-secondary:hover { background: rgba(255,255,255,0.04); }
        .input { background: #1d1d1f; border: 1px solid #424245; border-radius: 12px; padding: 14px 16px; color: #f5f5f7; font-size: 17px; width: 100%; transition: border-color 0.2s; }
        .input:focus { outline: none; border-color: #0071e3; }
        .input::placeholder { color: #86868b; }
        .tab { padding: 10px 20px; background: transparent; border: none; color: #86868b; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s; position: relative; }
        .tab:hover { color: #f5f5f7; }
        .tab.active { color: #f5f5f7; }
        .tab.active::after { content: ''; position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); width: 20px; height: 3px; background: #0071e3; border-radius: 2px; }
        .tab:disabled { opacity: 0.3; cursor: not-allowed; }
        .row { display: flex; align-items: center; padding: 16px 20px; background: #1d1d1f; border-radius: 12px; margin-bottom: 8px; cursor: pointer; transition: all 0.2s; border: 1px solid transparent; }
        .row:hover { background: #2d2d2f; }
        .row.selected { background: rgba(0, 113, 227, 0.12); border-color: #0071e3; }
        .metric-box { background: linear-gradient(135deg, rgba(0,113,227,0.15) 0%, rgba(94,92,230,0.15) 100%); border-radius: 16px; padding: 20px; text-align: center; }
        .pattern-card { background: #1d1d1f; border: 2px solid #2d2d2f; border-radius: 16px; padding: 20px; cursor: pointer; transition: all 0.3s; }
        .pattern-card:hover { border-color: #424245; transform: translateY(-2px); }
        .pattern-card.selected { border-color: #0071e3; background: rgba(0,113,227,0.08); }
        .tag { display: inline-block; padding: 6px 12px; background: rgba(0,113,227,0.15); color: #0071e3; border-radius: 980px; font-size: 13px; font-weight: 500; margin-right: 6px; margin-bottom: 6px; }
        .divider { height: 1px; background: #424245; margin: 24px 0; }
        input[type="checkbox"] { width: 22px; height: 22px; accent-color: #0071e3; cursor: pointer; }
        select { appearance: none; background: #1d1d1f url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2386868b' d='M6 8L1 3h10z'/%3E%3C/svg%3E") no-repeat right 16px center; }
      `}</style>

      {/* Navigation */}
      <nav className="glass" style={{ position: 'sticky', top: 0, zIndex: 100, borderBottom: '1px solid rgba(66,66,69,0.5)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 48 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <GVALogo size={22} />
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.05em', color: '#f5f5f7' }}>TPA</span>
              <span style={{ fontSize: 11, color: '#86868b', letterSpacing: '0.02em' }}>TOUCHPOINT ARCHITECTURE PR</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="btn-secondary" onClick={() => setShowCriteria(true)} style={{ padding: '6px 12px', fontSize: 12, borderRadius: 6 }}>基準値</button>
            <button className="btn-secondary" onClick={handleExportCSV} style={{ padding: '6px 12px', fontSize: 12, borderRadius: 6 }}>結果出力</button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ padding: '48px 24px 40px', textAlign: 'center', background: 'linear-gradient(180deg, #000 0%, #0d0d0d 100%)' }}>
        <h1 style={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 8, color: '#f5f5f7' }}>
          TPA
        </h1>
        <p style={{ fontSize: 11, color: '#86868b', letterSpacing: '0.08em', marginBottom: 16, textTransform: 'uppercase' }}>Touchpoint Architecture PR</p>
        <p style={{ fontSize: 15, color: '#636366', maxWidth: 480, margin: '0 auto', lineHeight: 1.5 }}>
          Frequencyベースの意思決定確率最適化
        </p>
      </section>

      {/* Tabs */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #2d2d2f', marginBottom: 32, overflowX: 'auto' }}>
          {tabs.map(t => (
            <button key={t.id} className={`tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => !t.disabled && setActiveTab(t.id)} disabled={t.disabled}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: '50%', background: activeTab === t.id ? '#0071e3' : '#424245', fontSize: 11, marginRight: 8 }}>{t.num}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px 80px' }}>
        {/* ① Select */}
        {activeTab === 'select' && (
          <div className="card fade-in" style={{ padding: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 8 }}>インフルエンサー選択</h2>
                <p style={{ color: '#86868b', fontSize: 15 }}>施策対象のインフルエンサーを選択してください。最低5名必要です。</p>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <label className="btn btn-secondary" style={{ fontSize: 15, padding: '10px 20px' }}>
                  <input type="file" accept=".csv" onChange={handleFileUpload} style={{ display: 'none' }} />
                  CSVをアップロード
                </label>
                <button className="btn btn-secondary" onClick={handleSelectAll} style={{ fontSize: 15, padding: '10px 20px' }}>
                  {selectedInfluencers.size === csvData.length ? '選択解除' : '全て選択'}
                </button>
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <input className="input" type="text" placeholder="アカウント名または名前で検索" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ maxWidth: 320 }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', color: '#86868b', fontSize: 13, fontWeight: 500, borderBottom: '1px solid #2d2d2f', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}><span style={{ width: 30 }}></span><span>アカウント</span></div>
              <div style={{ width: 100, textAlign: 'right' }}>フォロワー</div>
              <div style={{ width: 80, textAlign: 'right' }}>女性比率</div>
              <div style={{ width: 80, textAlign: 'right' }}>EG率</div>
            </div>
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {filteredData.map((inf, idx) => (
                <div key={inf['アカウント名'] || idx} className={`row ${selectedInfluencers.has(inf['アカウント名']) ? 'selected' : ''}`} onClick={() => handleToggleInfluencer(inf['アカウント名'])}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}>
                    <input type="checkbox" checked={selectedInfluencers.has(inf['アカウント名'])} onChange={() => {}} />
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 15 }}>{inf['名前'] || inf['アカウント名']}</div>
                      <a 
                        href={`https://instagram.com/${(inf['アカウント名'] || '').replace('@', '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{ fontSize: 13, color: '#0071e3', textDecoration: 'none', transition: 'opacity 0.2s' }}
                        onMouseEnter={(e) => e.target.style.opacity = '0.7'}
                        onMouseLeave={(e) => e.target.style.opacity = '1'}
                      >
                        {inf['アカウント名']}
                      </a>
                    </div>
                  </div>
                  <div style={{ width: 100, textAlign: 'right', fontWeight: 600, fontFeatureSettings: '"tnum"' }}>{parseNumber(inf['フォロワー数']).toLocaleString()}</div>
                  <div style={{ width: 80, textAlign: 'right', color: '#86868b' }}>{inf['フォロワーの女性割合'] || '-'}</div>
                  <div style={{ width: 80, textAlign: 'right', color: '#0071e3' }}>{inf['EG率（｛いいね ＋ コメント｝ ÷ フォロワー数）'] || '-'}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 24, padding: '16px 20px', background: '#0d0d0d', borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#86868b' }}>{selectedInfluencers.size}名選択中</span>
              <button className="btn btn-primary" onClick={() => setActiveTab('config')} disabled={selectedInfluencers.size < 5} style={{ opacity: selectedInfluencers.size < 5 ? 0.5 : 1 }}>
                次へ進む →
              </button>
            </div>
          </div>
        )}

        {/* ② Config */}
        {activeTab === 'config' && (
          <div className="card fade-in" style={{ padding: 32 }}>
            <h2 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 8 }}>ターゲットプロファイル</h2>
            <p style={{ color: '#86868b', fontSize: 15, marginBottom: 32 }}>最適化の基準となるターゲット属性を設定してください。</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24, marginBottom: 32 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#86868b', marginBottom: 8, fontWeight: 500 }}>ターゲット女性比率</label>
                <div style={{ position: 'relative' }}>
                  <input className="input" type="number" value={targetProfile.femaleRatio} onChange={(e) => setTargetProfile({...targetProfile, femaleRatio: parseInt(e.target.value) || 0})} min="0" max="100" />
                  <span style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', color: '#86868b' }}>%</span>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#86868b', marginBottom: 8, fontWeight: 500 }}>ターゲット年齢層</label>
                <select className="input" value={targetProfile.ageRange} onChange={(e) => setTargetProfile({...targetProfile, ageRange: e.target.value})}>
                  <option value="18-24歳">18-24歳</option>
                  <option value="25-34歳">25-34歳</option>
                  <option value="35-44歳">35-44歳</option>
                  <option value="45-64歳">45-64歳</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#86868b', marginBottom: 8, fontWeight: 500 }}>ターゲット国</label>
                <select className="input" value={targetProfile.country} onChange={(e) => setTargetProfile({...targetProfile, country: e.target.value})}>
                  <option value="日本">日本</option>
                  <option value="韓国">韓国</option>
                  <option value="台湾">台湾</option>
                  <option value="中国">中国</option>
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 32 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#86868b', marginBottom: 12, fontWeight: 500 }}>興味カテゴリ</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {['Beauty', 'Restaurant', 'Clothes', 'Travel', 'Coffee', 'Fitness', 'Lifestyle'].map(cat => (
                  <button key={cat} onClick={() => { const interests = targetProfile.interests.includes(cat) ? targetProfile.interests.filter(i => i !== cat) : [...targetProfile.interests, cat]; setTargetProfile({...targetProfile, interests}); }}
                    style={{ padding: '10px 20px', borderRadius: 980, border: targetProfile.interests.includes(cat) ? '2px solid #0071e3' : '1px solid #424245', background: targetProfile.interests.includes(cat) ? 'rgba(0,113,227,0.15)' : 'transparent', color: targetProfile.interests.includes(cat) ? '#0071e3' : '#f5f5f7', cursor: 'pointer', fontSize: 15, fontWeight: 500, transition: 'all 0.2s' }}>
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <button className="btn btn-primary" onClick={handleOptimize} style={{ width: '100%', padding: '16px 24px', fontSize: 17 }}>
              5パターンを生成する
            </button>
          </div>
        )}

        {/* ③ Results */}
        {activeTab === 'results' && results && (
          <div className="fade-in">
            <div className="card" style={{ padding: 32, marginBottom: 24 }}>
              <h2 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 8 }}>最適化パターン</h2>
              <p style={{ color: '#86868b', fontSize: 15, marginBottom: 24 }}>異なる最適化軸で生成された5パターンから選択してください。</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
                {results.patterns.map((p, idx) => (
                  <div key={idx} className={`pattern-card ${selectedPattern === idx ? 'selected' : ''}`} onClick={() => { setSelectedPattern(idx); setSelectedUGC(new Set()); }}>
                    <div style={{ fontSize: 28, marginBottom: 12 }}>{p.icon}</div>
                    <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: '#86868b', marginBottom: 12, minHeight: 32 }}>{p.desc}</div>
                    <div style={{ fontSize: 32, fontWeight: 600, color: '#0071e3', fontFeatureSettings: '"tnum"' }}>{(p.metrics?.totalScore * 100).toFixed(1)}</div>
                    <div style={{ fontSize: 11, color: '#86868b' }}>総合スコア</div>
                  </div>
                ))}
              </div>
            </div>

            {results.patterns[selectedPattern] && (
              <div className="card" style={{ padding: 32 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <span style={{ fontSize: 48 }}>{results.patterns[selectedPattern].icon}</span>
                    <div>
                      <h3 style={{ fontSize: 24, fontWeight: 600, marginBottom: 4 }}>{results.patterns[selectedPattern].name}</h3>
                      <p style={{ color: '#86868b', fontSize: 15 }}>{results.patterns[selectedPattern].desc}</p>
                    </div>
                  </div>
                  <div style={{ background: 'linear-gradient(135deg, #0071e3, #5e5ce6)', borderRadius: 16, padding: '16px 24px', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 4 }}>総合スコア</div>
                    <div style={{ fontSize: 36, fontWeight: 600, fontFeatureSettings: '"tnum"' }}>{(results.patterns[selectedPattern].metrics?.totalScore * 100).toFixed(1)}</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 32 }}>
                  {[
                    { label: '平均BAS', value: `${(results.patterns[selectedPattern].metrics?.avgBas * 100).toFixed(1)}%`, color: getScoreColor(results.patterns[selectedPattern].metrics?.avgBas, 'bas') },
                    { label: '最小Ri', value: `${(results.patterns[selectedPattern].metrics?.minRi * 100).toFixed(1)}%`, color: getScoreColor(results.patterns[selectedPattern].metrics?.minRi, 'ri') },
                    { label: '平均OPS', value: `${(results.patterns[selectedPattern].metrics?.avgOps * 100).toFixed(1)}%`, color: getScoreColor(results.patterns[selectedPattern].metrics?.avgOps, 'ops') },
                    { label: 'EOR₅', value: results.patterns[selectedPattern].metrics?.eor5.toLocaleString(), color: '#5e5ce6' },
                    { label: '文脈分散', value: `${results.patterns[selectedPattern].metrics?.contextCount}/5`, color: '#5e5ce6' },
                  ].map((m, i) => (
                    <div key={i} className="metric-box">
                      <div style={{ fontSize: 28, fontWeight: 600, color: m.color, fontFeatureSettings: '"tnum"', marginBottom: 4 }}>{m.value}</div>
                      <div style={{ fontSize: 12, color: '#86868b' }}>{m.label}</div>
                    </div>
                  ))}
                </div>

                <h4 style={{ fontSize: 17, fontWeight: 600, marginBottom: 16 }}>選出インフルエンサー</h4>
                {results.patterns[selectedPattern].team.map((inf, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', background: '#0d0d0d', borderRadius: 16, marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{ width: 36, height: 36, background: 'linear-gradient(135deg, #0071e3, #5e5ce6)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>{idx + 1}</div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 2 }}>{inf['名前']}</div>
                        <a 
                          href={`https://instagram.com/${(inf['アカウント名'] || '').replace('@', '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: 13, color: '#0071e3', textDecoration: 'none', transition: 'opacity 0.2s' }}
                          onMouseEnter={(e) => e.target.style.opacity = '0.7'}
                          onMouseLeave={(e) => e.target.style.opacity = '1'}
                        >
                          {inf['アカウント名']}
                        </a>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                      <div style={{ display: 'flex', gap: 8 }}>{inf.contexts?.slice(0, 3).map((ctx, i) => <span key={i} className="tag">{ctx}</span>)}</div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 18, fontWeight: 600, fontFeatureSettings: '"tnum"' }}>{inf.followers.toLocaleString()}</div>
                        <div style={{ fontSize: 12, color: '#86868b' }}>
                          <span style={{ color: getScoreColor(inf.bas, 'bas') }}>BAS {(inf.bas*100).toFixed(0)}%</span>
                          <span style={{ margin: '0 8px', opacity: 0.3 }}>|</span>
                          <span style={{ color: getScoreColor(inf.ri, 'ri') }}>Ri {(inf.ri*100).toFixed(0)}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                <div style={{ marginTop: 24, textAlign: 'center' }}>
                  <button className="btn btn-primary" onClick={() => setActiveTab('ugc')}>UGC選択へ進む →</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ④ UGC */}
        {activeTab === 'ugc' && results && (
          <div className="card fade-in" style={{ padding: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 8 }}>UGCクリエイター選択</h2>
                <p style={{ color: '#86868b', fontSize: 15 }}>5名選出者を除いた候補からUGCクリエイターを選択してください。</p>
              </div>
              <button className="btn btn-secondary" onClick={handleSelectAllUGC} style={{ fontSize: 15, padding: '10px 20px' }}>
                {selectedUGC.size === ugcCandidates.length ? '選択解除' : '全て選択'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {[20, 30, 50].map(n => (
                <button key={n} onClick={() => setSelectedUGC(new Set(ugcCandidates.slice(0, n).map(i => i['アカウント名'])))}
                  style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #5e5ce6', background: 'rgba(94,92,230,0.15)', color: '#f5f5f7', cursor: 'pointer', fontSize: 14 }}>
                  上位{n}名を選択
                </button>
              ))}
            </div>

            <input className="input" type="text" placeholder="検索" value={ugcSearchTerm} onChange={(e) => setUgcSearchTerm(e.target.value)} style={{ maxWidth: 280, marginBottom: 16 }} />

            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {filteredUgcCandidates.map((inf) => (
                <div key={inf['アカウント名']} className={`row ${selectedUGC.has(inf['アカウント名']) ? 'selected' : ''}`} onClick={() => handleToggleUGC(inf['アカウント名'])} style={{ padding: '14px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}>
                    <input type="checkbox" checked={selectedUGC.has(inf['アカウント名'])} onChange={() => {}} />
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 15 }}>{inf['名前']}</div>
                      <a 
                        href={`https://instagram.com/${(inf['アカウント名'] || '').replace('@', '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{ fontSize: 13, color: '#0071e3', textDecoration: 'none', transition: 'opacity 0.2s' }}
                        onMouseEnter={(e) => e.target.style.opacity = '0.7'}
                        onMouseLeave={(e) => e.target.style.opacity = '1'}
                      >
                        {inf['アカウント名']}
                      </a>
                    </div>
                  </div>
                  <div style={{ width: 100, textAlign: 'right', fontWeight: 600 }}>{inf.followers.toLocaleString()}</div>
                  <div style={{ width: 80, textAlign: 'right', color: getScoreColor(inf.bas, 'bas') }}>{(inf.bas * 100).toFixed(0)}%</div>
                </div>
              ))}
              {ugcCandidates.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#86868b' }}>候補がありません</div>}
            </div>

            <div style={{ marginTop: 24, padding: '16px 20px', background: '#0d0d0d', borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#86868b' }}>{selectedUGC.size}名選択中</span>
              <button className="btn btn-primary" onClick={() => setActiveTab('recontact')}>重複接触確率を確認 →</button>
            </div>
          </div>
        )}

        {/* ⑤ Recontact */}
        {activeTab === 'recontact' && results && (
          <div className="card fade-in" style={{ padding: 32 }}>
            <h2 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 8 }}>重複接触確率分析</h2>
            <p style={{ color: '#86868b', fontSize: 15, marginBottom: 32 }}>インフルエンサー5名に接触した人が、UGCでも重複接触する確率を算出します。</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
              <div className="metric-box">
                <div style={{ fontSize: 40, fontWeight: 600, color: '#5e5ce6', fontFeatureSettings: '"tnum"' }}>{selectedUGC.size}</div>
                <div style={{ fontSize: 13, color: '#86868b' }}>UGC人数 (U)</div>
              </div>
              <div className="metric-box">
                <div style={{ fontSize: 40, fontWeight: 600, color: '#0071e3', fontFeatureSettings: '"tnum"' }}>{(recontactMetrics.avgOps * 100).toFixed(1)}%</div>
                <div style={{ fontSize: 13, color: '#86868b' }}>平均OPS</div>
              </div>
              <div className="metric-box">
                <div style={{ fontSize: 40, fontWeight: 600, color: recontactMetrics.pRecontact >= 0.90 ? '#34c759' : recontactMetrics.pRecontact >= 0.70 ? '#0071e3' : '#ff9500', fontFeatureSettings: '"tnum"' }}>
                  {(recontactMetrics.pRecontact * 100).toFixed(1)}%
                </div>
                <div style={{ fontSize: 13, color: '#86868b' }}>P_recontact</div>
              </div>
              <div className="metric-box">
                <div style={{ fontSize: 40, fontWeight: 600, color: '#0071e3', fontFeatureSettings: '"tnum"' }}>{recontactMetrics.freqUgc.toFixed(1)}</div>
                <div style={{ fontSize: 13, color: '#86868b' }}>Freq_UGC</div>
              </div>
            </div>

            <div style={{ background: '#0d0d0d', borderRadius: 16, padding: 24, marginBottom: 24 }}>
              <h4 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>計算式</h4>
              <div style={{ fontFamily: 'SF Mono, Monaco, monospace', fontSize: 14, background: '#1d1d1f', padding: 16, borderRadius: 12, marginBottom: 12 }}>
                P_recontact = 1 − (1 − OPS)<sup>U</sup> = 1 − (1 − {(recontactMetrics.avgOps).toFixed(2)})<sup>{selectedUGC.size}</sup> = <span style={{ color: '#0071e3' }}>{(recontactMetrics.pRecontact * 100).toFixed(2)}%</span>
              </div>
              <p style={{ fontSize: 13, color: '#86868b' }}>OPS = {(recontactMetrics.avgOps * 100).toFixed(1)}%（5名チームの平均フォロワー重複率）、U = {selectedUGC.size}（UGC人数）</p>
            </div>

            <div style={{ background: 'rgba(94,92,230,0.1)', borderRadius: 16, padding: 20 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>UGC人数と重複接触確率</h4>
              <p style={{ fontSize: 12, color: '#86868b', marginBottom: 12 }}>現在のOPS（{(recontactMetrics.avgOps * 100).toFixed(1)}%）における、UGC人数ごとの期待重複接触確率</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                {[5, 10, 20, 30].map(n => {
                  const expectedP = recontactMetrics.avgOps > 0 ? (1 - Math.pow(1 - recontactMetrics.avgOps, n)) * 100 : 0;
                  const achieved = selectedUGC.size >= n;
                  return (
                    <div key={n} style={{ padding: 14, background: '#1d1d1f', borderRadius: 12, textAlign: 'center', border: achieved ? '2px solid #34c759' : '1px solid #2d2d2f' }}>
                      <div style={{ color: achieved ? '#34c759' : '#86868b', fontSize: 12, marginBottom: 4 }}>{n}名</div>
                      <div style={{ fontSize: 22, fontWeight: 600 }}>{expectedP.toFixed(0)}%</div>
                    </div>
                  );
                })}
              </div>
              {selectedUGC.size > 0 && (
                <div style={{ marginTop: 16, padding: 12, background: '#1d1d1f', borderRadius: 8, textAlign: 'center' }}>
                  <span style={{ fontSize: 13 }}>
                    現在 <strong style={{ color: '#5e5ce6' }}>{selectedUGC.size}名</strong> 選択中 → 
                    重複接触確率 <strong style={{ color: recontactMetrics.pRecontact >= 0.90 ? '#34c759' : '#ff9500' }}>{(recontactMetrics.pRecontact * 100).toFixed(1)}%</strong>
                  </span>
                </div>
              )}
            </div>

            <div style={{ marginTop: 24, textAlign: 'center' }}>
              <button className="btn btn-primary" onClick={() => setActiveTab('frequency')}>統合Frequencyへ →</button>
            </div>
          </div>
        )}

        {/* ⑥ Frequency */}
        {activeTab === 'frequency' && results && (
          <div className="card fade-in" style={{ padding: 32 }}>
            <h2 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 8 }}>統合Frequency予測</h2>
            <p style={{ color: '#86868b', fontSize: 15, marginBottom: 32 }}>全施策を統合した接触回数を算出します。</p>

            <div style={{ background: '#0d0d0d', borderRadius: 20, padding: 32, marginBottom: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, flexWrap: 'wrap', marginBottom: 24 }}>
                {[
                  { label: 'Freq_inf', value: recontactMetrics.freqInf.toFixed(1) },
                  { label: 'Freq_UGC', value: recontactMetrics.freqUgc.toFixed(1) },
                  { label: 'Freq_ad', value: recontactMetrics.freqAd.toFixed(1) },
                ].map((x, i) => (
                  <React.Fragment key={x.label}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 13, color: '#86868b', marginBottom: 4 }}>{x.label}</div>
                      <div style={{ fontSize: 40, fontWeight: 600, fontFeatureSettings: '"tnum"' }}>{x.value}</div>
                    </div>
                    {i < 2 && <span style={{ fontSize: 32, color: '#424245' }}>+</span>}
                  </React.Fragment>
                ))}
                <span style={{ fontSize: 32, color: '#424245' }}>=</span>
                <div style={{ background: 'linear-gradient(135deg, #0071e3, #5e5ce6)', borderRadius: 16, padding: '16px 32px', textAlign: 'center' }}>
                  <div style={{ fontSize: 13, opacity: 0.9, marginBottom: 4 }}>Freq_total</div>
                  <div style={{ fontSize: 48, fontWeight: 600, fontFeatureSettings: '"tnum"' }}>{recontactMetrics.freqTotal.toFixed(1)}</div>
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <span style={{ display: 'inline-block', padding: '10px 20px', borderRadius: 980, background: recontactMetrics.freqTotal >= 5 ? 'rgba(52,199,89,0.15)' : 'rgba(255,149,0,0.15)', color: recontactMetrics.freqTotal >= 5 ? '#34c759' : '#ff9500', fontSize: 15, fontWeight: 500 }}>
                  {recontactMetrics.freqTotal >= 5 ? '✓ 基準達成（≥5回）' : '⚠ 基準未達（<5回）'}
                </span>
              </div>
            </div>

            <div style={{ marginBottom: 32 }}>
              <h4 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>広告配信設定</h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: 20, background: '#0d0d0d', borderRadius: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input type="checkbox" checked={adBudget.enabled} onChange={(e) => setAdBudget({...adBudget, enabled: e.target.checked})} />
                  <span style={{ fontSize: 15 }}>広告配信を含める</span>
                </label>
                {adBudget.enabled && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 14, color: '#86868b' }}>Frequency:</span>
                    <input className="input" type="number" value={adBudget.frequency} onChange={(e) => setAdBudget({...adBudget, frequency: parseInt(e.target.value) || 0})} min="0" max="10" style={{ width: 80 }} />
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 32 }}>
              <div style={{ background: '#0d0d0d', borderRadius: 16, padding: 24 }}>
                <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>構成サマリー</h4>
                <div style={{ fontSize: 15, lineHeight: 2 }}>
                  <div>インフルエンサー: <strong style={{ color: '#0071e3' }}>5名</strong>（{results.patterns[selectedPattern].name}）</div>
                  <div>UGCクリエイター: <strong style={{ color: '#5e5ce6' }}>{selectedUGC.size}名</strong></div>
                  <div>広告配信: <strong>{adBudget.enabled ? `${adBudget.frequency}回` : 'なし'}</strong></div>
                </div>
              </div>
              <div style={{ background: '#0d0d0d', borderRadius: 16, padding: 24 }}>
                <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>スコアサマリー</h4>
                <div style={{ fontSize: 15, lineHeight: 2 }}>
                  <div>平均BAS: <strong style={{ color: getScoreColor(results.patterns[selectedPattern].metrics?.avgBas, 'bas') }}>{(results.patterns[selectedPattern].metrics?.avgBas * 100).toFixed(1)}%</strong></div>
                  <div>EOR₅: <strong>{results.patterns[selectedPattern].metrics?.eor5.toLocaleString()}</strong></div>
                  <div>P_recontact: <strong style={{ color: recontactMetrics.pRecontact >= 0.88 ? '#34c759' : '#ff9500' }}>{(recontactMetrics.pRecontact * 100).toFixed(1)}%</strong></div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button className="btn btn-secondary" onClick={handleSaveResult}>💾 アプリ内保存</button>
              <button className="btn btn-primary" onClick={handleExportCSV}>📥 結果を出力</button>
            </div>

            {savedResults.length > 0 && (
              <div style={{ marginTop: 32, padding: 20, background: '#0d0d0d', borderRadius: 16 }}>
                <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>保存済み結果（{savedResults.length}件）</h4>
                <p style={{ fontSize: 12, color: '#86868b', marginBottom: 12 }}>クリックで詳細を表示・コピー</p>
                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {savedResults.map((r) => (
                    <div 
                      key={r.id} 
                      style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        padding: '12px 16px', 
                        background: '#1d1d1f', 
                        borderRadius: 10, 
                        marginBottom: 8, 
                        cursor: 'pointer',
                        border: '1px solid transparent',
                        transition: 'all 0.2s'
                      }}
                      onClick={() => handleViewSavedResult(r)}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#0071e3'; e.currentTarget.style.background = '#252527'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = '#1d1d1f'; }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                          <span style={{ color: '#0071e3' }}>{r.patternName}</span>
                          <span style={{ color: '#86868b', marginLeft: 8, fontSize: 12 }}>5名 + UGC {r.ugcList.length}名</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#636366' }}>
                          BAS {(r.metrics.avgBas * 100).toFixed(0)}% | P_recontact {(r.metrics.pRecontact * 100).toFixed(0)}% | Freq {r.metrics.freqTotal.toFixed(1)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 11, color: '#86868b' }}>{r.date}</span>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDeleteSavedResult(r.id); }}
                          style={{ background: 'none', border: 'none', color: '#ff453a', cursor: 'pointer', fontSize: 16, padding: '4px 8px' }}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'results' && !results && (
          <div className="card" style={{ padding: 80, textAlign: 'center' }}>
            <div style={{ fontSize: 64, marginBottom: 24, opacity: 0.5 }}>📊</div>
            <p style={{ color: '#86868b', fontSize: 17 }}>ターゲット設定を完了し「5パターンを生成する」を実行してください。</p>
          </div>
        )}
      </div>

      {/* Criteria Modal */}
      {showCriteria && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowCriteria(false)}>
          <div className="card" style={{ maxWidth: 640, maxHeight: '80vh', overflowY: 'auto', padding: 32 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: 24, fontWeight: 600 }}>スコア基準</h2>
              <button onClick={() => setShowCriteria(false)} style={{ background: 'none', border: 'none', color: '#86868b', fontSize: 28, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            {[
              { name: 'BAS（ブランド近似度）', formula: '0.30×性別 + 0.25×年齢 + 0.20×国 + 0.25×興味', threshold: '≥ 65%' },
              { name: 'Ri（到達成立率）', formula: 'EG率×2.5 + アクティブ率×0.4', threshold: '≥ 25%' },
              { name: 'OPS（重なりポテンシャル）', formula: 'ペア間の属性類似度', threshold: '55-75%' },
              { name: 'EOR₅', formula: 'min(Ri) × min(OPS) × Σリーチ', threshold: '≥ 5,000' },
              { name: 'P_recontact（重複接触確率）', formula: '1 - (1 - OPS)^U', threshold: 'OPSとUGC人数に依存' },
              { name: 'Freq_total', formula: 'Freq_inf + Freq_UGC + Freq_ad', threshold: '≥ 5回' },
            ].map((c, i) => (
              <div key={i} style={{ background: '#0d0d0d', borderRadius: 12, padding: 16, marginBottom: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 8, color: '#0071e3' }}>{c.name}</div>
                <div style={{ fontFamily: 'SF Mono, Monaco, monospace', fontSize: 13, background: '#1d1d1f', padding: 10, borderRadius: 8, marginBottom: 8 }}>{c.formula}</div>
                <div style={{ fontSize: 13 }}><span style={{ color: '#86868b' }}>基準: </span><span style={{ color: '#34c759' }}>{c.threshold}</span></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Export Modal */}
      {showExportModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowExportModal(false)}>
          <div className="card" style={{ maxWidth: 720, width: '92%', maxHeight: '88vh', display: 'flex', flexDirection: 'column', padding: 0 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid #2d2d2f', background: 'linear-gradient(135deg, rgba(0,113,227,0.1), rgba(94,92,230,0.1))' }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>📄 接触構造設計レポート</h2>
                {selectedSavedResult && (
                  <p style={{ fontSize: 12, color: '#86868b' }}>{selectedSavedResult.patternName} | {selectedSavedResult.date}</p>
                )}
              </div>
              <button onClick={() => setShowExportModal(false)} style={{ background: 'none', border: 'none', color: '#86868b', fontSize: 24, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: '12px 24px', background: '#0a0a0a', borderBottom: '1px solid #2d2d2f' }}>
              <p style={{ fontSize: 12, color: '#86868b' }}>💡 このレポートをコピーしてクライアントへ送信できます</p>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
              <pre style={{ 
                background: '#0d0d0d', 
                borderRadius: 12, 
                padding: 20, 
                fontSize: 13, 
                fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                color: '#f5f5f7',
                margin: 0,
                lineHeight: 1.8,
                border: '1px solid #2d2d2f'
              }}>
                {exportData}
              </pre>
            </div>
            <div style={{ display: 'flex', gap: 12, padding: '16px 24px', borderTop: '1px solid #2d2d2f', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#636366' }}>GOOD VIBES AGENCY | TPA</span>
              <div style={{ display: 'flex', gap: 12 }}>
                <button className="btn btn-secondary" onClick={handleCopyToClipboard} style={{ fontSize: 14, padding: '10px 20px' }}>
                  📋 テキストをコピー
                </button>
                <button className="btn btn-primary" onClick={handleDownloadCSV} style={{ fontSize: 14, padding: '10px 20px' }}>
                  ⬇️ ファイル保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #2d2d2f', padding: '32px 24px', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
          <GVALogo size={20} />
          <span style={{ fontSize: 13, fontWeight: 500 }}>GOOD VIBES AGENCY</span>
        </div>
        <p style={{ color: '#86868b', fontSize: 11 }}>TPA — TOUCHPOINT ARCHITECTURE PR</p>
      </footer>
    </div>
  );
}
