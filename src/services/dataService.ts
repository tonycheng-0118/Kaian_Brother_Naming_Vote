import axios from 'axios';
import Papa from 'papaparse';
import { NameAnalysis, NameStats, ScoreBreakdown } from '../types';

export interface ExcludeData {
  excludedChars: string[];
  excludedNames: string[];
}

export interface NameRecord {
  char: string;
  frequency: number;
  rank: number;
  isPopular: boolean;
  isPolyphonic: boolean;
  isExcluded: boolean; // Retained for backwards compatibility
}

export interface NameDataResponse {
  records: NameRecord[];
  excludeData: ExcludeData;
}

// 鄭家使用的名字參考資料庫 (公用 CSV)
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRiPAZYD65-v-Qm0361dJIx-Nor-AuBgojoASrNr1AoYBTuDkte9rYyiel52TejL2lYQaMir_p2TDyD/pub?gid=781012340&single=true&output=csv';

export async function fetchNameData(): Promise<NameDataResponse> {
  try {
    const response = await axios.get(SHEET_URL);
    const results = Papa.parse(response.data, { header: true, skipEmptyLines: true });
    
    const records: NameRecord[] = [];
    const excludedChars: string[] = [];
    const excludedNames: string[] = [];

    results.data.forEach((row: any) => {
      const char = row['出現字']?.trim();
      const excludedChar = row['排除字體']?.trim();
      const excludedName = row['排除名字']?.trim();

      if (excludedChar) {
        excludedChars.push(excludedChar);
      }
      if (excludedName) {
        excludedNames.push(excludedName);
      }

      if (char) {
        records.push({
          char: char,
          frequency: parseInt(row['出現字次數'] || '0', 10),
          rank: parseInt(row['常用5000字位置'] || '0', 10),
          isPopular: row['流行名字']?.toUpperCase() === 'TRUE',
          isPolyphonic: row['破音字']?.toUpperCase() === 'TRUE',
          isExcluded: false // We will evaluate this via findCharStats
        });
      }
    });

    return {
      records,
      excludeData: { excludedChars, excludedNames }
    };
  } catch (error) {
    console.error('Failed to fetch name data:', error);
    return { records: [], excludeData: { excludedChars: [], excludedNames: [] } };
  }
}

export function findCharStats(data: NameRecord[], char: string, excludeData?: ExcludeData): NameStats {
  const found = data.find(d => d.char === char);
  const isExcluded = excludeData ? excludeData.excludedChars.includes(char) : false;

  if (found) {
    return {
      frequency: found.frequency,
      rank: found.rank,
      isPopular: found.isPopular,
      isPolyphonic: found.isPolyphonic,
      isExcluded: isExcluded,
      description: `${char}字在資料庫中出現過 ${found.frequency} 次，排在第 ${found.rank} 名。`
    };
  }
  return {
    frequency: 0,
    rank: 0,
    isPopular: false,
    isPolyphonic: false,
    isExcluded: isExcluded,
    description: `此字在現有 5000+ 進階字庫中較為罕見。`
  };
}

export function calculateLocalAnalysis(
  surname: string,
  char1: string,
  char2: string,
  stats1: NameStats,
  stats2: NameStats,
  userWish: string
): NameAnalysis {
  // 1. Scoring Logic
  let baseScore = 80;
  let freqPoints = Math.min(5, (stats1.frequency + stats2.frequency) / 500);
  let rankPoints = (stats1.rank > 0 && stats1.rank < 100 ? 2.5 : 0) + (stats2.rank > 0 && stats2.rank < 100 ? 2.5 : 0);
  let popularityPoints = (stats1.isPopular ? 2.5 : 0) + (stats2.isPopular ? 2.5 : 0);
  
  // Heuristic "Harmony" points (The replacement for AI points)
  let harmonyPoints = 0;
  if (userWish.length > 5) harmonyPoints += 2.5;
  if (char1 !== char2) harmonyPoints += 2.5;

  let overallScore = Math.floor(baseScore + freqPoints + rankPoints + popularityPoints + harmonyPoints);
  
  // 限制最高 99 分 (留一分給完美的謙虛)
  if (overallScore > 99) overallScore = 99;

  // 2. Penalty Check
  let isPenaltyTriggered = false;
  let penaltyReason = null;
  if (stats1.isExcluded || stats2.isExcluded) {
    isPenaltyTriggered = true;
    penaltyReason = "命中資料庫排除字（如冷僻字或寓意不佳字）。";
    overallScore = Math.min(overallScore, 40);
  }

  // 3. Report Generation (Rule-based templates)
  const scoreLevel = 
    overallScore >= 90 ? "卓越不凡" :
    overallScore >= 80 ? "優質之選" :
    overallScore >= 70 ? "平實穩健" : "尚可參考";

  const reportData = [
    `這個名字「${surname}${char1}${char2}」聽起來${overallScore >= 85 ? '清脆悅耳' : '穩重得體'}。`,
    stats1.isPopular && stats2.isPopular ? `二字皆為流行常用字，親和力極佳。` : `字體組合獨特，不易與他人重名。`,
    userWish ? `針對您的期望「${userWish}」，我們認為這個名字能承載這份祝福。` : `這是一個具有平衡美感的命名選擇。`
  ];

  return {
    char1,
    char1Stats: stats1,
    char2,
    char2Stats: stats2,
    overallScore,
    report: reportData.join(''),
    scoreBreakdown: {
      baseScore,
      freqPoints: Math.round(freqPoints * 10) / 10,
      rankPoints: Math.round(rankPoints * 10) / 10,
      popularityPoints: Math.round(popularityPoints * 10) / 10,
      aiPoints: Math.round(harmonyPoints * 10) / 10, // Keep naming internal for UI consistency
      isPenaltyTriggered,
      penaltyReason
    }
  };
}
