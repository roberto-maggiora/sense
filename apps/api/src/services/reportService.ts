import PDFDocument from "pdfkit";
import { DeviceAlarmRule } from "@prisma/client";

// Filter out 1-sample spikes for reporting purposes
export const MIN_BREACH_DURATION_MS = 60 * 1000;

export type Breach = {
    start: Date;
    end: Date;
    durationMs: number;
    peakValue: number;
    thresholds: { min?: number; max?: number };
    isPeakGt: boolean;
};

export type ReportStats = {
    min: number;
    max: number;
    avg: number;
    totalTimeWindowMs: number;
    totalTimeOutsideMs: number;
    timeAboveMaxMs: number;
    timeBelowMinMs: number;
    percentCompliant: number;
    totalBreaches: number;
    longestBreachMs: number;
    instantBreaches: number;
};

// Self-contained metric metadata – mirrors viewer's lib/metrics.ts so the PDF
// can compute units/decimals without importing frontend code.
const METRIC_META_PDF: Record<string, { unitSuffix: string; decimals: number }> = {
    temperature: { unitSuffix: '°C', decimals: 1 },
    humidity: { unitSuffix: '%', decimals: 1 },
    co2: { unitSuffix: ' ppm', decimals: 0 },
    barometric_pressure: { unitSuffix: ' hPa', decimals: 1 },
};

function getMetricMeta(metric: string) {
    return METRIC_META_PDF[metric] ?? { unitSuffix: '', decimals: 1 };
}

export type ReportData = {
    clientName: string;
    siteName: string;
    areaName: string;
    deviceName: string;
    metric: string;       // canonical parameter key (e.g. "temperature", "co2")
    metricLabel: string;
    timezone?: string;
    fromDate: Date;
    toDate: Date;
    generatedAt: Date;
    stats: ReportStats;
    breaches: Breach[];
    activeRules: DeviceAlarmRule[];
    points: { occurred_at: Date; value: number }[];   // telemetry data for chart
};

export function formatDateEU(d: Date, tz: string = "Europe/London", showTime = true) {
    const opts: Intl.DateTimeFormatOptions = {
        timeZone: tz,
        day: '2-digit', month: '2-digit', year: 'numeric',
        ...(showTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {})
    };

    // Fallback to strict parts extraction to avoid browser/OS specific comma quirks
    const parts = new Intl.DateTimeFormat('en-GB', opts).formatToParts(d);
    let day = '', month = '', year = '', hour = '', minute = '';

    for (const p of parts) {
        if (p.type === 'day') day = p.value;
        if (p.type === 'month') month = p.value;
        if (p.type === 'year') year = p.value;
        if (p.type === 'hour') hour = p.value;
        if (p.type === 'minute') minute = p.value;
    }

    if (showTime) return `${day}/${month}/${year} ${hour}:${minute}`;
    return `${day}/${month}/${year}`;
}

export function extractThresholds(rules: DeviceAlarmRule[]) {
    let allowedMin: number | null = null;
    let allowedMax: number | null = null;

    for (const r of rules) {
        if (!r.enabled) continue;
        if (r.operator === "lt") {
            if (allowedMin === null || r.threshold > allowedMin) {
                allowedMin = r.threshold;
            }
        } else if (r.operator === "gt") {
            if (allowedMax === null || r.threshold < allowedMax) {
                allowedMax = r.threshold;
            }
        }
    }
    return { allowedMin, allowedMax };
}

export function segmentBreaches(
    points: { occurred_at: Date; value: number }[],
    allowedMin: number | null,
    allowedMax: number | null,
    gapMinutes: number = 10
): Breach[] {
    const breaches: Breach[] = [];
    if (!points.length || (allowedMin === null && allowedMax === null)) return breaches;

    const gapMs = gapMinutes * 60 * 1000;
    let currentBreach: Breach | null = null;

    for (const p of points) {
        const isBreachingMax = allowedMax !== null && p.value > allowedMax;
        const isBreachingMin = allowedMin !== null && p.value < allowedMin;
        const isBreaching = isBreachingMax || isBreachingMin;

        if (isBreaching) {
            if (!currentBreach) {
                currentBreach = {
                    start: p.occurred_at,
                    end: p.occurred_at,
                    durationMs: 0,
                    peakValue: p.value,
                    thresholds: { min: allowedMin || undefined, max: allowedMax || undefined },
                    isPeakGt: isBreachingMax,
                };
            } else {
                const timeSinceLast = p.occurred_at.getTime() - currentBreach.end.getTime();
                if (timeSinceLast > gapMs) {
                    currentBreach.durationMs = currentBreach.end.getTime() - currentBreach.start.getTime();
                    breaches.push(currentBreach);
                    currentBreach = {
                        start: p.occurred_at,
                        end: p.occurred_at,
                        durationMs: 0,
                        peakValue: p.value,
                        thresholds: { min: allowedMin || undefined, max: allowedMax || undefined },
                        isPeakGt: isBreachingMax,
                    };
                } else {
                    currentBreach.end = p.occurred_at;
                    if (isBreachingMax) {
                        currentBreach.peakValue = Math.max(currentBreach.peakValue, p.value);
                    } else {
                        currentBreach.peakValue = Math.min(currentBreach.peakValue, p.value);
                    }
                }
            }
        } else {
            if (currentBreach) {
                currentBreach.durationMs = currentBreach.end.getTime() - currentBreach.start.getTime();
                breaches.push(currentBreach);
                currentBreach = null;
            }
        }
    }

    if (currentBreach) {
        currentBreach.durationMs = currentBreach.end.getTime() - currentBreach.start.getTime();
        breaches.push(currentBreach);
    }

    return breaches;
}

export function computeStats(
    points: { occurred_at: Date; value: number }[],
    breaches: Breach[],
    from: Date,
    to: Date
): ReportStats {
    if (!points.length) {
        return {
            min: 0,
            max: 0,
            avg: 0,
            totalTimeWindowMs: Math.max(0, to.getTime() - from.getTime()),
            totalTimeOutsideMs: 0,
            timeAboveMaxMs: 0,
            timeBelowMinMs: 0,
            percentCompliant: 100,
            totalBreaches: 0,
            longestBreachMs: 0,
            instantBreaches: 0,
        };
    }

    let min = points[0].value;
    let max = points[0].value;
    let sum = 0;

    for (const p of points) {
        if (p.value < min) min = p.value;
        if (p.value > max) max = p.value;
        sum += p.value;
    }

    const avg = sum / points.length;
    const totalTimeWindowMs = Math.max(0, to.getTime() - from.getTime());

    let totalTimeOutsideMs = 0;
    let timeAboveMaxMs = 0;
    let timeBelowMinMs = 0;
    let longestBreachMs = 0;
    let reportableBreaches = 0;
    let instantBreaches = 0;

    for (const b of breaches) {
        totalTimeOutsideMs += b.durationMs;

        if (b.durationMs >= MIN_BREACH_DURATION_MS) {
            reportableBreaches++;
            if (b.durationMs > longestBreachMs) longestBreachMs = b.durationMs;
        } else {
            instantBreaches++;
        }

        if (b.isPeakGt) {
            timeAboveMaxMs += b.durationMs;
        } else {
            timeBelowMinMs += b.durationMs;
        }
    }

    let percentCompliant = 100;
    if (totalTimeWindowMs > 0) {
        percentCompliant = Math.max(0, 100 - (totalTimeOutsideMs / totalTimeWindowMs) * 100);
    }

    return {
        min,
        max,
        avg,
        totalTimeWindowMs,
        totalTimeOutsideMs,
        timeAboveMaxMs,
        timeBelowMinMs,
        percentCompliant,
        totalBreaches: reportableBreaches,
        longestBreachMs,
        instantBreaches,
    };
}

export function generatePdf(data: ReportData): PDFKit.PDFDocument {
    const doc = new PDFDocument({ margin: 50 });
    const { unitSuffix: unit, decimals } = getMetricMeta(data.metric);
    const fmtVal = (v: number) => v.toFixed(decimals) + unit;

    // --- Footer logic (added to every page) ---
    // We listen to the pageAdded event so we can apply the footer to all pages,
    // including the first page.
    const addFooter = () => {
        const bottom = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        doc.fontSize(8).font("Helvetica-Oblique").fillColor("gray");
        doc.text(
            "Report generated automatically by Hawk Safety monitoring platform. Compliance is calculated as time within configured thresholds divided by total monitored time.",
            50,
            doc.page.height - 40,
            { align: "center", width: doc.page.width - 100 }
        );
        doc.fillColor("black").font("Helvetica");
        doc.page.margins.bottom = bottom;
    };
    doc.on("pageAdded", addFooter);

    // --- Header ---
    // Left Block: Title
    doc.fontSize(22).font("Helvetica-Bold").text("Device Compliance Report", 50, 50);
    doc.fontSize(12).font("Helvetica").text(`Generated: ${formatDateEU(data.generatedAt, data.timezone)}`, 50, 80);

    // Right Block: Metadata
    const metaX = 350;
    const metaY = 50;
    doc.fontSize(10).font("Helvetica-Bold");
    doc.text("Client:", metaX, metaY);
    doc.text("Site:", metaX, metaY + 15);
    doc.text("Area:", metaX, metaY + 30);
    doc.text("Device:", metaX, metaY + 45);
    doc.text("Metric:", metaX, metaY + 60);
    doc.text("Period:", metaX, metaY + 75);

    const metaValX = 400;
    doc.font("Helvetica");
    doc.text(data.clientName, metaValX, metaY);
    doc.text(data.siteName || "N/A", metaValX, metaY + 15);
    doc.text(data.areaName || "N/A", metaValX, metaY + 30);
    doc.text(data.deviceName, metaValX, metaY + 45);
    doc.text(data.metricLabel, metaValX, metaY + 60);
    doc.text(`${formatDateEU(data.fromDate, data.timezone, false)} to ${formatDateEU(data.toDate, data.timezone, false)}`, metaValX, metaY + 75);

    doc.moveTo(50, 150).lineTo(550, 150).stroke();

    // --- Compliance Status Block ---
    doc.y = 170;
    doc.fontSize(16).font("Helvetica-Bold").text(`${data.metricLabel} Compliance`, 50, doc.y);
    doc.moveDown(0.5);

    if (data.activeRules.length > 0) {
        const pct = data.stats.percentCompliant;
        let color = "red";
        if (pct >= 95) color = "green";
        else if (pct >= 80) color = "orange"; // amber

        doc.fontSize(36).font("Helvetica-Bold").fillColor(color).text(`${pct.toFixed(1)} %`, { align: 'left' });
        doc.fillColor("black");

        doc.moveDown(0.2);
        const explanation = pct >= 95 ? "Within acceptable limits for most of the monitoring period."
            : pct >= 80 ? "Minor deviations detected during the monitoring period."
                : "Significant deviations detected during the monitoring period.";
        doc.fontSize(12).font("Helvetica").text(explanation);

        doc.moveDown(0.5);
        // Draw horizontal compliance bar
        const barWidth = 500;
        const barHeight = 8;
        const barY = doc.y;
        doc.rect(50, barY, barWidth, barHeight).fillColor("#eeeeee").fill();
        doc.rect(50, barY, barWidth * (pct / 100), barHeight).fillColor(color).fill();
        doc.fillColor("black");
    } else {
        doc.fontSize(14).font("Helvetica-Oblique").text("No active thresholds configured for this metric during the selected period.");
        doc.font("Helvetica");
    }

    doc.y += 30;

    // --- Summary Metrics ---
    doc.fontSize(15).font("Helvetica-Bold").text("Summary Metrics", 50, doc.y);
    doc.moveDown(0.5);

    const ltRules = data.activeRules.filter((r) => r.operator === "lt");
    const gtRules = data.activeRules.filter((r) => r.operator === "gt");
    const hasGt = gtRules.length > 0;
    const hasLt = ltRules.length > 0;

    const tableTop = doc.y;
    doc.fontSize(11);

    // Column 1
    doc.font("Helvetica-Bold").text("Minimum:", 50, tableTop);
    doc.font("Helvetica").text(fmtVal(data.stats.min), 130, tableTop);
    doc.font("Helvetica-Bold").text("Maximum:", 50, tableTop + 20);
    doc.font("Helvetica").text(fmtVal(data.stats.max), 130, tableTop + 20);
    doc.font("Helvetica-Bold").text("Average:", 50, tableTop + 40);
    doc.font("Helvetica").text(fmtVal(data.stats.avg), 130, tableTop + 40);

    // Column 2
    doc.font("Helvetica-Bold").text("Total time:", 280, tableTop);
    doc.font("Helvetica").text(formatDuration(data.stats.totalTimeWindowMs), 390, tableTop);
    doc.font("Helvetica-Bold").text("Time below min:", 280, tableTop + 20);
    doc.font("Helvetica").text(hasLt ? formatDuration(data.stats.timeBelowMinMs) : "N/A", 390, tableTop + 20);
    doc.font("Helvetica-Bold").text("Time above max:", 280, tableTop + 40);
    doc.font("Helvetica").text(hasGt ? formatDuration(data.stats.timeAboveMaxMs) : "N/A", 390, tableTop + 40);

    doc.y = tableTop + 70;
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.y += 20;

    // --- Metric Chart ---
    const chartX = 50;
    const chartY = doc.y;
    const chartW = 500;
    const chartH = 140;
    drawChart(doc, data, chartX, chartY, chartW, chartH, unit, decimals);
    doc.y = chartY + chartH + 25;

    // --- Breach Summary ---
    if (data.activeRules.length > 0) {
        doc.fontSize(15).font("Helvetica-Bold").text("Breach Summary", 50, doc.y);
        doc.moveDown(0.5);

        doc.fontSize(11).font("Helvetica");
        doc.text(`Total breaches: ${data.stats.totalBreaches}`);
        doc.text(`Longest breach: ${formatDuration(data.stats.longestBreachMs)}`);
        doc.text(`Instant fluctuations (<1 minute): ${data.stats.instantBreaches}`);
        doc.moveDown(0.5);
        doc.fontSize(9).font("Helvetica-Oblique").text("Instant fluctuations are excluded from reportable breach calculations.");
        doc.font("Helvetica");

        const reportableBreaches = data.breaches.filter(b => b.durationMs >= MIN_BREACH_DURATION_MS);
        if (data.breaches.length > 0 && reportableBreaches.length === 0) {
            doc.moveDown(0.5);
            doc.font("Helvetica-Oblique").text("All detected out-of-range events were shorter than 1 minute.");
            doc.font("Helvetica");
        }
    }

    doc.moveDown();

    // --- Top 5 Longest Breaches ---
    if (data.activeRules.length > 0) {
        doc.fontSize(15).font("Helvetica-Bold").text("Top 5 Longest Breaches", 50, doc.y);
        doc.moveDown(0.5);

        const reportableBreaches = data.breaches.filter(b => b.durationMs >= MIN_BREACH_DURATION_MS);

        if (reportableBreaches.length === 0) {
            doc.fontSize(11).font("Helvetica-Oblique").text("No breaches recorded during selected period.");
        } else {
            const top5 = [...reportableBreaches].sort((a, b) => b.durationMs - a.durationMs).slice(0, 5);

            let valueLabel = "Extreme Value";
            if (hasGt && !hasLt) valueLabel = "Highest";
            if (hasLt && !hasGt) valueLabel = "Lowest";

            const tableTop = doc.y;
            const col1 = 50;
            const col2 = 200;
            const col3 = 330;
            const col4 = 430;

            // Header Background
            doc.rect(50, tableTop - 5, 500, 20).fillColor("#e5e7eb").fill();
            doc.fillColor("black");

            doc.fontSize(10).font("Helvetica-Bold");
            doc.text("Start", col1, tableTop);
            doc.text("Duration", col2, tableTop);
            doc.text(valueLabel, col3, tableTop);
            doc.text("Limit", col4, tableTop);
            doc.moveTo(50, doc.y + 5).lineTo(550, doc.y + 5).stroke();

            doc.font("Helvetica");
            let y = doc.y + 12;
            for (const b of top5) {
                if (y > doc.page.height - 100) {
                    doc.addPage();
                    y = 50;
                }
                doc.text(formatDateEU(b.start, data.timezone), col1, y);
                doc.text(formatDuration(b.durationMs), col2, y);
                doc.text(`${b.peakValue.toFixed(decimals)}${unit}`, col3, y);

                let threshStr = "";
                if (b.isPeakGt && b.thresholds.max !== undefined) {
                    threshStr = `> ${b.thresholds.max}${unit}`;
                } else if (!b.isPeakGt && b.thresholds.min !== undefined) {
                    threshStr = `< ${b.thresholds.min}${unit}`;
                }
                doc.text(threshStr, col4, y);
                y += 20;
            }
        }
    }

    doc.moveDown();

    // --- All Breach Events ---
    if (data.activeRules.length > 0) {
        doc.fontSize(15).font("Helvetica-Bold").text("All Breach Events", 50, doc.y);
        doc.moveDown(0.5);

        const reportableBreaches = data.breaches.filter(b => b.durationMs >= MIN_BREACH_DURATION_MS);

        if (reportableBreaches.length === 0) {
            doc.fontSize(11).font("Helvetica-Oblique").text("No breaches recorded during selected period.");
        } else {
            let valueLabel = "Extreme Value";
            if (hasGt && !hasLt) valueLabel = "Highest";
            if (hasLt && !hasGt) valueLabel = "Lowest";

            let tableTop = doc.y;
            if (tableTop > doc.page.height - 100) {
                doc.addPage();
                tableTop = 50;
            }

            const col1 = 50;
            const col2 = 160;
            const col3 = 270;
            const col4 = 370;
            const col5 = 470;

            // Header Background
            doc.rect(50, tableTop - 5, 500, 20).fillColor("#e5e7eb").fill();
            doc.fillColor("black");

            doc.fontSize(10).font("Helvetica-Bold");
            doc.text("Start", col1, tableTop);
            doc.text("End", col2, tableTop);
            doc.text("Duration", col3, tableTop);
            doc.text(valueLabel, col4, tableTop);
            doc.text("Limit", col5, tableTop);
            doc.moveTo(50, doc.y + 5).lineTo(550, doc.y + 5).stroke();

            doc.font("Helvetica");
            let y = doc.y + 12;
            for (const b of reportableBreaches) {
                if (y > doc.page.height - 50) {
                    doc.addPage();
                    y = 50;
                }
                doc.text(formatDateEU(b.start, data.timezone), col1, y);
                doc.text(formatDateEU(b.end, data.timezone), col2, y);
                doc.text(formatDuration(b.durationMs), col3, y);
                doc.text(`${b.peakValue.toFixed(decimals)}${unit}`, col4, y);

                let threshStr = "";
                if (b.isPeakGt && b.thresholds.max !== undefined) {
                    threshStr = `> ${b.thresholds.max}${unit}`;
                } else if (!b.isPeakGt && b.thresholds.min !== undefined) {
                    threshStr = `< ${b.thresholds.min}${unit}`;
                }
                doc.text(threshStr, col5, y);
                y += 20;
            }
        }
    }

    return doc;
}

// ─── Vector chart helper ──────────────────────────────────────────────────────
function drawChart(
    doc: PDFKit.PDFDocument,
    data: ReportData,
    x: number,
    y: number,
    w: number,
    h: number,
    unitSuffix: string,
    decimals: number
) {
    const { points, activeRules, fromDate, toDate } = data;

    // Determine threshold values
    const gtRules = activeRules.filter(r => r.operator === 'gt' && r.enabled);
    const ltRules = activeRules.filter(r => r.operator === 'lt' && r.enabled);
    const thresholdValues = [
        ...gtRules.map(r => Number(r.threshold)),
        ...ltRules.map(r => Number(r.threshold)),
    ];

    if (points.length === 0) {
        // No-data placeholder box
        doc.rect(x, y, w, h).stroke("#cccccc");
        doc.fontSize(11).font("Helvetica-Oblique").fillColor("#999999")
            .text("No data for this period", x, y + h / 2 - 5, { width: w, align: 'center' });
        doc.fillColor("black");
        return;
    }

    // ── Compute Y domain ──────────────────────────────────────────────────────
    const values = points.map(p => p.value);
    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);

    const allY = [...values, ...thresholdValues];
    let yMin = Math.min(...allY);
    let yMax = Math.max(...allY);

    const range = yMax - yMin;
    // Padding: 5% of range, with minimums per metric type
    const minPad = unitSuffix === ' ppm' ? 50 : 1;
    const pad = Math.max(minPad, range * 0.05);
    yMin -= pad;
    yMax += pad;
    const yRange = yMax - yMin;

    // ── Compute X domain ─────────────────────────────────────────────────────
    const tMin = fromDate.getTime();
    const tMax = toDate.getTime();
    const tRange = tMax - tMin || 1;

    // ── Helpers ───────────────────────────────────────────────────────────────
    const toPixX = (ts: number) => x + ((ts - tMin) / tRange) * w;
    const toPixY = (v: number) => y + h - ((v - yMin) / yRange) * h;
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

    // ── Background + border ───────────────────────────────────────────────────
    doc.save();
    doc.rect(x, y, w, h).fillColor('#fafafa').fill();
    doc.rect(x, y, w, h).strokeColor('#cccccc').lineWidth(0.5).stroke();

    // ── Horizontal threshold lines ────────────────────────────────────────────
    for (const r of gtRules) {
        const tv = Number(r.threshold);
        const ty = clamp(toPixY(tv), y, y + h);
        doc.moveTo(x, ty).lineTo(x + w, ty)
            .strokeColor('#dc2626').lineWidth(1.5).dash(4, { space: 3 }).stroke();
        doc.undash();
        doc.fontSize(7).font('Helvetica-Bold').fillColor('#dc2626')
            .text(`MAX ${tv.toFixed(decimals)}${unitSuffix}`, x + w - 68, ty - 9, { width: 65, align: 'right' });
    }
    for (const r of ltRules) {
        const tv = Number(r.threshold);
        const ty = clamp(toPixY(tv), y, y + h);
        doc.moveTo(x, ty).lineTo(x + w, ty)
            .strokeColor('#2563eb').lineWidth(1.5).dash(4, { space: 3 }).stroke();
        doc.undash();
        doc.fontSize(7).font('Helvetica-Bold').fillColor('#2563eb')
            .text(`MIN ${tv.toFixed(decimals)}${unitSuffix}`, x + w - 68, ty + 2, { width: 65, align: 'right' });
    }

    // ── Data line ─────────────────────────────────────────────────────────────
    doc.save();
    // Clip the path to the chart box so it never bleeds outside
    doc.rect(x, y, w, h).clip();

    const sortedPts = [...points].sort((a, b) => a.occurred_at.getTime() - b.occurred_at.getTime());

    if (sortedPts.length === 1) {
        // Single point: draw a dot
        const px = toPixX(sortedPts[0].occurred_at.getTime());
        const py = toPixY(sortedPts[0].value);
        doc.circle(px, py, 3).fillColor('#3b82f6').fill();
    } else {
        // Multi-point: draw polyline
        doc.moveTo(
            toPixX(sortedPts[0].occurred_at.getTime()),
            toPixY(sortedPts[0].value)
        );
        for (let i = 1; i < sortedPts.length; i++) {
            doc.lineTo(
                toPixX(sortedPts[i].occurred_at.getTime()),
                toPixY(sortedPts[i].value)
            );
        }
        doc.strokeColor('#3b82f6').lineWidth(1.5).stroke();
    }
    doc.restore();

    // ── Axis labels ───────────────────────────────────────────────────────────
    doc.fillColor('#555555').font('Helvetica').fontSize(7);

    // Y-axis: yMax top-left, yMin bottom-left
    doc.text(yMax.toFixed(decimals) + unitSuffix, x - 2, y, { width: 45, align: 'right' });
    doc.text(yMin.toFixed(decimals) + unitSuffix, x - 2, y + h - 8, { width: 45, align: 'right' });

    // X-axis: start date bottom-left, end date bottom-right
    const chartFmtDate = (d: Date) => formatDateEU(d, data.timezone);
    doc.text(chartFmtDate(fromDate), x, y + h + 2, { width: 100 });
    doc.text(chartFmtDate(toDate), x + w - 100, y + h + 2, { width: 100, align: 'right' });

    doc.fillColor('black');
    doc.restore();
}

function formatDuration(ms: number) {
    if (ms === 0) return "0m";
    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
}
