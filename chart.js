/**
 * Premium Interactive Stock Charting Engine
 * Renders HD Candlesticks, Moving Averages, Bollinger Bands, Volume, Crosshair, and Custom Annotations.
 */

class StockChart {
  constructor(canvasId, loaderId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.loader = document.getElementById(loaderId);
    
    this.data = [];
    this.visibleBars = 45; // Number of bars to display
    
    // Theme Colors
    this.colorUp = '#ff453a';
    this.colorDown = '#30d158';
    this.colorBg = '#0c1324';
    this.colorGrid = 'rgba(255, 255, 255, 0.03)';
    this.colorCrosshair = 'rgba(10, 132, 255, 0.4)';
    this.colorText = '#8e9bb4';
    
    // Interactions
    this.mouse = { x: -1, y: -1, active: false };
    this.lastWidth = 0;
    this.lastHeight = 0;
    this.pendingRender = false;
    
    this.initEvents();
  }

  setData(historyData) {
    this.data = historyData;
    if (this.loader) this.loader.style.display = 'none';
    this.requestRender();
  }

  initEvents() {
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      // Adjust for canvas backing store resolution
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;

      this.mouse.x = (e.clientX - rect.left) * scaleX;
      this.mouse.y = (e.clientY - rect.top) * scaleY;
      this.mouse.active = true;
      this.requestRender();
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.mouse.active = false;
      this.requestRender();
    });

    // Resize observer to handle dynamic grid layout/card size shifts
    if (window.ResizeObserver) {
      const resizeObserver = new ResizeObserver(() => {
        this.resize();
      });
      resizeObserver.observe(this.canvas.parentElement);
    } else {
      window.addEventListener('resize', () => {
        this.resize();
      });
    }
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const nextWidth = Math.round(rect.width * window.devicePixelRatio);
    const nextHeight = Math.round(rect.height * window.devicePixelRatio);
    if (nextWidth === this.lastWidth && nextHeight === this.lastHeight) return;

    this.lastWidth = nextWidth;
    this.lastHeight = nextHeight;
    this.canvas.width = nextWidth;
    this.canvas.height = nextHeight;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.requestRender();
  }

  requestRender() {
    if (this.pendingRender) return;
    this.pendingRender = true;
    requestAnimationFrame(() => {
      this.pendingRender = false;
      this.render();
    });
  }

  render() {
    if (!this.data || this.data.length === 0) return;

    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Clear Canvas
    ctx.fillStyle = this.colorBg;
    ctx.fillRect(0, 0, width, height);

    // Get the most recent visible bars
    const visibleData = this.data.slice(-this.visibleBars);
    if (visibleData.length === 0) return;

    // Layout configuration
    const paddingRight = 75; // for price axis
    const paddingLeft = 20;
    const paddingTop = 30;
    const volumeHeight = height * 0.20;
    const gap = 15;
    const mainHeight = height - paddingTop - volumeHeight - gap - 25; // Main K-line area height
    
    const chartWidth = width - paddingLeft - paddingRight;

    // 1. Calculate price extremes (including Bollinger Bands if enabled)
    let minPrice = Infinity;
    let maxPrice = -Infinity;

    visibleData.forEach(bar => {
      minPrice = Math.min(minPrice, bar.low);
      maxPrice = Math.max(maxPrice, bar.high);

      if (bar.bbUpper !== null && bar.bbUpper !== undefined) {
        maxPrice = Math.max(maxPrice, bar.bbUpper);
      }
      if (bar.bbLower !== null && bar.bbLower !== undefined) {
        minPrice = Math.min(minPrice, bar.bbLower);
      }
    });

    // Add 5% buffer on top and bottom
    const priceRange = maxPrice - minPrice;
    minPrice -= priceRange * 0.05;
    maxPrice += priceRange * 0.05;
    const updatedRange = maxPrice - minPrice;

    // Helper functions for Coordinate Conversions
    const getX = (index) => paddingLeft + (index + 0.5) * (chartWidth / this.visibleBars);
    const getY = (price) => paddingTop + mainHeight - ((price - minPrice) / updatedRange) * mainHeight;
    const getVolY = (vol) => height - 25 - (vol / maxVol) * volumeHeight;

    // Calculate max volume
    const maxVol = Math.max(...visibleData.map(d => d.volume));

    // Draw Grid Lines (Y-Axis Prices)
    const gridRows = 5;
    ctx.strokeStyle = this.colorGrid;
    ctx.lineWidth = 1;
    ctx.fillStyle = this.colorText;
    ctx.font = '11px Outfit, Inter, sans-serif';
    ctx.textAlign = 'left';
    
    for (let i = 0; i <= gridRows; i++) {
      const price = minPrice + (updatedRange * i / gridRows);
      const y = getY(price);
      
      // Draw horizontal grid line
      ctx.beginPath();
      ctx.moveTo(paddingLeft, y);
      ctx.lineTo(paddingLeft + chartWidth, y);
      ctx.stroke();

      // Draw price tag on axis
      ctx.fillText(price.toFixed(1), paddingLeft + chartWidth + 8, y + 4);
    }

    // 2. RENDER BOLLINGER BANDS (Semi-transparent background ribbon + dashed lines)
    if (visibleData[0].bbUpper !== null && visibleData[0].bbUpper !== undefined && window.showBB) {
      // Draw the Bollinger Ribbon
      ctx.fillStyle = 'rgba(191, 90, 242, 0.05)';
      ctx.beginPath();
      ctx.moveTo(getX(0), getY(visibleData[0].bbUpper));
      
      for (let i = 1; i < visibleData.length; i++) {
        if (visibleData[i].bbUpper) ctx.lineTo(getX(i), getY(visibleData[i].bbUpper));
      }
      for (let i = visibleData.length - 1; i >= 0; i--) {
        if (visibleData[i].bbLower) ctx.lineTo(getX(i), getY(visibleData[i].bbLower));
      }
      ctx.closePath();
      ctx.fill();

      // Draw Upper Band
      ctx.strokeStyle = 'rgba(191, 90, 242, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      visibleData.forEach((bar, idx) => {
        if (idx === 0) ctx.moveTo(getX(idx), getY(bar.bbUpper));
        else ctx.lineTo(getX(idx), getY(bar.bbUpper));
      });
      ctx.stroke();

      // Draw Lower Band
      ctx.beginPath();
      visibleData.forEach((bar, idx) => {
        if (idx === 0) ctx.moveTo(getX(idx), getY(bar.bbLower));
        else ctx.lineTo(getX(idx), getY(bar.bbLower));
      });
      ctx.stroke();

      // Draw Middle Band (SMA20)
      ctx.strokeStyle = 'rgba(191, 90, 242, 0.25)';
      ctx.beginPath();
      visibleData.forEach((bar, idx) => {
        if (idx === 0) ctx.moveTo(getX(idx), getY(bar.bbMiddle));
        else ctx.lineTo(getX(idx), getY(bar.bbMiddle));
      });
      ctx.stroke();
      ctx.setLineDash([]); // Reset
    }

    // 3. RENDER MOVING AVERAGES (SMA 5, 20, 60)
    if (window.showMA) {
      const renderMA = (period, color) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        let started = false;
        visibleData.forEach((bar, idx) => {
          const val = bar[`sma${period}`];
          if (val !== null && val !== undefined) {
            const y = getY(val);
            if (!started) {
              ctx.moveTo(getX(idx), y);
              started = true;
            } else {
              ctx.lineTo(getX(idx), y);
            }
          }
        });
        ctx.stroke();
      };

      renderMA(5, '#ffd60a');
      renderMA(20, '#0a84ff');
      renderMA(60, '#bf5af2');
    }

    // 4. RENDER CANDLESTICKS (K-Line Sticks)
    const barWidth = (chartWidth / this.visibleBars) * 0.7;

    visibleData.forEach((bar, idx) => {
      const x = getX(idx);
      const isUp = bar.close >= bar.open;
      const color = isUp ? this.colorUp : this.colorDown;

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;

      // Draw shadow (high-low wick)
      ctx.beginPath();
      ctx.moveTo(x, getY(bar.high));
      ctx.lineTo(x, getY(bar.low));
      ctx.stroke();

      // Draw candle body (open-close rect)
      ctx.fillStyle = isUp ? this.colorBg : color; // Filled red outlines, solid green bodies (Taiwan convention)
      if (isUp) {
        ctx.fillStyle = 'rgba(255, 69, 58, 0.15)'; // slightly translucent red glow
      }
      ctx.fillRect(x - barWidth / 2, getY(Math.max(bar.open, bar.close)), barWidth, Math.abs(getY(bar.open) - getY(bar.close)));
      ctx.strokeRect(x - barWidth / 2, getY(Math.max(bar.open, bar.close)), barWidth, Math.abs(getY(bar.open) - getY(bar.close)));
    });

    // 5. RENDER VOLUME BARS
    visibleData.forEach((bar, idx) => {
      const x = getX(idx);
      const isUp = bar.close >= bar.open;
      const color = isUp ? this.colorUp : this.colorDown;
      const y = getVolY(bar.volume);

      ctx.fillStyle = isUp ? 'rgba(255, 69, 58, 0.4)' : 'rgba(48, 209, 88, 0.4)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      
      ctx.fillRect(x - barWidth / 2, y, barWidth, height - 25 - y);
      ctx.strokeRect(x - barWidth / 2, y, barWidth, height - 25 - y);
    });

    // Draw date labels on X-axis (every 10 bars)
    ctx.fillStyle = this.colorText;
    ctx.textAlign = 'center';
    visibleData.forEach((bar, idx) => {
      if (idx % 10 === 0) {
        const x = getX(idx);
        // Date formatting MM/DD
        const parts = bar.date.split('-');
        const dateStr = parts.length > 2 ? `${parts[1]}/${parts[2]}` : bar.date;
        ctx.fillText(dateStr, x, height - 8);
      }
    });

    // 6. DRAW STUNNING ARTWORK ANNOTATIONS (Exactly matching the user image)
    this.drawAnnotations(ctx, visibleData, getX, getY, getVolY);

    // 7. CROSSHAIR AND INTERACTIVE TOOLTIP
    if (this.mouse.active && this.mouse.x >= paddingLeft && this.mouse.x <= paddingLeft + chartWidth) {
      // Find active bar index
      const colWidth = chartWidth / this.visibleBars;
      const hoverIndex = Math.floor((this.mouse.x - paddingLeft) / colWidth);
      
      if (hoverIndex >= 0 && hoverIndex < visibleData.length) {
        const activeBar = visibleData[hoverIndex];
        const crosshairX = getX(hoverIndex);
        const crosshairY = this.mouse.y;

        // Draw vertical crosshair line
        ctx.strokeStyle = this.colorCrosshair;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([2, 3]);
        
        ctx.beginPath();
        ctx.moveTo(crosshairX, paddingTop);
        ctx.lineTo(crosshairX, height - 25);
        ctx.stroke();

        // Draw horizontal crosshair line
        if (crosshairY >= paddingTop && crosshairY <= paddingTop + mainHeight) {
          ctx.beginPath();
          ctx.moveTo(paddingLeft, crosshairY);
          ctx.lineTo(paddingLeft + chartWidth, crosshairY);
          ctx.stroke();

          // Draw active price tag on Y axis
          const hoverPrice = maxPrice - ((crosshairY - paddingTop) / mainHeight) * updatedRange;
          ctx.fillStyle = varColor('highlight');
          ctx.fillRect(paddingLeft + chartWidth + 2, crosshairY - 10, 70, 20);
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 11px Outfit, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(hoverPrice.toFixed(1), paddingLeft + chartWidth + 8, crosshairY + 4);
        }
        ctx.setLineDash([]); // reset

        // Dynamic chart overlays (Top Left text update based on hover)
        this.drawHoverIndicators(ctx, activeBar);
      }
    } else {
      // Render the latest bar information as default values
      const latestBar = visibleData[visibleData.length - 1];
      this.drawHoverIndicators(ctx, latestBar);
    }
  }

  // Draw indicators detail overlays
  drawHoverIndicators(ctx, bar) {
    ctx.textAlign = 'left';
    ctx.font = '11px Outfit, Inter, sans-serif';
    
    // SMA row
    ctx.fillStyle = varColor('warning');
    ctx.fillText(`SMA5: ${bar.sma5 ? bar.sma5.toFixed(1) : '--'}`, 15, 20);
    ctx.fillStyle = varColor('highlight');
    ctx.fillText(`SMA20: ${bar.sma20 ? bar.sma20.toFixed(1) : '--'}`, 110, 20);
    ctx.fillStyle = varColor('purple');
    ctx.fillText(`SMA60: ${bar.sma60 ? bar.sma60.toFixed(1) : '--'}`, 210, 20);
    
    // Bollinger row
    if (bar.bbUpper) {
      ctx.fillStyle = '#a8b2c4';
      ctx.fillText(`布林上軌: ${bar.bbUpper.toFixed(1)}`, 320, 20);
      ctx.fillText(`布林中軌: ${bar.bbMiddle.toFixed(1)}`, 430, 20);
      ctx.fillText(`布林下軌: ${bar.bbLower.toFixed(1)}`, 540, 20);
    }

    // KD/MACD dynamic HUD updates inside window
    document.getElementById('valSma5').innerText = bar.sma5 ? bar.sma5.toFixed(1) : '--';
    document.getElementById('valSma20').innerText = bar.sma20 ? bar.sma20.toFixed(1) : '--';
    document.getElementById('valSma60').innerText = bar.sma60 ? bar.sma60.toFixed(1) : '--';
  }

  // Exact annotations from the user image
  drawAnnotations(ctx, visibleData, getX, getY, getVolY) {
    if (visibleData.length < 35) return;
    
    // Get indexes representing locations on the chart
    // We will place annotations relative to specific patterns or dates deterministically
    const len = visibleData.length;
    
    // 1. "高檔震盪" Annotation (near recent price peaks)
    const peakIdx = len - 10;
    const peakBar = visibleData[peakIdx];
    this.drawLabel(ctx, getX(peakIdx) - 15, getY(peakBar.high) - 30, "高檔震盪", '#ff453a');

    // 2. "回檔支撐區 1950~2000" (near the mid part of the chart)
    const supIdx = len - 18;
    const supBar = visibleData[supIdx];
    this.drawDottedBox(ctx, getX(supIdx) - 45, getY(1975) - 10, 90, 20, "回檔支撐區\n1950~2000", '#0a84ff');

    // 3. "強勢突破，留意高檔震盪" (recent breakouts)
    const breakIdx = len - 4;
    const breakBar = visibleData[breakIdx];
    this.drawArrowText(ctx, getX(breakIdx), getY(breakBar.close) + 20, getX(breakIdx), getY(breakBar.close) - 5, "強勢突破，\n留意高檔震盪", '#ff453a');

    // 4. "壓力帶 賣壓增強 多方進攻未變" (near upper Bollinger)
    if (peakBar.bbUpper) {
      this.drawArrowText(ctx, getX(peakIdx) + 50, getY(peakBar.bbUpper) - 10, getX(peakIdx) + 5, getY(peakBar.bbUpper) - 2, "壓力帶\n賣壓增強\n多方進攻未變", '#bf5af2');
    }
  }

  // Drawing Helper: Dotted box with text
  drawDottedBox(ctx, x, y, w, h, text, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(12, 19, 36, 0.8)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = '#fff';
    ctx.font = '9px Inter, sans-serif';
    ctx.textAlign = 'center';
    
    const lines = text.split('\n');
    if (lines.length === 1) {
      ctx.fillText(text, x + w / 2, y + h / 2 + 3);
    } else {
      ctx.fillText(lines[0], x + w / 2, y + h / 2 - 2);
      ctx.fillText(lines[1], x + w / 2, y + h / 2 + 8);
    }
  }

  // Drawing Helper: Arrow with text pointing to coordinates
  drawArrowText(ctx, fromX, fromY, toX, toY, text, color) {
    // Draw Arrow
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.2;

    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    // Arrow tip
    const angle = Math.atan2(toY - fromY, toX - fromX);
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - 6 * Math.cos(angle - Math.PI / 6), toY - 6 * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - 6 * Math.cos(angle + Math.PI / 6), toY - 6 * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();

    // Text details
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px Inter, sans-serif';
    ctx.textAlign = 'center';
    
    const lines = text.split('\n');
    const textY = fromY > toY ? fromY + 12 : fromY - 10;
    lines.forEach((line, i) => {
      ctx.fillText(line, fromX, textY + (i * 10));
    });
  }

  // Drawing Helper: Simple tag/label
  drawLabel(ctx, x, y, text, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 50, 16);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, x + 25, y + 11);
  }
}

// Global utility helper to fetch variables from CSS styles
function varColor(name) {
  const styles = getComputedStyle(document.documentElement);
  return styles.getPropertyValue(`--color-${name}`).trim();
}

window.StockChart = StockChart;
window.showBB = true;
window.showMA = true;
