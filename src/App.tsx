/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { 
  Heart, 
  Search, 
  Sparkles, 
  CheckCircle2, 
  XCircle, 
  TrendingUp, 
  Award,
  BookOpen,
  Share2,
  Trash2,
  ThumbsUp,
  ThumbsDown,
  Loader2,
  Baby,
  AlertTriangle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  doc, 
  updateDoc, 
  deleteDoc,
  increment,
  serverTimestamp 
} from "firebase/firestore";
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  User 
} from "firebase/auth";
import { fetchNameData, findCharStats, NameRecord, ExcludeData } from "./services/dataService";
import { analyzeName } from "./services/geminiService";
import { NameAnalysis, NameSubmission } from "./types";
import { cn } from "./lib/utils";
import { auth, db } from "./lib/firebase";

export default function App() {
  const [surname, setSurname] = useState("鄭");
  const [char1, setChar1] = useState("");
  const [char2, setChar2] = useState("");
  const [userWish, setUserWish] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<NameAnalysis | null>(null);
  const [submissions, setSubmissions] = useState<NameSubmission[]>([]);
  const [showBoard, setShowBoard] = useState(true);
  const [cachedData, setCachedData] = useState<NameRecord[]>([]);
  const [cachedExcludeData, setCachedExcludeData] = useState<ExcludeData>({ excludedChars: [], excludedNames: [] });
  const [user, setUser] = useState<User | null>(null);
  const [visitorId, setVisitorId] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isAdminModeRequested, setIsAdminModeRequested] = useState(false);
  const [secretClickCount, setSecretClickCount] = useState(0);

  const handleSecretClick = () => {
    setSecretClickCount(prev => {
      const next = prev + 1;
      if (next >= 3) {
        setIsAdminModeRequested(true);
      }
      return next;
    });
  };
  
  const isComposing1 = useRef(false);
  const isComposing2 = useRef(false);

  // Initialize Visitor ID (like a cookie) & Admin Mode check
  useEffect(() => {
    // Visitor ID
    let vid = localStorage.getItem('visitor_id');
    if (!vid) {
      vid = 'v_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('visitor_id', vid);
    }
    setVisitorId(vid);

    // Admin Mode check via URL
    const params = new URLSearchParams(window.location.search);
    if (params.get('admin') === 'true') {
      setIsAdminModeRequested(true);
    }
  }, []);

  // Authentication observer
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const isAdmin = user?.email?.toLowerCase() === 'chingjucheng0118@gmail.com';

  // Calculate days since birth (2026/04/17 as reference date based on context)
  const calculateDaysSinceBirth = () => {
    const birthDate = new Date("2026-04-17T00:00:00+08:00"); // Assuming Taiwan time GMT+8
    const now = new Date();
    // Default to at least day 1 if time zones or exact hours make it 0.
    const diffTime = now.getTime() - birthDate.getTime();
    if (diffTime < 0) return 1; // Fallback if before
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  };
  const daysSinceBirth = calculateDaysSinceBirth();

  // Fetch names from board
  useEffect(() => {
    // We use a simple query and sort client-side to avoid needing complex composite indexes
    // for multiple orderBy calls on nested fields in the preview environment.
    const q = query(collection(db, "name_submissions"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as NameSubmission[];
      
      // Sort: votes (DESC) -> overallScore (DESC) -> createdAt (DESC)
      docs.sort((a, b) => {
        const votesA = a.votes || 0;
        const votesB = b.votes || 0;
        if (votesB !== votesA) return votesB - votesA;
        
        const scoreA = a.analysis?.overallScore || 0;
        const scoreB = b.analysis?.overallScore || 0;
        if (scoreB !== scoreA) return scoreB - scoreA;
        
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
      
      setSubmissions(docs);
    });
    return () => unsubscribe();
  }, []);

  const handleAnalyze = async () => {
    if (!surname || !char1 || !char2) return;
    setIsAnalyzing(true);
    setAnalysisResult(null);
    try {
      // 1. Fetch character data
      let currentData = cachedData;
      let currentExcludeData = cachedExcludeData;
      if (currentData.length === 0) {
        const fetched = await fetchNameData();
        currentData = fetched.records;
        currentExcludeData = fetched.excludeData;
        setCachedData(currentData);
        setCachedExcludeData(currentExcludeData);
      }

      // 2. Find specific character stats
      const stats1 = findCharStats(currentData, char1, currentExcludeData);
      const stats2 = findCharStats(currentData, char2, currentExcludeData);

      // 3. AI analysis with real data
      const result = await analyzeName(surname, char1, char2, stats1, stats2, currentData, userWish, currentExcludeData);
      setAnalysisResult(result);
    } catch (error: any) {
      console.error("Analysis failed:", error);
      alert(`分析失敗：${error.message || "請檢查您的 API Key 是否正確設定於 Secrets 中。"}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleRecord = async () => {
    if (!analysisResult) return;

    // Check for duplicates
    const currentFullName = `${surname}${char1}${char2}`;
    const isDuplicate = submissions.some(item => item.fullName === currentFullName);
    
    if (isDuplicate) {
      alert(`「${currentFullName}」已經存在於榜單上囉！請直接切換到榜單，幫這個名字「點讚」支持吧！`);
      setShowBoard(true);
      return;
    }

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, "name_submissions"), {
        fullName: `${surname}${char1}${char2}`,
        surname,
        char1,
        char2,
        analysis: analysisResult,
        votes: 0,
        userWish: userWish.trim() || null,
        visitorId: visitorId,
        createdAt: serverTimestamp()
      });
      alert("已成功加入名錄！");
      setChar1("");
      setChar2("");
      setUserWish("");
      setAnalysisResult(null);
      setShowBoard(true);
    } catch (error) {
      console.error("Submission failed:", error);
      alert("提交失敗，請稍後再試。");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVote = async (id: string, currentVotes: number, direction: 'up' | 'down') => {
    // Check bounds locally first
    if (direction === 'up' && currentVotes >= 99) return;
    if (direction === 'down' && currentVotes <= 0) return;

    // Spam protection: 1 hour cooldown per name
    const voteKey = `last_vote_${id}`;
    const lastVote = localStorage.getItem(voteKey);
    const now = Date.now();
    const COOLDOWN = 60 * 60 * 1000; // 1 hour

    if (lastVote && (now - parseInt(lastVote)) < COOLDOWN) {
      alert("投票太頻繁了，請稍後再試。");
      return;
    }

    try {
      await updateDoc(doc(db, "name_submissions", id), {
        votes: increment(direction === 'up' ? 1 : -1)
      });
      localStorage.setItem(voteKey, now.toString());
    } catch (error) {
      console.error("Voting failed:", error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, "name_submissions", id));
      setDeletingId(null);
    } catch (error: any) {
      console.error("Deletion failed:", error);
      alert(`刪除失敗：${error.code || error.message || '原因未知'}`);
    }
  };

  const exportToCSV = () => {
    if (submissions.length === 0) return;

    // Headers
    const headers = [
      "姓名", "姓氏", "名1", "名2", "使用者的願望", "Votes", "Visitor ID (Cookie)", "加入時間"
    ];

    // Data rows
    const rows = submissions.map(item => [
      item.fullName,
      item.surname,
      item.char1,
      item.char2,
      `"${(item.userWish || '').replace(/"/g, '""')}"`,
      item.votes || 0,
      item.visitorId || 'legacy',
      item.createdAt?.toDate ? item.createdAt.toDate().toLocaleString() : ''
    ]);

    const csvContent = "\uFEFF" + [
      headers.join(","),
      ...rows.map(e => e.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `萌名錄匯出_${new Date().toLocaleDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-natural-bg text-natural-dark font-sans selection:bg-natural-primary/20 pb-20">
      {/* Header */}
      <header className="relative text-center py-8 md:py-10 px-4">
        <div 
          onClick={handleSecretClick}
          className="text-2xl md:text-3xl font-bold tracking-[2px] text-natural-primary mb-3 md:mb-4 text-balance leading-snug cursor-pointer select-none"
        >
          楷安弟弟名字投票所 ✨
        </div>
        <p className="text-sm md:text-base text-natural-dark font-medium italic mb-2 px-2 md:px-0">
          「大家好，我是楷安的弟弟，今天是出生第 <span className="font-bold text-natural-primary text-lg">{daysSinceBirth}</span> 天，歡迎大家來投票你心中的喜歡名字喔!!」
        </p>
        <p className="text-xs md:text-sm text-natural-light/80 font-medium mb-4 px-2 md:px-0">
          只要是喜歡的名字都可以按讚，隔一小時後可以再重複讚喔！
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3 md:absolute md:top-4 md:right-4">
          {(user || isAdminModeRequested) && (
            <>
              {isAdmin && (
                <>
                  <button 
                    onClick={() => setShowBoard(!showBoard)}
                    className="px-3 py-1.5 bg-natural-primary/10 text-natural-primary rounded-lg border border-natural-primary/20 text-[12px] font-medium flex items-center gap-[4px] hover:bg-natural-primary hover:text-white transition-all whitespace-nowrap"
                  >
                    <Sparkles size={14} /> {showBoard ? "開啟取名模式" : "返回萌名榜單"}
                  </button>
                  <button 
                    onClick={exportToCSV}
                    className="px-3 py-1.5 bg-natural-success/10 text-natural-success rounded-lg border border-natural-success/20 text-[12px] font-medium flex items-center gap-1.5 hover:bg-natural-success hover:text-white transition-all whitespace-nowrap"
                  >
                    <Share2 size={14} /> 匯出 CSV
                  </button>
                </>
              )}
              {user ? (
                <div className="flex items-center gap-2">
                  <img src={user.photoURL || ''} alt="" className="w-8 h-8 rounded-full border border-natural-border" referrerPolicy="no-referrer" />
                  <button onClick={handleLogout} className="text-[12px] text-natural-light hover:text-natural-primary transition-colors">登出</button>
                </div>
              ) : (
                <button onClick={handleLogin} className="text-[12px] text-natural-light hover:text-natural-primary transition-colors flex items-center gap-1">
                  <Loader2 size={12} /> 管理員登入
                </button>
              )}
            </>
          )}
        </div>
      </header>

      <main className="max-w-[940px] mx-auto px-4 md:px-6 grid md:grid-cols-[320px_1fr] gap-5 md:gap-6 items-start">
        {/* Left column: Photo and Input Nav */}
        <div className="space-y-4 md:space-y-6">
          <section className="bg-natural-card rounded-[24px] p-5 md:p-6 shadow-natural border border-natural-border relative overflow-hidden">
            {/* Edge-to-edge baby photo inside the form card */}
            <div className={`-mx-5 -mt-5 md:-mx-6 md:-mt-6 ${(!showBoard && isAdmin) ? 'mb-2' : '-mb-5 md:-mb-6'} aspect-square sm:aspect-[4/3] md:aspect-square bg-natural-secondary/30 relative`}>
              <img 
                src="https://raw.githubusercontent.com/tonycheng-0118/Kaian_Brother_Naming_Vote/main/IMG_0132.jpg" 
                alt="可愛的楷安弟弟" 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-transparent" />
            </div>

            {(!showBoard && isAdmin) && (
              <div className="space-y-5 md:space-y-6 mt-6 relative z-10">
                <div className="space-y-3">
              <label className="block text-[13px] font-semibold text-natural-light pl-1">請輸入新生兒姓名</label>
              <div className="flex justify-center sm:justify-start gap-3">
                <div className="w-12 h-12 md:w-14 md:h-14 shrink-0 flex items-center justify-center bg-natural-primary/10 border-2 border-natural-primary/20 rounded-xl text-xl md:text-2xl text-natural-primary font-black shadow-inner shadow-natural-primary/5">
                  {surname}
                </div>
                <div className="flex gap-3">
                  <input 
                    value={char1}
                    onCompositionStart={() => isComposing1.current = true}
                    onCompositionEnd={(e) => {
                      isComposing1.current = false;
                      const val = e.currentTarget.value;
                      setChar1(val.slice(-1));
                    }}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!isComposing1.current) {
                        setChar1(val.slice(-1));
                      } else {
                        setChar1(val);
                      }
                    }}
                    onBlur={() => setChar1(prev => prev.slice(-1))}
                    maxLength={5}
                    placeholder=""
                    className="w-12 h-12 md:w-14 md:h-14 p-0 border-2 border-natural-border rounded-xl text-xl md:text-2xl text-natural-dark font-bold focus:outline-none focus:border-natural-primary transition-colors text-center bg-gray-50/30 shadow-inner"
                  />
                  <input 
                    value={char2}
                    onCompositionStart={() => isComposing2.current = true}
                    onCompositionEnd={(e) => {
                      isComposing2.current = false;
                      const val = e.currentTarget.value;
                      setChar2(val.slice(-1));
                    }}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!isComposing2.current) {
                        setChar2(val.slice(-1));
                      } else {
                        setChar2(val);
                      }
                    }}
                    onBlur={() => setChar2(prev => prev.slice(-1))}
                    maxLength={5}
                    placeholder=""
                    className="w-12 h-12 md:w-14 md:h-14 p-0 border-2 border-natural-border rounded-xl text-xl md:text-2xl text-natural-dark font-bold focus:outline-none focus:border-natural-primary transition-colors text-center bg-gray-50/30 shadow-inner"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-[13px] font-semibold text-natural-light pl-1">對名字的期望與想法 (選填)</label>
              <textarea 
                value={userWish}
                onChange={(e) => setUserWish(e.target.value)}
                placeholder="例如：希望孩子能平安喜樂、溫暖待人..."
                className="w-full p-3 border-2 border-natural-border rounded-xl text-base md:text-sm text-natural-dark focus:outline-none focus:border-natural-primary transition-colors bg-gray-50/30 min-h-[80px] md:min-h-[100px] resize-none"
              />
            </div>

              <button 
                onClick={handleAnalyze}
                disabled={isAnalyzing || !surname || !char1 || !char2}
                className="w-full py-3.5 bg-natural-primary text-white border-none rounded-xl text-base font-semibold cursor-pointer shadow-[0_4px_15px_rgba(255,183,161,0.3)] hover:opacity-90 transition-opacity disabled:bg-gray-200 disabled:shadow-none flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                {isAnalyzing ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
                {isAnalyzing ? "正在深度分析中..." : "開始深度評分報告"}
              </button>

              <div className="pt-5 border-t border-natural-border text-center">
                <p className="text-[12px] leading-relaxed text-natural-light">
                  系統將針對名中的「{char1 || "○"}」與「{char2 || "○"}」<br/>進行資料庫統計與美感分析。
                </p>
              </div>
            </div>
            )}
          </section>
        </div>

        {/* Right column: Results or Board */}
        <div className="min-h-[400px] w-full">
          <AnimatePresence mode="wait">
            {!showBoard && !analysisResult ? (
              <motion.div 
                key="intro-section"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="space-y-6"
              >
                <div className="bg-white/60 backdrop-blur-sm rounded-[24px] md:rounded-[32px] p-6 md:p-8 border border-natural-border space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-base md:text-lg font-bold text-natural-dark flex items-center gap-2">
                      <Baby size={24} className="text-natural-primary" />
                      歡迎來到楷安弟弟的取名派對！
                    </h3>
                    <p className="text-[14px] leading-relaxed text-natural-light">
                      鄭家的二寶「楷安」要徵求好聽、獨特、又有意義的名字。
                      不需要繁瑣的帳號，只要您有想法，歡迎隨時在左側填寫並展開深度分析。
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-4 bg-natural-secondary/30 rounded-2xl">
                        <div className="text-natural-primary font-bold mb-1 text-[13px]">數據評分</div>
                        <div className="text-[12px] text-natural-light">比對常用字庫與熱度</div>
                      </div>
                      <div className="p-4 bg-natural-success/10 rounded-2xl">
                        <div className="text-natural-success font-bold mb-1 text-[13px]">全民票選</div>
                        <div className="text-[12px] text-natural-light">覺得名字好聽就按個讚</div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : analysisResult ? (
              <motion.div 
                key="analysis"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                {/* Score Header */}
                <div className="bg-natural-primary rounded-[32px] p-8 text-white relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl" />
                  <div className="relative">
                    <div className="text-[12px] font-bold uppercase tracking-[2px] opacity-80 mb-1 md:mb-2">系統大師評分</div>
                    <div className="flex items-end gap-2 md:gap-3">
                      <div className="text-6xl md:text-7xl font-black leading-none">{analysisResult.overallScore}</div>
                      <div className="text-lg md:text-xl font-bold mb-1 md:mb-2 opacity-80">/ 100</div>
                    </div>
                    
                    <div className="mt-4 md:mt-6 flex items-center gap-2 text-sm md:text-base">
                       {analysisResult.overallScore >= 90 ? (
                         <>
                           <Award size={20} className="text-yellow-300" />
                           <span className="font-bold">卓越之作！極力推薦</span>
                         </>
                       ) : analysisResult.overallScore >= 80 ? (
                         <>
                           <TrendingUp size={20} />
                           <span className="font-bold">優質組合，聽起來非常悅耳</span>
                         </>
                       ) : (
                         <>
                           <Search size={20} />
                           <span className="font-bold">中規中矩，您可以再考慮看看</span>
                         </>
                       )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5">
                  <div className="bg-natural-card rounded-[20px] p-5 md:p-6 shadow-natural border border-natural-border relative group hover:border-natural-primary transition-colors">
                    <span className="absolute top-5 right-5 bg-[#FFF0EB] text-natural-primary px-2.5 py-1 rounded-full text-[11px] font-semibold">首字核心</span>
                    <div className="text-5xl md:text-[64px] font-bold text-natural-dark leading-none mb-4">{analysisResult.char1}</div>
                    <div className="space-y-1.5 md:space-y-2">
                       <div className="flex justify-between border-bottom border-dashed border-natural-border pb-1.5 last:border-0 last:pb-0">
                          <span className="text-[12px] text-natural-light">資料庫熱度</span>
                          <span className="text-[13px] font-semibold">{analysisResult.char1Stats.frequency} 次</span>
                       </div>
                       <div className="flex justify-between border-bottom border-dashed border-natural-border pb-1.5 last:border-0 last:pb-0">
                          <span className="text-[12px] text-natural-light">排名狀態</span>
                          <span className="text-[13px] font-semibold">{analysisResult.char1Stats.rank > 0 ? `第 ${analysisResult.char1Stats.rank} 名` : "罕見"}</span>
                       </div>
                    </div>
                  </div>

                  <div className="bg-natural-card rounded-[20px] p-5 md:p-6 shadow-natural border border-natural-border relative group hover:border-natural-primary transition-colors">
                    <span className="absolute top-5 right-5 bg-blue-50 text-blue-400 px-2.5 py-1 rounded-full text-[11px] font-semibold">次字靈性</span>
                    <div className="text-5xl md:text-[64px] font-bold text-natural-dark leading-none mb-4">{analysisResult.char2}</div>
                    <div className="space-y-1.5 md:space-y-2">
                       <div className="flex justify-between border-bottom border-dashed border-natural-border pb-1.5 last:border-0 last:pb-0">
                          <span className="text-[12px] text-natural-light">資料庫熱度</span>
                          <span className="text-[13px] font-semibold">{analysisResult.char2Stats.frequency} 次</span>
                       </div>
                       <div className="flex justify-between border-bottom border-dashed border-natural-border pb-1.5 last:border-0 last:pb-0">
                          <span className="text-[12px] text-natural-light">排名狀態</span>
                          <span className="text-[13px] font-semibold">{analysisResult.char2Stats.rank > 0 ? `第 ${analysisResult.char2Stats.rank} 名` : "罕見"}</span>
                       </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-[20px] p-5 border border-natural-border text-center space-y-4">
                  {analysisResult.scoreBreakdown.isPenaltyTriggered && (
                    <div className="bg-red-50 border border-red-200/50 p-4 rounded-xl text-left flex gap-3 shadow-sm items-start">
                      <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={20} />
                      <div className="space-y-1">
                        <h4 className="text-red-800 font-bold text-[14px]">命名警示 (不雅諧音或負面意象)</h4>
                        <p className="text-red-700/90 text-[13px] leading-relaxed">
                          {analysisResult.scoreBreakdown.penaltyReason || "該名字組合經分析可能帶有不雅諧音或有較差的意象，請謹慎考慮。"}
                        </p>
                      </div>
                    </div>
                  )}
                  
                  <p className="text-[14px] font-semibold text-natural-dark italic">「{analysisResult.report}」</p>
                  
                  {/* Score Breakdown visualization */}
                  <div className="bg-natural-bg/30 rounded-xl p-4 text-left space-y-2">
                    <div className="text-[11px] font-bold text-natural-light uppercase tracking-wider mb-2">評分組成詳解</div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center group">
                        <span className="text-[12px] text-natural-light">基礎底分</span>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full bg-natural-primary" style={{ width: `${(analysisResult.scoreBreakdown.baseScore / 99) * 100}%` }} />
                          </div>
                          <span className="text-[11px] font-bold w-6 text-right">{analysisResult.scoreBreakdown.baseScore}</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[12px] text-natural-light">字頻與熱度</span>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full bg-natural-success" style={{ width: `${(analysisResult.scoreBreakdown.freqPoints / 10) * 100}%` }} />
                          </div>
                          <span className="text-[11px] font-bold min-w-6 text-right">+{analysisResult.scoreBreakdown.freqPoints}</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[12px] text-natural-light">流行與排名</span>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-400" style={{ width: `${(analysisResult.scoreBreakdown.popularityPoints / 10) * 100}%` }} />
                          </div>
                          <span className="text-[11px] font-bold min-w-6 text-right">+{analysisResult.scoreBreakdown.popularityPoints}</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[12px] text-natural-light">AI 意境加成</span>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full bg-purple-400" style={{ width: `${(analysisResult.scoreBreakdown.aiPoints / 5) * 100}%` }} />
                          </div>
                          <span className="text-[11px] font-bold min-w-6 text-right">+{analysisResult.scoreBreakdown.aiPoints}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                    <button 
                      onClick={() => setAnalysisResult(null)}
                      className="w-full sm:w-auto px-6 py-3 sm:py-2.5 rounded-full text-[15px] sm:text-[14px] font-semibold border-2 sm:border border-natural-primary text-natural-primary hover:bg-natural-primary/5 transition-colors active:bg-natural-primary/10"
                    >
                      重新輸入
                    </button>
                    <button 
                      onClick={handleRecord}
                      disabled={isSubmitting}
                      className="w-full sm:w-auto px-6 py-3 sm:py-2.5 rounded-full text-[15px] sm:text-[14px] font-semibold bg-natural-primary text-white shadow-[0_4px_15px_rgba(255,183,161,0.3)] hover:opacity-90 transition-opacity flex items-center justify-center gap-2 active:scale-[0.98]"
                    >
                      {isSubmitting && <Loader2 className="animate-spin" size={16} />}
                      確定並加入萌名榜單
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="board-section"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="space-y-4"
              >
                <div className="bg-natural-secondary rounded-2xl p-4 text-center">
                  <h3 className="font-bold text-natural-success">大家提名的萌名榜單</h3>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {submissions.map((item) => (
                    <div key={item.id} className="bg-natural-card rounded-[20px] p-4 md:p-5 shadow-natural border border-natural-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 md:gap-0">
                      <div className="space-y-0.5 md:space-y-1">
                        <div className="text-xl md:text-2xl font-bold flex items-center gap-2">
                          {item.fullName}
                          {item.analysis && (
                            <span className="text-[11px] md:text-[10px] bg-natural-bg px-2 py-0.5 rounded text-natural-light font-bold">{item.analysis.overallScore} 分</span>
                          )}
                        </div>
                        <div className="text-[13px] md:text-[12px] text-natural-light line-clamp-2 md:line-clamp-1 sm:max-w-[300px]">
                          {item.userWish ? (
                            <span className="text-natural-primary font-medium italic pr-2">「{item.userWish}」</span>
                          ) : (
                            <span className="italic opacity-60">純粹好聽建議</span>
                          )}
                        </div>
                      </div>
                      <div className="w-full sm:w-auto flex items-center justify-between sm:justify-start sm:gap-4 bg-natural-bg/50 px-3 sm:px-4 py-2 rounded-xl sm:rounded-full border border-natural-border">
                        {isAdmin && (
                          <div className="flex items-center shrink-0">
                            {deletingId === item.id ? (
                              <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-right-2 duration-200">
                                <button 
                                  onClick={() => handleDelete(item.id!)}
                                  className="text-[11px] font-bold bg-red-500 text-white px-2 py-1 rounded-md hover:bg-red-600 transition-colors"
                                >
                                  確定刪除
                                </button>
                                <button 
                                  onClick={() => setDeletingId(null)}
                                  className="text-[11px] font-bold text-natural-light hover:text-natural-dark"
                                >
                                  取消
                                </button>
                              </div>
                            ) : (
                              <button 
                                onClick={() => setDeletingId(item.id!)}
                                className="text-gray-300 hover:text-red-500 transition-colors p-1"
                                title="管理員刪除"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                            <div className="w-[1px] h-4 bg-natural-border mx-2" />
                          </div>
                        )}
                        <button 
                          onClick={() => handleVote(item.id!, item.votes || 0, 'down')}
                          className={`transition-colors active:scale-125 ${(item.votes || 0) <= 0 ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400 hover:text-red-400'}`}
                          title="不贊"
                          disabled={(item.votes || 0) <= 0}
                        >
                          <ThumbsDown size={18} />
                        </button>
                        <div className="flex flex-col items-center min-w-[30px]">
                          <span className="text-[14px] font-black text-natural-primary leading-none">{item.votes || 0}</span>
                          <span className="text-[8px] text-natural-light font-bold uppercase tracking-tight mt-0.5">Votes</span>
                        </div>
                        <button 
                          onClick={() => handleVote(item.id!, item.votes || 0, 'up')}
                          className={`transition-colors active:scale-125 ${(item.votes || 0) >= 99 ? 'text-gray-200 cursor-not-allowed' : 'text-natural-primary hover:text-natural-success'}`}
                          title="點讚"
                          disabled={(item.votes || 0) >= 99}
                        >
                          <ThumbsUp size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Version Series */}
      <footer className="text-center pt-8 pb-4 mt-8 text-[11px] font-mono text-natural-light/40 tracking-wider">
        Ver. 20260419.11
      </footer>
    </div>
  );
}
