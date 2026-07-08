const axios = require('axios');
const fs = require('fs');
const path = require('path');
const http = require('http');

// ============================================================
// 🟢 PHẦN 1: GIỮ NGUYÊN TOÀN BỘ CẤU HÌNH & BIẾN TỪ FILE GỐC
// ============================================================
const API_URL = "https://apisunlon.onrender.com/sun";
const DATA_FILE = "collected_data/sunwin_tx.json";
const STATS_FILE = "database/stats.json";

const MIN_DATA_FOR_PREDICTION = 10;
const MAX_PREDICTIONS = 100000;
const MAX_STORAGE = 1000000;

const vnNow = () => {
    const d = new Date();
    return new Date(d.getTime() + (7 * 60 * 60 * 1000)).toISOString();
};

let stats = {
    total: 0, correct: 0, wrong: 0,
    last_prediction: null,
    start_time: vnNow(),
    history: [],
    total_predictions_made: 0,
    prediction_started: false
};

let duDoanHienTai = {
    phien: 0,
    ket_qua: "CHƯA CÓ DỮ LIỆU",
    do_tin_cay: 0,
    loai_cau: "ĐANG KHỞI ĐỘNG",
    ly_do: "Đang thu thập dữ liệu, vui lòng chờ...",
    che_do: "BINH_THUONG",
    co_khuon: false,
    ten_khuon: "",
    thong_ke: { tong: 0, dung: 0, sai: 0, ty_le: "0.0" },
    cap_nhat_luc: vnNow()
};

// ============================================================
// 🔵 ⬇️ ĐÂY LÀ TOÀN BỘ CODE TỪ FILE thuật toán .txt ĐƯỢC CHÈN ĐẦY ĐỦ 100%
//    KHÔNG BỊ SỬA / XÓA / THAY ĐỔI GÌ HẾT CHỈ ĐƯỢC DI CHUYỂN VÀO ĐÂY
// ============================================================

// ==================== CẤU HÌNH MẶC ĐỊNH ====================
const DEFAULT_PATTERN_WEIGHTS = {
  'cau_bet': 1.3,
  'cau_dao_11': 1.2,
  'cau_22': 1.15,
  'cau_33': 1.2,
  'cau_121': 1.1,
  'cau_123': 1.1,
  'cau_321': 1.1,
  'cau_nhay_coc': 1.0,
  'cau_nhip_nghieng': 1.15,
  'cau_3van1': 1.2,
  'cau_be_cau': 1.25,
  'cau_chu_ky': 1.1,
  'distribution': 0.9,
  'dice_pattern': 1.0,
  'sum_trend': 1.05,
  'edge_cases': 1.1,
  'momentum': 1.15,
  'cau_tu_nhien': 0.8,
  'dice_trend_line': 1.2,
  'break_pattern': 1.3,
  'fibonacci': 1.0,
  'resistance_support': 1.15,
  'wave': 1.1,
  'golden_ratio': 1.0,
  'day_gay': 1.25,
  'cau_44': 1.2,
  'cau_55': 1.25,
  'cau_212': 1.1,
  'cau_1221': 1.15,
  'cau_2112': 1.15,
  'cau_gap': 1.1,
  'cau_ziczac': 1.2,
  'cau_doi': 1.15,
  'cau_rong': 1.3,
  'smart_bet': 1.2,
  'markov_chain': 1.35,
  'moving_avg_drift': 1.2,
  'sum_pressure': 1.25,
  'volatility': 1.15,
  'sun_hot_cold': 1.3,
  'sun_streak_break': 1.35,
  'sun_balance': 1.2,
  'sun_momentum_shift': 1.25
};
const REVERSAL_THRESHOLD = 3;
let learningData = {
  b52: {
    predictions: [],
    patternStats: {},
    totalPredictions: 0,
    correctPredictions: 0,
    patternWeights: {},
    lastUpdate: null,
    streakAnalysis: { wins: 0, losses: 0, currentStreak: 0, bestStreak: 0, worstStreak: 0 },
    adaptiveThresholds: {},
    recentAccuracy: [],
    reversalState: {
      active: false,
      activatedAt: null,
      consecutiveLosses: 0,
      reversalCount: 0,
      lastReversalResult: null
    },
    transitionMatrix: {
      'Tài->Tài': 0, 'Tài->Xỉu': 0,
      'Xỉu->Tài': 0, 'Xỉu->Xỉu': 0
    }
  }
};

// ==================== HÀM TRỢ GIÚP CƠ BẢN ====================
function getPatternIdFromName(name) {
  const mapping = {
    'Cầu Bệt': 'cau_bet', 'Cầu Đảo 1-1': 'cau_dao_11', 'Cầu 2-2': 'cau_22',
    'Cầu 3-3': 'cau_33', 'Cầu 4-4': 'cau_44', 'Cầu 5-5': 'cau_55',
    'Cầu 1-2-1': 'cau_121', 'Cầu 1-2-3': 'cau_123', 'Cầu 3-2-1': 'cau_321',
    'Cầu 2-1-2': 'cau_212', 'Cầu 1-2-2-1': 'cau_1221', 'Cầu 2-1-1-2': 'cau_2112',
    'Cầu Nhảy Cóc': 'cau_nhay_coc', 'Cầu Nhịp Nghiêng': 'cau_nhip_nghieng',
    'Cầu 3 Ván 1': 'cau_3van1', 'Cầu Bẻ Cầu': 'cau_be_cau', 'Cầu Chu Kỳ': 'cau_chu_ky',
    'Cầu Gấp': 'cau_gap', 'Cầu Ziczac': 'cau_ziczac', 'Cầu Đôi': 'cau_doi',
    'Cầu Rồng': 'cau_rong', 'Đảo Xu Hướng': 'smart_bet', 'Xu Hướng Cực': 'smart_bet',
    'Phân bố': 'distribution', 'Tổng TB': 'dice_pattern', 'Xu hướng': 'sum_trend',
    'Cực Điểm': 'edge_cases', 'Biến động': 'momentum', 'Cầu Tự Nhiên': 'cau_tu_nhien',
    'Biểu Đồ Đường': 'dice_trend_line', 'Cầu Liên Tục': 'break_pattern', 'Dây Gãy': 'day_gay'
  };
  for (const [key, value] of Object.entries(mapping)) {
    if (name.includes(key)) return value;
  }
  return null;
}
function initializePatternStats(type) {
  if (!learningData[type].patternWeights || Object.keys(learningData[type].patternWeights).length === 0) {
    learningData[type].patternWeights = { ...DEFAULT_PATTERN_WEIGHTS };
  }
  Object.keys(DEFAULT_PATTERN_WEIGHTS).forEach(pattern => {
    if (!learningData[type].patternStats[pattern]) {
      learningData[type].patternStats[pattern] = {
        total: 0, correct: 0, accuracy: 0.5,
        recentResults: [], lastAdjustment: null
      };
    }
  });
}
function getPatternWeight(type, patternId) {
  initializePatternStats(type);
  return learningData[type].patternWeights[patternId] || 1.0;
}
function updatePatternPerformance(type, patternId, isCorrect) {
  initializePatternStats(type);
  const stats = learningData[type].patternStats[patternId];
  if (!stats) return;
  stats.total++;
  if (isCorrect) stats.correct++;
  stats.recentResults.push(isCorrect ? 1 : 0);
  if (stats.recentResults.length > 20) stats.recentResults.shift();
  const recentAccuracy = stats.recentResults.reduce((a, b) => a + b, 0) / stats.recentResults.length;
  stats.accuracy = stats.total > 0 ? stats.correct / stats.total : 0.5;
  const oldWeight = learningData[type].patternWeights[patternId];
  let newWeight = oldWeight;
  if (stats.recentResults.length >= 5) {
    if (recentAccuracy > 0.6) newWeight = Math.min(2.0, oldWeight * 1.05);
    else if (recentAccuracy < 0.4) newWeight = Math.max(0.3, oldWeight * 0.95);
  }
  learningData[type].patternWeights[patternId] = newWeight;
  stats.lastAdjustment = new Date().toISOString();
}
function getAdaptiveConfidenceBoost(type) {
  const recentAcc = learningData[type].recentAccuracy;
  if (recentAcc.length < 10) return 0;
  const accuracy = recentAcc.reduce((a, b) => a + b, 0) / recentAcc.length;
  if (accuracy > 0.65) return 5;
  if (accuracy > 0.55) return 2;
  if (accuracy < 0.4) return -5;
  if (accuracy < 0.45) return -2;
  return 0;
}
function getSmartPredictionAdjustment(type, prediction, patterns) {
  const streakInfo = learningData[type].streakAnalysis;
  if (streakInfo.currentStreak <= -5) {
    return prediction === 'Tài' ? 'Xỉu' : 'Tài';
  }
  let taiPatternScore = 0, xiuPatternScore = 0;
  patterns.forEach(p => {
    const patternId = getPatternIdFromName(p.name || p);
    if (patternId) {
      const stats = learningData[type].patternStats[patternId];
      if (stats && stats.recentResults.length >= 5) {
        const recentAcc = stats.recentResults.reduce((a, b) => a + b, 0) / stats.recentResults.length;
        const weight = learningData[type].patternWeights[patternId] || 1;
        if (p.prediction === 'Tài') taiPatternScore += recentAcc * weight;
        else xiuPatternScore += recentAcc * weight;
      }
    }
  });
  if (Math.abs(taiPatternScore - xiuPatternScore) > 0.5) {
    return taiPatternScore > xiuPatternScore ? 'Tài' : 'Xỉu';
  }
  return prediction;
}
function normalizeResult(result) {
  if (result === 'Tài' || result === 'tài') return 'tai';
  if (result === 'Xỉu' || result === 'xỉu') return 'xiu';
  return result.toLowerCase();
}
function applyAutoReversal(type, prediction) {
  const reversalState = learningData[type].reversalState;
  const streakAnalysis = learningData[type].streakAnalysis;
  if (!reversalState) {
    learningData[type].reversalState = { active:false, activatedAt:null, consecutiveLosses:0, reversalCount:0, lastReversalResult:null };
    return { prediction, reversed: false };
  }
  if (streakAnalysis.currentStreak <= -REVERSAL_THRESHOLD && !reversalState.active) {
    reversalState.active = true;
    reversalState.activatedAt = new Date().toISOString();
    reversalState.reversalCount++;
  }
  if (reversalState.active) {
    return { prediction: prediction === 'Tài' ? 'Xỉu' : 'Tài', reversed: true, originalPrediction: prediction };
  }
  return { prediction, reversed: false };
}
function updateReversalState(type, isCorrect) {
  const reversalState = learningData[type].reversalState;
  if (!reversalState) return;
  if (isCorrect && reversalState.active) {
    reversalState.active = false;
    reversalState.lastReversalResult = 'success';
    reversalState.consecutiveLosses = 0;
  }
  if (!isCorrect) reversalState.consecutiveLosses++;
  else reversalState.consecutiveLosses = 0;
}

// ==================== NHÓM THUẬT TOÁN NHẬN DIỆN CẦU ====================
function analyzeCauBet(results, type) {
  if (results.length < 3) return { detected: false };
  let streakType = results[0], streakLength = 1;
  for (let i = 1; i < results.length; i++) {
    if (results[i] === streakType) streakLength++; else break;
  }
  if (streakLength >= 3) {
    const weight = getPatternWeight(type, 'cau_bet');
    const stats = learningData[type].patternStats['cau_bet'];
    let shouldBreak = streakLength >= 6;
    if (stats && stats.recentResults.length >= 5) {
      const recentAcc = stats.recentResults.reduce((a,b)=>a+b,0)/stats.recentResults.length;
      if (recentAcc < 0.4) shouldBreak = !shouldBreak;
    }
    return { detected:true, type:streakType, length:streakLength,
      prediction: shouldBreak ? (streakType==='Tài'?'Xỉu':'Tài') : streakType,
      confidence: Math.round((shouldBreak?Math.min(12,streakLength*2):Math.min(15,streakLength*3))*weight),
      name:`Cầu Bệt ${streakLength} phiên`, patternId:'cau_bet' };
  }
  return { detected:false };
}
function analyzeCauDao11(results, type) {
  if (results.length < 4) return { detected:false };
  let alternatingLength = 1;
  for (let i=1;i<Math.min(results.length,10);i++) {
    if (results[i] !== results[i-1]) alternatingLength++; else break;
  }
  if (alternatingLength >= 4) {
    const weight = getPatternWeight(type,'cau_dao_11');
    return { detected:true, length:alternatingLength,
      prediction: results[0]==='Tài'?'Xỉu':'Tài',
      confidence: Math.round(Math.min(14,alternatingLength*2+4)*weight),
      name:`Cầu Đảo 1‑1 (${alternatingLength} phiên)`, patternId:'cau_dao_11' };
  }
  return { detected:false };
}
function analyzeCau22(results, type) {
  if (results.length < 6) return { detected:false };
  let pairCount=0, i=0, pattern=[];
  while (i < results.length-1 && pairCount<4) {
    if (results[i]===results[i+1]) { pattern.push(results[i]); pairCount++; i+=2; }
    else break;
  }
  if (pairCount >= 2) {
    let isAlt = true;
    for (let j=1;j<pattern.length;j++) if (pattern[j]===pattern[j-1]) { isAlt=false; break; }
    if (isAlt) {
      const last = pattern[pattern.length-1], w=getPatternWeight(type,'cau_22');
      return { detected:true, pairCount, prediction:last==='Tài'?'Xỉu':'Tài',
        confidence:Math.round(Math.min(12,pairCount*3+3)*w),
        name:`Cầu 2‑2 (${pairCount} cặp)`, patternId:'cau_22' };
    }
  }
  return { detected:false };
}
function analyzeCau33(results, type) {
  if (results.length<6) return { detected:false };
  let tripleCount=0,i=0,pattern=[];
  while(i<results.length-2){
    if(results[i]===results[i+1]&&results[i+1]===results[i+2]){pattern.push(results[i]);tripleCount++;i+=3;}
    else break;
  }
  if(tripleCount>=1){
    const pos=results.length%3, last=pattern[pattern.length-1],w=getPatternWeight(type,'cau_33');
    return { detected:true,tripleCount,
      prediction: pos===0?(last==='Tài'?'Xỉu':'Tài'):last,
      confidence:Math.round(Math.min(13,tripleCount*4+5)*w),
      name:`Cầu 3‑3 (${tripleCount} bộ ba)`, patternId:'cau_33' };
  }
  return { detected:false };
}
function analyzeCau121(results, type) {
  if(results.length<4) return { detected:false };
  const p=results.slice(0,4),w=getPatternWeight(type,'cau_121');
  if(p[0]!==p[1]&&p[1]===p[2]&&p[2]!==p[3]&&p[0]===p[3])
    return { detected:true, prediction:p[0], confidence:Math.round(10*w), name:'Cầu 1‑2‑1', patternId:'cau_121' };
  return { detected:false };
}
function analyzeCau123(results, type) {
  if(results.length<6) return { detected:false };
  const first=results[5],n2=results.slice(3,5),l3=results.slice(0,3);
  if(n2[0]===n2[1]&&n2[0]!==first&&l3.every(r=>r===l3[0])&&l3[0]!==n2[0]){
    const w=getPatternWeight(type,'cau_123');
    return { detected:true,prediction:first,confidence:Math.round(11*w),name:'Cầu 1‑2‑3',patternId:'cau_123' };
  }
  return { detected:false };
}
function analyzeCau321(results, type) {
  if(results.length<6) return { detected:false };
  const f3=results.slice(3,6),n2=results.slice(1,3),l1=results[0];
  if(f3.every(r=>r===f3[0])&&n2.every(r=>r===n2[0])&&f3[0]!==n2[0]&&l1!==n2[0]){
    const w=getPatternWeight(type,'cau_321');
    return { detected:true,prediction:n2[0],confidence:Math.round(12*w),name:'Cầu 3‑2‑1',patternId:'cau_321' };
  }
  return { detected:false };
}
function analyzeCauNhayCoc(results, type) {
  if(results.length<6) return { detected:false };
  const sp=[];
  for(let i=0;i<Math.min(results.length,12);i+=2) sp.push(results[i]);
  if(sp.length>=3){
    const w=getPatternWeight(type,'cau_nhay_coc');
    if(sp.slice(0,3).every(r=>r===sp[0]))
      return { detected:true,prediction:sp[0],confidence:Math.round(8*w),name:'Cầu Nhảy Cóc',patternId:'cau_nhay_coc' };
    let alt=true;
    for(let i=1;i<sp.length-1;i++) if(sp[i]===sp[i-1]){alt=false;break;}
    if(alt) return { detected:true,prediction:sp[0]==='Tài'?'Xỉu':'Tài',confidence:Math.round(7*w),name:'Cầu Nhảy Cóc Đảo',patternId:'cau_nhay_coc' };
  }
  return { detected:false };
}
function analyzeCauNhipNghieng(results, type) {
  if(results.length<5) return { detected:false };
  const l5=results.slice(0,5),t5=l5.filter(r=>r==='Tài').length,w=getPatternWeight(type,'cau_nhip_nghieng');
  if(t5>=4) return { detected:true,prediction:'Tài',confidence:Math.round(9*w),name:`Cầu Nhịp Nghiêng 5 (${t5} Tài)`,patternId:'cau_nhip_nghieng' };
  if(t5<=1) return { detected:true,prediction:'Xỉu',confidence:Math.round(9*w),name:`Cầu Nhịp Nghiêng 5 (${5-t5} Xỉu)`,patternId:'cau_nhip_nghieng' };
  if(results.length>=7){
    const l7=results.slice(0,7),t7=l7.filter(r=>r==='Tài').length;
    if(t7>=5) return { detected:true,prediction:'Tài',confidence:Math.round(10*w),name:`Cầu Nhịp Nghiêng 7 (${t7} Tài)`,patternId:'cau_nhip_nghieng' };
    if(t7<=2) return { detected:true,prediction:'Xỉu',confidence:Math.round(10*w),name:`Cầu Nhịp Nghiêng 7 (${7-t7} Xỉu)`,patternId:'cau_nhip_nghieng' };
  }
  return { detected:false };
}
function analyzeCau3Van1(results, type) {
  if(results.length<4) return { detected:false };
  const l4=results.slice(0,4),tc=l4.filter(r=>r==='Tài').length,w=getPatternWeight(type,'cau_3van1');
  if(tc===3&&l4.findIndex(r=>r==='Xỉu')===3)
    return { detected:true,prediction:'Tài',confidence:Math.round(8*w),name:'Cầu 3 Ván 1 (3T‑1X)',patternId:'cau_3van1' };
  if(tc===1&&l4.findIndex(r=>r==='Tài')===3)
    return { detected:true,prediction:'Xỉu',confidence:Math.round(8*w),name:'Cầu 3 Ván 1 (3X‑1T)',patternId:'cau_3van1' };
  return { detected:false };
}
function analyzeCauBeCau(results, type) {
  if(results.length<5) return { detected:false };
  let sl=1;
  for(let i=1;i<results.length;i++) if(results[i]===results[0]) sl++; else break;
  if(sl>=4){
    const w=getPatternWeight(type,'cau_be_cau');
    return { detected:true,streakLength:sl,prediction:results[0]==='Tài'?'Xỉu':'Tài',
      confidence:Math.round(Math.min(14,sl*2+4)*w),
      name:`Cầu Bẻ Cầu (${sl} phiên ${results[0]})`,patternId:'cau_be_cau' };
  }
  return { detected:false };
}
function analyzeCauTuNhien(results, type) {
  const l10=results.slice(0,Math.min(10,results.length));
  const tc=l10.filter(r=>r==='Tài').length,xc=l10.length-tc,w=getPatternWeight(type,'cau_tu_nhien');
  return { detected:true,prediction:tc>xc?'Tài':'Xỉu',confidence:Math.round(5*w),name:`Cầu Tự Nhiên (${tc}T‑${xc}X)`,patternId:'cau_tu_nhien' };
}
function analyzeCau44(results, type) {
  if(results.length<8) return { detected:false };
  let qc=0,i=0,pat=[];
  while(i<results.length-3){
    if(results[i]===results[i+1]&&results[i+1]===results[i+2]&&results[i+2]===results[i+3]){pat.push(results[i]);qc++;i+=4;}
    else break;
  }
  if(qc>=1){
    const pos=results.length-(qc*4),last=pat[pat.length-1],w=getPatternWeight(type,'cau_44');
    return { detected:true,quadCount:qc,prediction:pos>=3?(last==='Tài'?'Xỉu':'Tài'):last,
      confidence:Math.round(Math.min(14,qc*4+6)*w),name:`Cầu 4‑4 (${qc} bộ bốn)`,patternId:'cau_44' };
  }
  return { detected:false };
}
function analyzeCau55(results, type) {
  if(results.length<10) return { detected:false };
  let qc=0,i=0,pat=[];
  while(i<results.length-4){
    if(results[i]===results[i+1]&&results[i+1]===results[i+2]&&results[i+2]===results[i+3]&&results[i+3]===results[i+4]){pat.push(results[i]);qc++;i+=5;}
    else break;
  }
  if(qc>=1){
    const pos=results.length-(qc*5),last=pat[pat.length-1],w=getPatternWeight(type,'cau_55');
    return { detected:true,quintCount:qc,prediction:pos>=4?(last==='Tài'?'Xỉu':'Tài'):last,
      confidence:Math.round(Math.min(15,qc*5+7)*w),name:`Cầu 5‑5 (${qc} bộ năm)`,patternId:'cau_55' };
  }
  return { detected:false };
}
function analyzeCau212(results, type) {
  if(results.length<5) return { detected:false };
  const p=results.slice(0,5),w=getPatternWeight(type,'cau_212');
  if(p[0]===p[1]&&p[1]!==p[2]&&p[2]===p[3]&&p[3]!==p[4]&&p[0]!==p[2])
    return { detected:true,prediction:p[0]==='Tài'?'Xỉu':'Tài',confidence:Math.round(10*w),name:'Cầu 2‑1‑2',patternId:'cau_212' };
  return { detected:false };
}
function analyzeCau1221(results, type) {
  if(results.length<6) return { detected:false };
  const p=results.slice(0,6),w=getPatternWeight(type,'cau_1221');
  if(p[0]!==p[1]&&p[1]===p[2]&&p[2]===p[3]&&p[3]!==p[4]&&p[4]===p[5]&&p[0]!==p[1])
    return { detected:true,prediction:p[0],confidence:Math.round(11*w),name:'Cầu 1‑2‑2‑1',patternId:'cau_1221' };
  return { detected:false };
}
function analyzeCau2112(results, type) {
  if(results.length<6) return { detected:false };
  const p=results.slice(0,6),w=getPatternWeight(type,'cau_2112');
  if(p[0]===p[1]&&p[1]!==p[2]&&p[2]===p[3]&&p[3]!==p[4]&&p[4]===p[5]&&p[0]!==p[2])
    return { detected:true,prediction:p[0],confidence:Math.round(11*w),name:'Cầu 2‑1‑1‑2',patternId:'cau_2112' };
  return { detected:false };
}
function analyzeCauGap(results, type) {
  if(results.length<6) return { detected:false };
  const w=getPatternWeight(type,'cau_gap');
  for(let gs=2;gs<=3;gs++){
    let ok=true, ref=results[0];
    for(let i=0;i<Math.min(results.length,12);i+=(gs+1)) if(results[i]!==ref){ok=false;break;}
    if(ok) return { detected:true,gapSize:gs,prediction:ref,confidence:Math.round(9*w),name:`Cầu Gấp ${gs+1}`,patternId:'cau_gap' };
  }
  return { detected:false };
}
function analyzeCauZiczac(results, type) {
  if(results.length<8) return { detected:false };
  const w=getPatternWeight(type,'cau_ziczac'); let zc=0;
  for(let i=0;i<results.length-2;i++){
    if(results[i]!==results[i+1]&&results[i+1]!==results[i+2]&&results[i]===results[i+2]) zc++;
    else break;
  }
  if(zc>=3) return { detected:true,zigzagCount:zc,prediction:results[0]==='Tài'?'Xỉu':'Tài',
    confidence:Math.round(Math.min(13,zc*2+5)*w),name:`Cầu Ziczac (${zc} lần)`,patternId:'cau_ziczac' };
  return { detected:false };
}
function analyzeCauDoi(results, type) {
  if(results.length<4) return { detected:false };
  const w=getPatternWeight(type,'cau_doi'); let pc=0,i=0;
  while(i<results.length-1){ if(results[i]===results[i+1]){pc++;i+=2;}else break; }
  if(pc>=2){
    if(results[0]!==results[2])
      return { detected:true,pairChanges:pc,prediction:results[0]==='Tài'?'Xỉu':'Tài',
        confidence:Math.round(Math.min(12,pc*3+4)*w),name:`Cầu Đôi Đảo (${pc} cặp)`,patternId:'cau_doi' };
    else
      return { detected:true,pairChanges:pc,prediction:results[0],
        confidence:Math.round(Math.min(11,pc*2+5)*w),name:`Cầu Đôi Bệt (${pc} cặp)`,patternId:'cau_doi' };
  }
  return { detected:false };
}
function analyzeCauRong(results, type) {
  if(results.length<6) return { detected:false };
  const w=getPatternWeight(type,'cau_rong'); let sl=1;
  for(let i=1;i<results.length;i++) if(results[i]===results[0]) sl++; else break;
  if(sl>=6) return { detected:true,streakLength:sl,prediction:results[0]==='Tài'?'Xỉu':'Tài',
    confidence:Math.round(Math.min(16,sl+8)*w),name:`Cầu Rồng ${sl} phiên`,patternId:'cau_rong' };
  return { detected:false };
}
function analyzeSmartBet(results, type) {
  if(results.length<10) return { detected:false };
  const w=getPatternWeight(type,'smart_bet');
  const l5=results.slice(0,5),p5=results.slice(5,10);
  const tl5=l5.filter(r=>r==='Tài').length,tp5=p5.filter(r=>r==='Tài').length;
  if((tl5>=4&&tp5<=1)||(tl5<=1&&tp5>=4)){
    const dom=tl5>=4?'Tài':'Xỉu';
    return { detected:true,prediction:dom==='Tài'?'Xỉu':'Tài',confidence:Math.round(13*w),
      name:`Đảo Xu Hướng`,patternId:'smart_bet' };
  }
  const tl10=results.slice(0,10).filter(r=>r==='Tài').length;
  if(tl10>=8||tl10<=2){
    const dom=tl10>=8?'Tài':'Xỉu';
    return { detected:true,prediction:dom==='Tài'?'Xỉu':'Tài',confidence:Math.round(12*w),
      name:`Xu Hướng Cực`,patternId:'smart_bet' };
  }
  return { detected:false };
}
function detectCyclePattern(results, type) {
  if(results.length<12) return { detected:false };
  for(let cl=2;cl<=6;cl++){
    let ok=true, pat=results.slice(0,cl);
    for(let i=cl;i<Math.min(cl*3,results.length);i++) if(results[i]!==pat[i%cl]){ok=false;break;}
    if(ok){
      const w=getPatternWeight(type,'cau_chu_ky');
      return { detected:true,cycleLength:cl,prediction:pat[results.length%cl],
        confidence:Math.round(9*w),name:`Cầu Chu Kỳ ${cl}`,patternId:'cau_chu_ky' };
    }
  }
  return { detected:false };
}

// ==================== NHÓM THUẬT TOÁN PHÂN TÍCH XÚC XẮC & THỐNG KÊ ====================
function analyzeDistribution(data, type, windowSize=50){
  const w=data.slice(0,windowSize),tc=w.filter(d=>d.Ket_qua==='Tài').length,xc=w.length-tc;
  return { taiPercent:tc/w.length*100,xiuPercent:xc/w.length*100,taiCount:tc,xiuCount:xc,imbalance:Math.abs(tc-xc)/w.length };
}
function analyzeDicePatterns(data){
  const r=data.slice(0,15); let hc=0,lc=0,ts=0,sv=[];
  r.forEach(d=>{
    [d.xuc_xac_1,d.xuc_xac_2,d.xuc_xac_3].forEach(x=>{x>=4?hc++:lc++;});
    ts+=d.tong; sv.push(d.tong);
  });
  const avg=ts/r.length,va=sv.reduce((a,v)=>a+Math.pow(v-avg,2),0)/sv.length;
  return { highDiceRatio:hc/(hc+lc),lowDiceRatio:lc/(hc+lc),averageSum:avg,standardDeviation:Math.sqrt(va),sumTrend:avg>10.5?'high':'low',isStable:Math.sqrt(va)<3 };
}
function analyzeSumTrend(data){
  const s=data.slice(0,20).map(d=>d.tong); let ic=0,dc=0;
  for(let i=0;i<s.length-1;i++){ if(s[i]>s[i+1])dc++; else if(s[i]<s[i+1])ic++; }
  const ma5=s.slice(0,5).reduce((a,b)=>a+b,0)/5,ma10=s.slice(0,10).reduce((a,b)=>a+b,0)/10;
  return { trend:ic>dc?'increasing':'decreasing',strength:Math.abs(ic-dc)/(s.length-1),movingAvg5:ma5,movingAvg10:ma10,shortTermBias:ma5>10.5?'Tài':'Xỉu' };
}
function analyzeRecentMomentum(results){
  const m={},win=[3,5,10,15];
  win.forEach(sz=>{
    if(results.length>=sz){
      const w=results.slice(0,sz),tc=w.filter(r=>r==='Tài').length;
      m[`window_${sz}`]={ taiRatio:tc/sz,xiuRatio:(sz-tc)/sz,dominant:tc>sz/2?'Tài':'Xỉu' };
    }
  });
  return m;
}
function analyzeEdgeCases(data, type){
  if(data.length<10) return { detected:false };
  const t=data.slice(0,10).map(d=>d.tong),eh=t.filter(x=>x>=14).length,el=t.filter(x=>x<=7).length,w=getPatternWeight(type,'edge_cases');
  if(eh>=4) return { detected:true,prediction:'Xỉu',confidence:Math.round(7*w),name:`Cực Điểm Cao`,patternId:'edge_cases' };
  if(el>=4) return { detected:true,prediction:'Tài',confidence:Math.round(7*w),name:`Cực Điểm Thấp`,patternId:'edge_cases' };
  return { detected:false };
}
function analyzeDiceTrendLine(data, type){
  if(data.length<3) return { detected:false };
  const c=data[0],p=data[1],cd=[c.xuc_xac_1,c.xuc_xac_2,c.xuc_xac_3],pd=[p.xuc_xac_1,p.xuc_xac_2,p.xuc_xac_3],dir=[];
  for(let i=0;i<3;i++) dir.push(cd[i]>pd[i]?'up':cd[i]<pd[i]?'down':'same');
  const u=dir.filter(d=>d==='up').length,d=dir.filter(d=>d==='down').length,s=dir.filter(d=>d==='same').length,w=getPatternWeight(type,'dice_trend_line');
  if(cd[0]===cd[1]&&cd[1]===cd[2])
    return { detected:true,prediction:cd[0]>=4?'Xỉu':'Tài',confidence:Math.round(13*w),name:`Biểu Đồ Đường 3 giống`,patternId:'dice_trend_line' };
  if((cd[0]===cd[1])||(cd[1]===cd[2])||(cd[0]===cd[2]))
    return { detected:true,prediction:p.Ket_qua==='Tài'?'Xỉu':'Tài',confidence:Math.round(11*w),name:`Biểu Đồ Đường 2 giống`,patternId:'dice_trend_line' };
  const mx=Math.max(...cd),mn=Math.min(...cd);
  if(mx===6&&mn===1) return { detected:true,prediction:p.Ket_qua==='Tài'?'Xỉu':'Tài',confidence:Math.round(12*w),name:`Biểu Đồ Đường biên độ max`,patternId:'dice_trend_line' };
  if(u===1&&d===2) return { detected:true,prediction:'Tài',confidence:Math.round(12*w),name:'Biểu Đồ Đường 1L2X',patternId:'dice_trend_line' };
  if(u===2&&d===1) return { detected:true,prediction:'Xỉu',confidence:Math.round(12*w),name:'Biểu Đồ Đường 2L1X',patternId:'dice_trend_line' };
  if(u===3||d===3) return { detected:true,prediction:p.Ket_qua,confidence:Math.round(10*w),name:`Biểu Đồ Đường cùng chiều`,patternId:'dice_trend_line' };
  return { detected:false };
}
function analyzeDayGay(data, type){
  if(data.length<3) return { detected:false };
  const c=data[0],p=data[1],cd=[c.xuc_xac_1,c.xuc_xac_2,c.xuc_xac_3],pd=[p.xuc_xac_1,p.xuc_xac_2,p.xuc_xac_3],dir=[];
  for(let i=0;i<3;i++) dir.push(cd[i]>pd[i]?'up':cd[i]<pd[i]?'down':'same');
  const u=dir.filter(d=>d==='up').length,d=dir.filter(d=>d==='down').length,s=dir.filter(d=>d==='same').length,w=getPatternWeight(type,'day_gay');
  if(s===2&&u===1) return { detected:true,prediction:'Xỉu',confidence:Math.round(14*w),name:'Dây Gãy 2T1L',patternId:'day_gay' };
  if(s===2&&d===1) return { detected:true,prediction:'Tài',confidence:Math.round(14*w),name:'Dây Gãy 2T1X',patternId:'day_gay' };
  if(u===2&&d===1) return { detected:true,prediction:'Xỉu',confidence:Math.round(13*w),name:'Dây Gãy 2L1X',patternId:'day_gay' };
  if(d===2&&u===1) return { detected:true,prediction:'Tài',confidence:Math.round(13*w),name:'Dây Gãy 2X1L',patternId:'day_gay' };
  return { detected:false };
}
function analyzeBreakPattern(results, data, type){
  if(results.length<5) return { detected:false };
  const w=getPatternWeight(type,'break_pattern'); let sl=1;
  for(let i=1;i<results.length;i++) if(results[i]===results[0]) sl++; else break;
  if(sl>=5){
    const df=Math.abs(data[0].tong-data[1].tong);
    if(df>=5) return { detected:true,prediction:results[0]==='Tài'?'Xỉu':'Tài',confidence:Math.round(15*w),name:`Cầu Gãy biến động ${df}`,patternId:'break_pattern' };
    if(sl>=7) return { detected:true,prediction:results[0]==='Tài'?'Xỉu':'Tài',confidence:Math.round(16*w),name:`Cầu Gãy dài ${sl}`,patternId:'break_pattern' };
  }
  return { detected:false };
}
function analyzeFibonacciPattern(data, type){
  if(data.length<13) return { detected:false };
  const w=getPatternWeight(type,'fibonacci'),pos=[1,2,3,5,8,13]; let tt=0,xt=0;
  pos.forEach(p=>{if(p<=data.length){data[p-1].Ket_qua==='Tài'?tt++:xt++;}});
  if(tt>=5||xt>=5) return { detected:true,prediction:tt>xt?'Tài':'Xỉu',confidence:Math.round(11*w),name:'Fibonacci',patternId:'fibonacci' };
  return { detected:false };
}
function analyzeMomentumPattern(data, type){
  if(data.length<10) return { detected:false };
  const l5=data.slice(0,5).map(d=>d.tong),p5=data.slice(5,10).map(d=>d.tong);
  const a5=l5.reduce((a,b)=>a+b,0)/5,a10=p5.reduce((a,b)=>a+b,0)/5,mc=a5-a10,w=getPatternWeight(type,'momentum');
  if(Math.abs(mc)>=2) return { detected:true,prediction:mc>0?'Xỉu':'Tài',confidence:Math.round(12*w),name:`Momentum ${mc>0?'Tăng':'Giảm'}`,patternId:'momentum' };
  return { detected:false };
}
function analyzeResistanceSupport(data, type){
  if(data.length<20) return { detected:false };
  const s=data.slice(0,20).map(d=>d.tong),mx=Math.max(...s),mn=Math.min(...s),cs=data[0].tong,w=getPatternWeight(type,'resistance_support');
  const dr=mx-cs,ds=cs-mn;
  if(dr<=2&&dr<ds) return { detected:true,prediction:'Xỉu',confidence:Math.round(10*w),name:`Gần kháng cự ${mx}`,patternId:'resistance_support' };
  if(ds<=2&&ds<dr) return { detected:true,prediction:'Tài',confidence:Math.round(10*w),name:`Gần hỗ trợ ${mn}`,patternId:'resistance_support' };
  return { detected:false };
}
function analyzeWavePattern(data, type){
  if(data.length<12) return { detected:false };
  const r=data.slice(0,12).map(d=>d.Ket_qua),w=getPatternWeight(type,'wave');
  const waves=[]; let cw={type:r[0],count:1};
  for(let i=1;i<r.length;i++){ if(r[i]===cw.type) cw.count++; else { waves.push(cw); cw={type:r[i],count:1};} }
  waves.push(cw);
  if(waves.length>=4){
    const ln=waves.slice(0,4).map(x=>x.count);
    if(ln.every((v,i,a)=>i===0||v>=a[i-1])&&ln[0]<ln[3])
      return { detected:true,prediction:waves[0].type==='Tài'?'Xỉu':'Tài',confidence:Math.round(12*w),name:'Sóng Mở Rộng',patternId:'wave' };
    if(ln.every((v,i,a)=>i===0||v<=a[i-1])&&ln[0]>ln[3])
      return { detected:true,prediction:waves[0].type,confidence:Math.round(11*w),name:'Sóng Thu Hẹp',patternId:'wave' };
  }
  if(waves.length>=3){
    const l3=waves.slice(0,3),avg=l3.reduce((a,x)=>a+x.count,0)/3;
    if(waves[0].count>avg*1.5)
      return { detected:true,prediction:waves[0].type==='Tài'?'Xỉu':'Tài',confidence:Math.round(11*w),name:'Đỉnh Sóng',patternId:'wave' };
  }
  return { detected:false };
}
function analyzeGoldenRatio(data, type){
  if(data.length<21) return { detected:false };
  const w=getPatternWeight(type,'golden_ratio'),pos=[1,2,3,5,8,13,21]; let tt=0,xt=0;
  pos.forEach(p=>{if(p<=data.length) data[p-1].Ket_qua==='Tài'?tt++:xt++;});
  const ratio=Math.max(tt,xt)/Math.min(tt,xt);
  if(ratio>=1.6&&ratio<=1.7) return { detected:true,prediction:tt>xt?'Tài':'Xỉu',confidence:Math.round(12*w),name:'Tỷ Lệ Vàng',patternId:'golden_ratio' };
  if(tt>=5||xt>=5) return { detected:true,prediction:tt>xt?'Xỉu':'Tài',confidence:Math.round(11*w),name:'Fibonacci Cực',patternId:'golden_ratio' };
  return { detected:false };
}
function analyzeMarkovChain(results, data, type){
  if(results.length<20) return { detected:false };
  const tr={'Tài->Tài':0,'Tài->Xỉu':0,'Xỉu->Tài':0,'Xỉu->Xỉu':0};
  for(let i=0;i<results.length-1;i++) tr[`${results[i+1]}->${results[i]}`]++;
  if(!learningData[type].transitionMatrix) learningData[type].transitionMatrix={...tr};
  else Object.keys(tr).forEach(k=>learningData[type].transitionMatrix[k]=(learningData[type].transitionMatrix[k]||0)*0.9+tr[k]*0.1);
  const cr=results[0],w=getPatternWeight(type,'markov_chain');
  let pred,prob;
  if(cr==='Tài'){ const t=tr['Tài->Tài']+tr['Tài->Xỉu']; if(t===0)return{detected:false}; prob=tr['Tài->Tài']/t; pred=prob>0.55?'Tài':'Xỉu'; }
  else { const t=tr['Xỉu->Tài']+tr['Xỉu->Xỉu']; if(t===0)return{detected:false}; prob=tr['Xỉu->Xỉu']/t; pred=prob>0.55?'Xỉu':'Tài'; }
  if(Math.abs(prob-0.5)>0.1)
    return { detected:true,prediction:pred,confidence:Math.round(Math.min(15,Math.abs(prob-0.5)*30+8)*w),name:`Markov ${(prob*100).toFixed(0)}%`,patternId:'markov_chain' };
  return { detected:false };
}
function analyzeMovingAverageDrift(data, type){
  if(data.length<20) return { detected:false };
  const s=data.slice(0,20).map(d=>d.tong),ma5=s.slice(0,5).reduce((a,b)=>a+b,0)/5,ma10=s.slice(0,10).reduce((a,b)=>a+b,0)/10,ma20=s.reduce((a,b)=>a+b,0)/20;
  const sd=ma5-ma10,ld=ma10-ma20,td=ma5-ma20,w=getPatternWeight(type,'moving_avg_drift');
  if(Math.abs(sd)>1.5&&Math.abs(ld)>1&&sd*ld>0)
    return { detected:true,prediction:sd>0?'Tài':'Xỉu',confidence:Math.round(14*w),name:'MA Drift Mạnh',patternId:'moving_avg_drift' };
  if(Math.abs(td)>2)
    return { detected:true,prediction:td>0?'Xỉu':'Tài',confidence:Math.round(12*w),name:'MA Đảo Chiều',patternId:'moving_avg_drift' };
  return { detected:false };
}
function analyzeSumPressure(data, type){
  if(data.length<15) return { detected:false };
  const MEAN=10.5,s=data.slice(0,15).map(d=>d.tong),avg=s.reduce((a,b)=>a+b,0)/s.length,dev=avg-MEAN;
  const eh=s.filter(x=>x>=14).length,el=s.filter(x=>x<=7).length,nc=s.filter(x=>x>=9&&x<=12).length;
  const std=Math.sqrt(s.reduce((a,v)=>a+Math.pow(v-avg,2),0)/s.length),w=getPatternWeight(type,'sum_pressure');
  if(Math.abs(dev)>1.5) return { detected:true,prediction:dev>0?'Xỉu':'Tài',confidence:Math.round(Math.min(15,Math.abs(dev)*5+7)*w),name:'Áp lực trung bình',patternId:'sum_pressure' };
  if(eh>=4) return { detected:true,prediction:'Xỉu',confidence:Math.round(13*w),name:'Áp lực cực cao',patternId:'sum_pressure' };
  if(el>=4) return { detected:true,prediction:'Tài',confidence:Math.round(13*w),name:'Áp lực cực thấp',patternId:'sum_pressure' };
  if(std<2&&nc>=10) return { detected:true,prediction:s[0]>MEAN?'Xỉu':'Tài',confidence:Math.round(10*w),name:'Vùng ổn định',patternId:'sum_pressure' };
  return { detected:false };
}
function analyzeVolatility(data, type){
  if(data.length<10) return { detected:false };
  const s=data.slice(0,10).map(d=>d.tong),ch=[];
  for(let i=0;i<s.length-1;i++) ch.push(Math.abs(s[i]-s[i+1]));
  const avg=ch.reduce((a,b)=>a+b,0)/ch.length,mx=Math.max(...ch),rc=ch[0],w=getPatternWeight(type,'volatility');
  if(avg>4&&mx>=7) return { detected:true,prediction:data[0].Ket_qua==='Tài'?'Xỉu':'Tài',confidence:Math.round(12*w),name:'Biến động cao',patternId:'volatility' };
  if(avg<2&&rc>=5) return { detected:true,prediction:data[0].Ket_qua,confidence:Math.round(11*w),name:'Đột biến',patternId:'volatility' };
  return { detected:false };
}
function analyzeSunHotCold(results, last50, type){
  if(results.length<10) return { detected:false };
  const l10=results.slice(0,10),tc10=l10.filter(r=>r==='Tài').length,xc10=10-tc10,w=getPatternWeight(type,'sun_hot_cold');
  if(tc10>=7) return { detected:true,prediction:tc10>=8?'Xỉu':'Tài',confidence:Math.round((tc10>=8?14:12)*w*(tc10/10)),name:`Sun Nóng Tài ${tc10}/10`,patternId:'sun_hot_cold' };
  if(xc10>=7) return { detected:true,prediction:xc10>=8?'Tài':'Xỉu',confidence:Math.round((xc10>=8?14:12)*w*(xc10/10)),name:`Sun Nóng Xỉu ${xc10}/10`,patternId:'sun_hot_cold' };
  return { detected:false };
}
function analyzeSunStreakBreak(results, last50, type){
  if(results.length<5) return { detected:false };
  let sl=1,ct=results[0];
  for(let i=1;i<results.length;i++) if(results[i]===ct) sl++; else break;
  const w=getPatternWeight(type,'sun_streak_break');
  const sums=last50.slice(0,sl).map(d=>d.tong||0).filter(x=>x>0);
  const avg=sums.length>0?sums.reduce((a,b)=>a+b,0)/sums.length:10.5;
  const br=sl>=5||(avg<=9&&ct==='Tài')||(avg>=12&&ct==='Xỉu');
  return { detected:true,streakLength:sl,prediction:br?(ct==='Tài'?'Xỉu':'Tài'):ct,
    confidence:Math.round((br?Math.min(16,sl*2+4):Math.min(14,sl*2))*w),
    name:`Sun Streak ${sl} ${ct}`,patternId:'sun_streak_break' };
}
function analyzeSunBalance(results, type){
  if(results.length<15) return { detected:false };
  const l15=results.slice(0,15),tc=l15.filter(r=>r==='Tài').length,xc=15-tc,diff=Math.abs(tc-xc),w=getPatternWeight(type,'sun_balance');
  if(diff>=7) return { detected:true,prediction:tc<xc?'Tài':'Xỉu',confidence:Math.round(Math.min(13,diff+5)*w),name:`Sun Cân Bằng ${tc}T‑${xc}X`,patternId:'sun_balance' };
  if(diff<=1){
    const l3=results.slice(0,3),l3t=l3.filter(r=>r==='Tài').length;
    return { detected:true,prediction:l3t>=2?'Xỉu':'Tài',confidence:Math.round(8*w),name:'Sun Cân Bằng Hoàn Hảo',patternId:'sun_balance' };
  }
  return { detected:false };
}
function analyzeSunMomentumShift(results, last50, type){
  if(results.length<12) return { detected:false };
  const r6=results.slice(0,6),p6=results.slice(6,12),rt=r6.filter(r=>r==='Tài').length,pt=p6.filter(r=>r==='Tài').length,sh=rt-pt;
  if(Math.abs(sh)>=4){
    const to=sh>0?'Tài':'Xỉu',w=getPatternWeight(type,'sun_momentum_shift');
    return { detected:true,prediction:to,confidence:Math.round(Math.min(14,Math.abs(sh)*2+4)*w),name:`Sun Đổi Chiều → ${to}`,patternId:'sun_momentum_shift' };
  }
  return { detected:false };
}

// ==================== HÀM TỔNG HỢP TÍNH TOÁN KẾT QUẢ CUỐI - THUẬT TOÁN NÂNG CAO ====================
function calculateAdvancedPrediction(data, type) {
  const last50 = data.slice(0, 50);
  const results = last50.map(d => d.Ket_qua);
  initializePatternStats(type);
  const preds = [], factors = [], allP = [];
  const run = r => { if(r.detected){ preds.push({prediction:r.prediction,confidence:r.confidence,priority:r.priority||5,name:r.name}); factors.push(r.name); allP.push(r); }};
  run({...analyzeCauBet(results,type), priority:10});
  run({...analyzeCauDao11(results,type), priority:9});
  run({...analyzeCau22(results,type), priority:8});
  run({...analyzeCau33(results,type), priority:8});
  run({...analyzeCau121(results,type), priority:7});
  run({...analyzeCau123(results,type), priority:7});
  run({...analyzeCau321(results,type), priority:7});
  run({...analyzeCauNhayCoc(results,type), priority:6});
  run({...analyzeCauNhipNghieng(results,type), priority:7});
  run({...analyzeCau3Van1(results,type), priority:6});
  run({...analyzeCauBeCau(results,type), priority:8});
  run({...detectCyclePattern(results,type), priority:7});
  run({...analyzeCau44(results,type), priority:9});
  run({...analyzeCau55(results,type), priority:9});
  run({...analyzeCau212(results,type), priority:8});
  run({...analyzeCau1221(results,type), priority:8});
  run({...analyzeCau2112(results,type), priority:8});
  run({...analyzeCauGap(results,type), priority:7});
  run({...analyzeCauZiczac(results,type), priority:8});
  run({...analyzeCauDoi(results,type), priority:8});
  run({...analyzeCauRong(results,type), priority:10});
  run({...analyzeSmartBet(results,type), priority:9});
  run({...analyzeDiceTrendLine(last50,type), priority:11});
  run({...analyzeBreakPattern(results,last50,type), priority:12});
  run({...analyzeDayGay(last50,type), priority:13});
  const dist=analyzeDistribution(last50,type);
  if(dist.imbalance>0.2) run({prediction:dist.taiPercent<50?'Tài':'Xỉu',confidence:Math.round(6*getPatternWeight(type,'distribution')),priority:5,name:'Phân bố lệch',detected:true});
  const dp=analyzeDicePatterns(last50);
  if(dp.averageSum>11.5) run({prediction:'Xỉu',confidence:Math.round(5*getPatternWeight(type,'dice_pattern')),priority:4,name:'Tổng TB cao',detected:true});
  else if(dp.averageSum<9.5) run({prediction:'Tài',confidence:Math.round(5*getPatternWeight(type,'dice_pattern')),priority:4,name:'Tổng TB thấp',detected:true});
  const st=analyzeSumTrend(last50);
  if(st.strength>0.4) run({prediction:st.trend==='increasing'?'Tài':'Xỉu',confidence:Math.round(4*getPatternWeight(type,'sum_trend')),priority:3,name:'Xu hướng tổng',detected:true});
  run({...analyzeEdgeCases(last50,type), priority:5});
  run({...analyzeFibonacciPattern(last50,type), priority:8});
  run({...analyzeMomentumPattern(last50,type), priority:9});
  run({...analyzeResistanceSupport(last50,type), priority:10});
  run({...analyzeWavePattern(last50,type), priority:8});
  run({...analyzeGoldenRatio(last50,type), priority:9});
  run({...analyzeMarkovChain(results,last50,type), priority:12});
  run({...analyzeMovingAverageDrift(last50,type), priority:11});
  run({...analyzeSumPressure(last50,type), priority:11});
  run({...analyzeVolatility(last50,type), priority:10});
  run({...analyzeSunHotCold(results,last50,type), priority:13});
  run({...analyzeSunStreakBreak(results,last50,type), priority:14});
  run({...analyzeSunBalance(results,type), priority:12});
  run({...analyzeSunMomentumShift(results,last50,type), priority:13});
  if(preds.length===0) run({...analyzeCauTuNhien(results,type), priority:1});
  preds.sort((a,b)=>b.priority-a.priority||b.confidence-a.confidence);
  const tV=preds.filter(p=>p.prediction==='Tài'),xV=preds.filter(p=>p.prediction==='Xỉu');
  const tS=tV.reduce((s,p)=>s+p.confidence*p.priority,0),xS=xV.reduce((s,p)=>s+p.confidence*p.priority,0);
  let final=tS>=xS?'Tài':'Xỉu';
  final=getSmartPredictionAdjustment(type,final,allP);
  let base=50;
  preds.slice(0,3).forEach(p=>{if(p.prediction===final) base+=p.confidence;});
  base+=Math.round(((final==='Tài'?tV.length:xV.length)/preds.length)*10);
  base+=getAdaptiveConfidenceBoost(type);
  let conf=Math.max(50,Math.min(85,Math.round(base+(Math.random()*4-2))));
  const rev=applyAutoReversal('b52',final);
  return { prediction:rev.prediction, confidence:conf, factors, allPatterns:allP, reversed:rev.reversed, originalPrediction:rev.originalPrediction };
}

// 🔵 ⬆️ HẾT TOÀN BỘ NỘI DUNG THUẬT TOÁN, KHÔNG BỊ THIẾU DÒNG NÀO
// ============================================================

// ============================================================
// 🟢 PHẦN 2: GIỮ NGUYÊN TOÀN BỘ CLASS TX_LogicPen_V4 VÀ TẤT CẢ HÀM CÒN LẠI
//    CHỈ THÊM 1 HÀM GỌI THUẬT TOÁN NÂNG CAO ĐỂ SO SÁNH & LẤY TỐT NHẤ
// ============================================================

class TX_LogicPen_V4 {
    constructor() {
        this.error_streak = 0;
        this.last_prediction = null;
        this.history = [];
        this.co_khuon_cau = false;
        this.ten_khuon = "";
        this.dao_tu_dong_trang_thai = false;
        this.che_do_hien_tai = "BINH_THUONG";
        this.lan_truoc_dung_sai = null;
        this.gay_1_tay_gan_nhat = false;
        this.ketQuaNangCao = null; // ✅ Thêm biến lưu kết quả thuật toán nâng cao
    }
    loadData(data) {
        this.history = [...data].sort((a, b) => (b.phien || 0) - (a.phien || 0));
    }
    _arr() {
        return this.history.map(s => 
            (s.ket_qua || '').toUpperCase().replace('XỈU', 'XIU').replace('TÀI', 'TAI')
        );
    }
    _points() {
        return this.history
            .filter(s => s.tong !== undefined && s.tong !== null)
            .map(s => s.tong);
    }
    // ✅ HÀM MỚI: CHUYỂN ĐỔI DỮ LIỆU SANG ĐỊNH DẠNG THUẬT TOÁN & GỌI PHÂN TÍCH
    chayThuatToanNangCao(){
        try{
            const dataChuan = this.history.map(h => ({
                Ket_qua: (h.ket_qua||'').toUpperCase()==='TAI'?'Tài':'Xỉu',
                ket_qua: h.ket_qua,
                tong: h.tong||0,
                xuc_xac_1: h.xuc_xac_1||0,
                xuc_xac_2: h.xuc_xac_2||0,
                xuc_xac_3: h.xuc_xac_3||0
            }));
            this.ketQuaNangCao = calculateAdvancedPrediction(dataChuan,'b52');
            return this.ketQuaNangCao;
        }catch(e){ return null; }
    }
    cau3Bet(arr) {
        if (arr.length < 3) return null;
        if (arr[0] === arr[1] && arr[1] === arr[2]) {
            return { pred: arr[0], conf: 86, type: "BẮT BỆT 3", reason: `✅ 3 ${arr[0]} LIÊN TIẾP → BẮT BỆT KHÔNG BẺ` };
        }
        return null;
    }
    cauSap(arr) {
        if (arr.length < 2) return null;
        let length = 1;
        for (let i = 1; i < arr.length; i++) { if (arr[i] === arr[0]) length++; else break; }
        if (length >= 2 && length <= 5) return { pred: arr[0], conf: 72, type: "Đu Bệt", reason: `Bệt ${length} phiên` };
        if (length >= 6) return { pred: arr[0] === "TAI" ? "XIU" : "TAI", conf: 80, type: "Bẻ Bệt Rồng", reason: `Bệt dài ${length} → hồi` };
        return null;
    }
    cauNoi(arr) {
        if (arr.length < 5) return null;
        let laCau11 = true;
        for (let i = 0; i < 4; i++) { if (arr[i] === arr[i + 1]) { laCau11 = false; break; } }
        if (laCau11) {
            const ketQuaBat = arr[0] === "TAI" ? "XIU" : "TAI";
            return { pred: ketQuaBat, conf: 88, type: "CẦU NỐI 1‑1 CỨNG", reason: "⚡ NHỊP 1‑1 ỔN ĐỊNH → BẮT THEO NHỊP KHÔNG BẺ" };
        }
        return null;
    }
    cauDoi(arr) {
        if (arr.length < 4) return null;
        if (arr[0] === arr[1] && arr[2] === arr[3] && arr[0] !== arr[2]) return { pred: arr[2], conf: 78, type: "Cầu 2‑2", reason: "AABB → B" };
        if (arr.length >= 6 && arr[0] === arr[1] && arr[1] === arr[2] && arr[3] === arr[4] && arr[4] === arr[5] && arr[0] !== arr[3])
            return { pred: arr[3], conf: 80, type: "Cầu 3‑3", reason: "AAABBB → B" };
        return null;
    }
    cauGay(arr) {
        if (arr.length >= 5 && arr[0] === arr[1] && arr[1] === arr[2] && arr[2] !== arr[3] && arr[3] === arr[4])
            return { pred: arr[3], conf: 74, type: "Gãy 3‑2", reason: "AAABB → B" };
        if (arr.length >= 5 && arr[0] === arr[1] && arr[1] !== arr[2] && arr[2] === arr[3] && arr[3] === arr[4])
            return { pred: arr[2], conf: 74, type: "Gãy 2‑3", reason: "AABBB → B" };
        if (arr.length >= 4 && arr[0] !== arr[1] && arr[1] === arr[2] && arr[2] !== arr[3] && arr[0] === arr[3])
            return { pred: arr[1], conf: 72, type: "Gãy 1‑2‑1", reason: "ABBA → B" };
        return null;
    }
    phatHienMauLap(arr) {
        if (arr.length < 6) return null;
        for (let len = 2; len <= 4; len++) {
            let pattern = arr.slice(0, len);
            for (let i = len; i < arr.length - len; i++) {
                let sub = arr.slice(i, i + len);
                if (JSON.stringify(sub) === JSON.stringify(pattern) && arr[i - 1])
                    return { pred: arr[i - 1], conf: 88, type: "Mẫu Lặp", reason: `Mẫu "${pattern.join(',')}"` };
            }
        }
        return null;
    }
    duDoanVi() {
        const points = this._points();
        if (points.length < 5) return null;
        const last = points[0], prev = points[1], slice = points.slice(0, 5);
        const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
        if (last >= 15) return { pred: "XIU", conf: 75, type: "Vị cực đại", reason: `Điểm ${last} → hồi Xỉu` };
        if (last <= 5) return { pred: "TAI", conf: 75, type: "Vị cực tiểu", reason: `Điểm ${last} → hồi Tài` };
        if (avg > 11 && last > prev) return { pred: "XIU", conf: 68, type: "Vị bão hòa", reason: "Đà tăng chạm ngưỡng" };
        if (avg < 10 && last < prev) return { pred: "TAI", conf: 68, type: "Vị cạn kiệt", reason: "Đà giảm chạm đáy" };
        if (avg >= 11 && last >= 11 && last <= 13) return { pred: "TAI", conf: 65, type: "Vị ổn định", reason: "Duy trì Tài nhẹ" };
        if (avg <= 9 && last >= 7 && last <= 9) return { pred: "XIU", conf: 65, type: "Vị ổn định", reason: "Duy trì Xỉu nhẹ" };
        return null;
    }
    tongHopDuDoan() {
        const arr = this._arr();
        if (arr.length < 2) return null;
        const ketQuaKhuon = 
            this.cau3Bet(arr) || this.cauNoi(arr) || this.phatHienMauLap(arr) ||
            this.cauDoi(arr) || this.cauGay(arr) || this.cauSap(arr) || this.duDoanVi(arr);

        // ✅ CHẠY SONG SONG THUẬT TOÁN 40+ MẪU, LẤY KẾT QUẢ TỐT NHẤ
        const nc = this.chayThuatToanNangCao();
        if(ketQuaKhuon){
            this.co_khuon_cau = true;
            this.ten_khuon = ketQuaKhuon.type;
            this.dao_tu_dong_trang_thai = false;
            if(nc && nc.confidence > ketQuaKhuon.conf + 3){
                const pNC = nc.prediction==='Tài'?'TAI':'XIU';
                return { pred:pNC, conf:nc.confidence, type:`NÂNG CAO · ${nc.allPatterns[0]?.name||ketQuaKhuon.type}`,
                    reason:`🧠 THUẬT TOÁN HỌC MÁY | ${nc.factors.slice(0,3).join(' · ')} | CŨ:${ketQuaKhuon.reason}` };
            }
            return ketQuaKhuon;
        }else{
            this.co_khuon_cau = false;
            this.ten_khuon = "KHÔNG CÓ KHUÔN";
            this.dao_tu_dong_trang_thai = true;
            if(nc){
                const pNC = nc.prediction==='Tài'?'TAI':'XIU';
                return { pred:pNC, conf:nc.confidence, type:`NÂNG CAO · ${nc.allPatterns[0]?.name||'Tổng hợp'}`,
                    reason:`🧠 THUẬT TOÁN HỌC MÁY | ${nc.factors.slice(0,3).join(' · ')}` };
            }
            return { pred: arr[0], conf: 55, type: "Theo", reason: "Bám phiên cuối" };
        }
    }
    apDungDaoChieu(p) {
        if (!p || this.history.length < 1) return p;
        const currentResult = this._arr()[0];
        if (this.co_khuon_cau === true) {
            return { ...p, conf: Math.min(92, p.conf + 2), reason: `🎯 [KHUÔN: ${this.ten_khuon}] → BẮT ĐÚNG, KHÔNG ĐẢO | ${p.reason}` };
        }
        if (this.che_do_hien_tai === "DAO_TU_DONG" && this.dao_tu_dong_trang_thai) {
            if (this.gay_1_tay_gan_nhat === true) {
                this.che_do_hien_tai = "BINH_THUONG";
                this.gay_1_tay_gan_nhat = false;
                return { ...p, type: "BÌNH THƯỜNG", reason: `🔵 [GÃY 1 → TẮT ĐẢO] DỰ ĐOÁN NGUYÊN BẢN: ${p.pred}` };
            }
            const ketQuaDao = p.pred === "TAI" ? "XIU" : "TAI";
            return { ...p, pred: ketQuaDao, conf: Math.min(85, p.conf + 5), type: "ĐẢO TỰ ĐỘNG", reason: `🔄 [ĐANG ĐẢO] ${p.pred} ➜ ${ketQuaDao}` };
        }
        if (this.che_do_hien_tai === "BINH_THUONG") {
            if (this.gay_1_tay_gan_nhat === true && this.dao_tu_dong_trang_thai) {
                this.che_do_hien_tai = "DAO_TU_DONG";
                this.gay_1_tay_gan_nhat = false;
                const ketQuaDao = p.pred === "TAI" ? "XIU" : "TAI";
                return { ...p, pred: ketQuaDao, conf: Math.min(85, p.conf + 5), type: "ĐẢO TỰ ĐỘNG", reason: `🔴 [GÃY 1 → BẬT ĐẢO] ${p.pred} ➜ ${ketQuaDao}` };
            }
            return { ...p, type: "BÌNH THƯỜNG", reason: `🟢 [CHẠY BÌNH THƯỜNG] ${p.reason}` };
        }
        if (!this.che_do_hien_tai || this.che_do_hien_tai === "") this.che_do_hien_tai = "BINH_THUONG";
        if (this.error_streak >= 2 && this.last_prediction && this.last_prediction !== currentResult) {
            return { ...p, pred: p.pred === "TAI" ? "XIU" : "TAI", conf: Math.min(88, p.conf + 10), reason: `🔄 Đảo dự phòng: ${p.reason}` };
        }
        return p;
    }
    predict(data) {
        this.loadData(data);
        let result = this.tongHopDuDoan();
        if (result) result = this.apDungDaoChieu(result);
        else result = { pred: this._arr()[0] || "TAI", conf: 50, type: "Theo", reason: "Không đủ dữ liệu" };
        this.last_prediction = result.pred;
        return result;
    }
    updateStatus(actual) {
        if (this.last_prediction) {
            const a = actual.toUpperCase().replace('XỈU', 'XIU').replace('TÀI', 'TAI');
            const ketQuaHienTai = this.last_prediction === a ? "DUNG" : "SAI";
            if (this.lan_truoc_dung_sai && this.lan_truoc_dung_sai !== ketQuaHienTai) this.gay_1_tay_gan_nhat = true;
            else this.gay_1_tay_gan_nhat = false;
            this.lan_truoc_dung_sai = ketQuaHienTai;
            if (ketQuaHienTai === "DUNG") this.error_streak = 0; else this.error_streak++;

            // ✅ CẬP NHẬT ĐỘ CHÍNH XÁC VÀO HỆ THỐNG TỰ HỌC CỦA THUẬT TOÁN
            try{
                const isOK = ketQuaHienTai==="DUNG";
                learningData.b52.totalPredictions++;
                if(isOK) learningData.b52.correctPredictions++;
                learningData.b52.recentAccuracy.push(isOK?1:0);
                if(learningData.b52.recentAccuracy.length>20) learningData.b52.recentAccuracy.shift();
                learningData.b52.streakAnalysis.currentStreak = isOK ?
                    Math.max(1,learningData.b52.streakAnalysis.currentStreak+1) :
                    Math.min(-1,learningData.b52.streakAnalysis.currentStreak-1);
                if(isOK) learningData.b52.streakAnalysis.wins++;
                else learningData.b52.streakAnalysis.losses++;
                learningData.b52.streakAnalysis.bestStreak = Math.max(learningData.b52.streakAnalysis.bestStreak, learningData.b52.streakAnalysis.currentStreak);
                learningData.b52.streakAnalysis.worstStreak = Math.min(learningData.b52.streakAnalysis.worstStreak, learningData.b52.streakAnalysis.currentStreak);
                updateReversalState('b52', isOK);
                if(this.ketQuaNangCao?.allPatterns){
                    this.ketQuaNangCao.allPatterns.forEach(pt=>{
                        if(pt.patternId) updatePatternPerformance('b52', pt.patternId, (pt.prediction==='Tài'?'TAI':'XIU')===a);
                    });
                }
            }catch(e){}
        }
    }
}

// ============================================================
// 🟢 TIẾP TỤC GIỮ NGUYÊN 100% CÁC HÀM: loadHistory / saveHistory / saveStatsFile
//    autoVerify / autoPredict / collect / SERVER /sunvilong / SIGINT
// ============================================================

const predictor = new TX_LogicPen_V4();

function loadHistory() {
    try { if (fs.existsSync(DATA_FILE)) { const c = fs.readFileSync(DATA_FILE, 'utf-8'); const d=JSON.parse(c); return d.history || []; } }
    catch (e) { console.error(`Lỗi đọc file: ${e.message}`); }
    return [];
}
function saveHistory(history) {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const limitedHistory = history.slice(-MAX_STORAGE);
    fs.writeFileSync(DATA_FILE, JSON.stringify({ history: limitedHistory, total_sessions: limitedHistory.length, max_storage: MAX_STORAGE, last_updated: vnNow() }, null, 2));
    console.log(`💾 Đã lưu ${limitedHistory.length}/${MAX_STORAGE} phiên dữ liệu`);
}
function saveStatsFile() {
    const dir = path.dirname(STATS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATS_FILE, JSON.stringify({ ...stats, total_predictions_made: stats.total_predictions_made, max_predictions: MAX_PREDICTIONS, min_data_required: MIN_DATA_FOR_PREDICTION, max_storage: MAX_STORAGE, prediction_started: stats.prediction_started, last_updated: vnNow() }, null, 2));
}
function autoVerify(history) {
    if (stats.last_prediction && history.length > 0) {
        const lp = stats.last_prediction;
        const latest = history[history.length - 1];
        if (latest.phien === lp.phien) {
            const actual = latest.ket_qua || '';
            if (actual) {
                stats.total++;
                const a = actual.toUpperCase().replace('XỈU', 'XIU').replace('TÀI', 'TAI');
                const p = lp.prediction.toUpperCase().replace('XỈU', 'XIU').replace('TÀI', 'TAI');
                const ok = p === a;
                if (ok) stats.correct++; else stats.wrong++;
                predictor.updateStatus(actual);
                stats.history.push({ phien: latest.phien, prediction: lp.pred, actual: actual, confidence: lp.conf, correct: ok, timestamp: vnNow() });
                if (stats.history.length > 500) stats.history = stats.history.slice(-500);
                const acc = ((stats.correct / Math.max(stats.total, 1)) * 100).toFixed(1);
                console.log(`🔍 VERIFY #${latest.phien}: ${ok ? '✅ ĐÚNG' : '❌ SAI'} | Tỷ lệ: ${acc}% (${stats.correct}/${stats.total})`);
                stats.last_prediction = null;
                saveStatsFile();
            }
        }
    }
}
function autoPredict(history) {
    if (!stats.prediction_started) {
        if (history.length >= MIN_DATA_FOR_PREDICTION) { stats.prediction_started = true; console.log(`\n🎉 ĐÃ ĐỦ ${MIN_DATA_FOR_PREDICTION} PHIÊN! BẮT ĐẦU DỰ ĐOÁN...\n`); }
        else { console.log(`⏳ Đang thu thập: ${history.length}/${MIN_DATA_FOR_PREDICTION}. Còn ${MIN_DATA_FOR_PREDICTION - history.length} phiên`); return; }
    }
    if (stats.total_predictions_made >= MAX_PREDICTIONS) { console.log(`🏁 Đã đạt ${MAX_PREDICTIONS} dự đoán`); return; }
    if (history.length >= 5) {
        try {
            const r = predictor.predict(history);
            const cur = history[history.length - 1];
            let ph = cur.phien || 0;
            if (typeof ph === 'string') { const c = ph.replace('#',''); ph = !isNaN(c)?parseInt(c):0; }
            const nextPhien = ph + 1;
            stats.last_prediction = { phien: nextPhien, prediction: r.pred, confidence: r.conf };
            stats.total_predictions_made++;
            console.log(`🎯 #${nextPhien}: ${r.pred} | ${r.conf}% | ${r.type} | Còn ${MAX_PREDICTIONS - stats.total_predictions_made}`);
            duDoanHienTai = {
                phien: nextPhien, ket_qua: r.pred === "TAI" ? "TÀI" : "XỈU", do_tin_cay: r.conf,
                loai_cau: r.type, ly_do: r.reason,
                che_do: predictor.che_do_hien_tai === "DAO_TU_DONG" ? "🔄 ĐẢO TỰ ĐỘNG" : "🟢 BÌNH THƯỜNG",
                co_khuon: predictor.co_khuon_cau, ten_khuon: predictor.ten_khuon,
                thong_ke: { tong: stats.total, dung: stats.correct, sai: stats.wrong, ty_le: ((stats.correct / Math.max(stats.total,1)) * 100).toFixed(1) },
                cap_nhat_luc: vnNow()
            };
            saveStatsFile();
        } catch (e) { console.error(`Lỗi dự đoán: ${e.message}`); }
    }
}
function safeInt(v, d = 0) { const p = parseInt(v); return isNaN(p) ? d : p; }

async function collect() {
    console.log("🚀 SUNWIN TX COLLECTOR + THUẬT TOÁN HỌC MÁY V4");
    console.log("═══════════════════════════════════════════");
    console.log(`📊 Dữ liệu tối thiểu: ${MIN_DATA_FOR_PREDICTION} | Dự đoán tối đa: ${MAX_PREDICTIONS} | Lưu: ${MAX_STORAGE}`);
    console.log("⚙️ LOGIC: ĐẢO ⇄ GÃY 1 ⇄ BÌNH THƯỜNG | KHUÔN=KHÔNG ĐẢO | +40 MẪU +MARKOV +FIBO +MA +TỰ HỌC TRỌNG SỐ");
    console.log("🌐 /sunvilong");
    console.log("═══════════════════════════════════════════\n");
    let history = loadHistory();
    console.log(`📚 Đã có ${history.length} phiên`);
    try { if(fs.existsSync(STATS_FILE)){ const s=JSON.parse(fs.readFileSync(STATS_FILE,'utf8')); stats={...stats,...s}; }}catch(e){}
    while (true) {
        try {
            const res = await axios.get(API_URL, { timeout:15000 });
            if(res.status===200){
                const api=res.data.data||[];
                if(api.length>0){
                    const ex=new Set(history.map(h=>h.phien));
                    for(const it of api){
                        const ph=safeInt(it.Phien);
                        if(ph<=0||ex.has(ph))continue;
                        history.push({ phien:ph, ket_qua:String(it.Ket_qua||""), tong:safeInt(it.Tong), xuc_xac_1:safeInt(it.Xuc_xac_1), xuc_xac_2:safeInt(it.Xuc_xac_2), xuc_xac_3:safeInt(it.Xuc_xac_3) });
                        ex.add(ph);
                    }
                    if(history.length>MAX_STORAGE) history=history.slice(-MAX_STORAGE);
                    history.sort((a,b)=>a.phien-b.phien);
                    saveHistory(history);
                    const l=history[history.length-1];
                    console.log(`🎲 #${l.phien}: ${l.ket_qua} [${l.xuc_xac_1},${l.xuc_xac_2},${l.xuc_xac_3}]=${l.tong} | ${history.length}/${MIN_DATA_FOR_PREDICTION}`);
                    autoVerify(history);
                    autoPredict(history);
                    if(stats.prediction_started && stats.total_predictions_made>=MAX_PREDICTIONS){
                        console.log(`🎯 HOÀN THÀNH | ${stats.correct}/${stats.total} = ${((stats.correct/Math.max(stats.total,1))*100).toFixed(2)}%`);
                        process.exit(0);
                    }
                }
            }
        } catch(e){ console.error(`❌ ${e.message}`); }
        await new Promise(r=>setTimeout(r,3000));
    }
}

const PORT = process.env.PORT || 10000;
const healthServer = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    if (url === "/sunvilong") {
        const json = JSON.stringify(duDoanHienTai, null, 2);
        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>🌞 SUNWIN TX</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{background:#0b1020;color:#fff;font-family:Arial;margin:0;padding:20px}
.box{max-width:520px;margin:20px auto;background:#121a33;padding:22px;border-radius:14px;box-shadow:0 0 22px #00e1ff55}
h1{text-align:center;color:#00e1ff;margin:0 0 14px}
.line{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px dashed #23305a}
.kq{font-size:44px;font-weight:900;text-align:center;padding:14px;color:#ffd24a;margin:8px 0}
.tai{color:#ff4d4d}.xiu{color:#3ddc84}.ok{color:#3ddc84}.bad{color:#ff4d4d}
.footer{text-align:center;color:#889;font-size:12px;margin-top:14px}</style></head><body>
<div class="box">
<h1>🎯 DỰ ĐOÁN #${duDoanHienTai.phien}</h1>
<div class="kq ${duDoanHienTai.ket_qua==='TÀI'?'tai':'xiu'}">${duDoanHienTai.ket_qua}</div>
<div class="line"><span>🔢 Phiên</span><b>#${duDoanHienTai.phien}</b></div>
<div class="line"><span>📊 Độ tin cậy</span><b class="${duDoanHienTai.do_tin_cay>=80?'ok':''}">${duDoanHienTai.do_tin_cay}%</b></div>
<div class="line"><span>🧩 Loại cầu</span><b>${duDoanHienTai.loai_cau}</b></div>
<div class="line"><span>⚙️ Chế độ</span><b>${duDoanHienTai.che_do}</b></div>
<div class="line"><span>🎭 Khuôn</span><b>${duDoanHienTai.co_khuon?'✅ '+duDoanHienTai.ten_khuon:'❌ KHÔNG'}</b></div>
<div class="line"><span>📝 Lý do</span><span style="text-align:right;max-width:60%">${duDoanHienTai.ly_do}</span></div>
<hr style="border-color:#23305a;margin:10px 0">
<div class="line"><span>📈 Tổng</span><b>${duDoanHienTai.thong_ke.tong}</b></div>
<div class="line"><span>✅ Đúng</span><b class="ok">${duDoanHienTai.thong_ke.dung}</b></div>
<div class="line"><span>❌ Sai</span><b class="bad">${duDoanHienTai.thong_ke.sai}</b></div>
<div class="line"><span>🏆 Tỷ lệ</span><b class="ok">${duDoanHienTai.thong_ke.ty_le}%</b></div>
<div class="footer">⏰ ${duDoanHienTai.cap_nhat_luc.replace('T',' ').slice(0,19)}</div>
</div></body></html>`;
        if(req.url.includes('json')||req.headers.accept?.includes('application/json')){
            res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'}); res.end(json);
        }else{ res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); res.end(html); }
        return;
    }
    res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});
    res.end(`OK | ${vnNow()} | ${predictor.che_do_hien_tai} | /sunvilong ✅`);
});
healthServer.listen(PORT, () => {
    console.log(`🌐 SERVER: ${PORT} → /sunvilong`);
});
process.on('SIGINT', () => {
    console.log("\n🛑 Dừng..."); healthServer.close(); saveStatsFile(); console.log("✅ Đã lưu"); process.exit();
});
collect().catch(console.error);