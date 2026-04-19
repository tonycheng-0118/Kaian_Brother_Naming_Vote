export interface NameStats {
  frequency: number;
  rank: number;
  isPopular: boolean;
  isPolyphonic: boolean; // 破音字
  isExcluded: boolean; // 排除字
  description: string;
}

export interface ScoreBreakdown {
  baseScore: number;
  freqPoints: number;
  rankPoints: number;
  popularityPoints: number;
  aiPoints: number;
  isPenaltyTriggered: boolean;
  penaltyReason?: string | null;
}

export interface NameAnalysis {
  char1: string;
  char1Stats: NameStats;
  char2: string;
  char2Stats: NameStats;
  overallScore: number;
  report: string;
  scoreBreakdown: ScoreBreakdown;
}

export interface NameSubmission {
  id?: string;
  fullName: string;
  surname: string;
  char1: string;
  char2: string;
  analysis?: NameAnalysis | null;
  votes: number;
  userWish?: string | null;
  visitorId: string;
  createdAt: any;
}
