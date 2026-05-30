# Stock Analysis

## Trading Signal Disclaimer

本網站提供的技術指標、AI 分析、主力吃貨判斷、ETF 折溢價提示、買賣訊號、進出場建議與任何價格區間，僅供學習、研究與個人投資決策輔助參考，不構成任何投資建議、招攬、承諾獲利或保證報酬。

股票、ETF 與其他金融商品皆存在市場風險，價格可能因總體經濟、產業變化、公司基本面、流動性、政策、匯率與市場情緒等因素波動。使用者應自行判斷並承擔所有交易風險，任何依據本網站訊號或分析所進行的買進、賣出、停損、加碼、減碼或持有決策，其盈虧結果均由使用者自行負責。

本網站資料可能來自第三方 API、公開資料、模擬資料或演算法推估，可能存在延遲、錯誤、缺漏或不適用情況。進行任何交易前，請務必再次核對正式交易平台、公開資訊觀測站、基金公司或券商提供的最新資料；必要時請諮詢合格金融專業人士。

智慧看盤與 AI 個股顧問靜態網頁工具，整合台股資料、技術指標、籌碼推估與 Gemini AI 問答分析。

## Demo

- GitHub Pages: https://kuojack.github.io/stock-analysis/
- GitHub Repository: https://github.com/kuojack/stock-analysis

## Features

- 台股個股查詢與快速切換清單
- K 線圖、均線、布林通道與技術指標視覺化
- 三大法人籌碼資料查詢；FinMind 不可用時會回退到推估資料
- Gemini AI 個股顧問，可根據目前股票資料提供分析
- 自選股清單儲存在瀏覽器 localStorage
- API Key 以使用者 PIN 加密後儲存在瀏覽器 localStorage

## Data Sources

- 股市行情、台股基本資料與三大法人買賣超資料主要來自 FinMind API。
- 未提供 FinMind Token 時，網站會優先使用 FinMind 公開資料；若 FinMind 暫時不可用，部分籌碼或展示資料會標示為量價推估或本地模擬資料。
- ETF 折溢價與 NAV 區塊目前為本地估算，非投信或交易所官方即時淨值；正式交易前請再次核對官方 iNAV、淨值與券商報價。

## API Keys

此專案是純前端靜態網站，不需要後端伺服器。使用者可在網頁內設定：

- FinMind API Token：選填，用於取得較完整的台股資料
- Google AI Studio Gemini API Key：必填，用於 AI 分析功能
- PIN：用於在本機瀏覽器加密與解密 API Key

API Key 不會被提交到 GitHub，也不會存在此 repository。它們只會在使用者自己的瀏覽器中，以加密後的資料存在 localStorage。

注意：因為此網站部署在 GitHub Pages 且所有程式都在瀏覽器端執行，解密後的 API Key 在使用期間會存在瀏覽器記憶體中，並由瀏覽器直接送出 API request。這適合個人使用，但不等同於後端伺服器保存 secret；請勿在不可信任的裝置或瀏覽器環境中使用高權限 API Key。

## Local Usage

此專案沒有建置步驟。可以直接用瀏覽器開啟：

```text
index.html
```

或在資料夾中啟動任何靜態檔案伺服器後瀏覽。

## Project Structure

```text
.
├── index.html   # Main page and UI markup
├── styles.css   # Layout and visual styles
├── app.js       # UI controller, state handling, watchlist, Gemini workflow
├── data.js      # FinMind integration, mock data, indicators, Gemini API call
├── chart.js     # Canvas chart rendering
└── crypto.js    # Web Crypto API encryption/decryption for API keys
```

## Deployment

目前使用 GitHub Pages 發布：

- Branch: `main`
- Source path: `/`
- Published URL: https://kuojack.github.io/stock-analysis/

更新網站時，提交並推送到 `main` 後，GitHub Pages 會自動重新部署。

## Security Notes

- Repository 內不應提交任何實際 API Key、token、secret 或 password。
- 若懷疑 API Key 已外洩，請立即到對應服務後台撤銷並重新建立。
- 若未來要公開給多人使用，建議改成後端代理 API，由後端保存 Gemini/FinMind 金鑰，前端不直接接觸 secret。
