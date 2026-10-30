/* 調整する数値はここにまとめています。長さは盤面の幅を1とする比率。 */
const GAME_CONFIG = Object.freeze({
  initialCoins: 1000,
  blind: 100,
  topUpAmounts: [500, 1000, 3000, 5000, 10000],
  drawingCostPerUnit: 5,
  drawingCostUnitLength: 0.25,
  maxArea: 0.85,
  historyLimit: 20,
  closureTolerancePx: 24,
  // 面積と期待払戻率の節点。節点間は期待払戻率を線形補間。
  returnAnchors: [[0.10, 1], [0.50, 1], [0.60, 0.99], [0.70, 0.98], [0.80, 0.96], [0.85, 0.935]],
  maxMultiplier: 10,
  dropDuration: 1100
});
if (typeof module !== 'undefined') module.exports = GAME_CONFIG;
