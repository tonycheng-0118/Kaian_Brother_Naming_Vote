import { GoogleGenAI } from "@google/genai";
import { NameAnalysis, NameStats } from "../types";
import { NameRecord, ExcludeData } from "./dataService";

let genAI: any = null;

function getAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("找不到 API Key。請確保已在 Settings > Secrets 欄位中填寫 GEMINI_API_KEY。");
  }
  if (!genAI) {
    genAI = new GoogleGenAI({ apiKey });
  }
  return genAI;
}

export async function analyzeName(
  surname: string,
  char1: string,
  char2: string,
  stats1: NameStats,
  stats2: NameStats,
  contextData: NameRecord[],
  userWish: string,
  excludeData: ExcludeData
): Promise<NameAnalysis> {
  const ai = getAI();
  
  const fullName = `${char1}${char2}`;
  const fullFullName = `${surname}${char1}${char2}`;
  const isNameExcluded = excludeData.excludedNames.includes(fullName) || excludeData.excludedNames.includes(fullFullName);
  const isCharExcluded = stats1.isExcluded || stats2.isExcluded;

  const penaltyWarning = (isNameExcluded || isCharExcluded) 
    ? `\n【絕對重要警示】：此名字「${fullFullName}」或其單字已明確列入家族的「排除名單中」！請強制將總分結算至 40 分以下，將 isPenaltyTriggered 設為 true，並於 penaltyReason 標明「命中家族排除名單」。` 
    : '';

  const prompt = `你是一位專業的命名大師與語言學家。目前正在為鄭家新生兒「楷安」進行姓名點評。
請針對姓名：${surname}${char1}${char2} 進行深度分析。

數據背景：
- 首字「${char1}」：資料庫出現 ${stats1.frequency} 次，排名 ${stats1.rank}，是否流行：${stats1.isPopular}。
- 次字「${char2}」：資料庫出現 ${stats2.frequency} 次，排名 ${stats2.rank}，是否流行：${stats2.isPopular}。
- 父母期許：${userWish || "無特殊期許（請自由發揮優雅的祝福）"} ${penaltyWarning}

評分與分析指南：
1. 基礎分：從 80 分起跳。
2. 數據加權：
   - 頻率與排名：如果字在 5000 字中排名前 500 且頻率適中，各加 2-3 分。
   - 流行屬性：若為流行字且不落俗套，加 2 分。
3. 意境加成：根據父母期許與二字組合的語義、音韻、意境（由 AI 判斷），給予最後 0-5 分的專業加分 (aiPoints)。
4. 排除字與諧音警示：若命中不雅諧音（包含常見的不良台語諧音）、負面意象或極度冷僻字，或者命中了排除名單，請將總分降至 40 分以下。此時必須將 \`isPenaltyTriggered\` 設為 \`true\`，並在 \`penaltyReason\` 中具體寫出原因。

請務必回傳以下 JSON 格式（純 JSON，不含 Markdown 代號，不包含任何額外文字）：
{
  "char1": "${char1}",
  "char1Stats": ${JSON.stringify(stats1)},
  "char2": "${char2}",
  "char2Stats": ${JSON.stringify(stats2)},
  "overallScore": 99,
  "report": "一句約 100 字內的溫暖、專業點評",
  "scoreBreakdown": {
    "baseScore": 80,
    "freqPoints": 5,
    "rankPoints": 5,
    "popularityPoints": 4.5,
    "aiPoints": 4.5,
    "isPenaltyTriggered": false,
    "penaltyReason": null
  }
}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    
    const text = (response.text || "").trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as NameAnalysis;
    }
    return JSON.parse(text) as NameAnalysis;
  } catch (error) {
    console.error("Gemini analysis failed:", error);
    throw error;
  }
}
