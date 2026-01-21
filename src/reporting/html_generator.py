"""
HTML Report Generator using Jinja2 & Tailwind CSS
Enhanced design matching the Streamlit dashboard style
"""

from datetime import datetime
from typing import Dict, Any, List
from jinja2 import Template
from src.processors.summary import generate_summary

HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ report_title }}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <link rel="stylesheet" as="style" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css" />
    <style>
        /* ============================================
           Design System - CSS Variables
           ============================================ */
        :root {
            /* Primary Colors */
            --color-primary: #3b82f6;
            --color-primary-light: #60a5fa;
            --color-primary-dark: #2563eb;
            --color-primary-bg: #eff6ff;

            /* Semantic Colors */
            --color-success: #22c55e;
            --color-success-bg: #f0fdf4;
            --color-danger: #ef4444;
            --color-danger-bg: #fef2f2;
            --color-warning: #f59e0b;
            --color-warning-bg: #fffbeb;
            --color-purple: #8b5cf6;
            --color-purple-bg: #faf5ff;
            --color-orange: #f97316;
            --color-orange-bg: #fff7ed;

            /* Neutral Colors */
            --color-text-primary: #1e293b;
            --color-text-secondary: #475569;
            --color-text-muted: #64748b;
            --color-text-light: #94a3b8;
            --color-border: #e2e8f0;
            --color-border-light: #f1f5f9;
            --color-bg-primary: #f8fafc;
            --color-bg-white: #ffffff;

            /* Typography Scale (8px base) */
            --font-xs: 0.5625rem;    /* 9px */
            --font-sm: 0.625rem;     /* 10px */
            --font-base: 0.6875rem;  /* 11px */
            --font-md: 0.75rem;      /* 12px */
            --font-lg: 0.8125rem;    /* 13px */
            --font-xl: 0.875rem;     /* 14px */
            --font-2xl: 1rem;        /* 16px */
            --font-3xl: 1.125rem;    /* 18px */

            /* Spacing Scale (4px base) */
            --space-1: 0.25rem;      /* 4px */
            --space-2: 0.375rem;     /* 6px */
            --space-3: 0.5rem;       /* 8px */
            --space-4: 0.625rem;     /* 10px */
            --space-5: 0.75rem;      /* 12px */
            --space-6: 1rem;         /* 16px */
            --space-8: 1.5rem;       /* 24px */

            /* Border Radius */
            --radius-sm: 4px;
            --radius-md: 6px;
            --radius-lg: 8px;
            --radius-xl: 12px;

            /* Shadows */
            --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
            --shadow-md: 0 2px 4px rgba(0,0,0,0.08);
            --shadow-lg: 0 4px 8px rgba(0,0,0,0.1);
        }

        * {
            font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif;
            box-sizing: border-box;
        }

        body {
            background-color: var(--color-bg-primary);
            color: var(--color-text-secondary);
            line-height: 1.4;
            font-size: var(--font-base);
            margin: 0;
            padding: 0;
        }

        .report-container {
            max-width: 1000px;
            margin: 0 auto;
            padding: var(--space-3);
        }

        .report-section {
            background: var(--color-bg-white);
            border-radius: var(--radius-lg);
            padding: var(--space-4);
            margin-bottom: var(--space-3);
            box-shadow: var(--shadow-sm);
            border: 1px solid var(--color-border-light);
        }

        .section-header {
            display: flex;
            align-items: center;
            gap: var(--space-2);
            margin-bottom: var(--space-3);
            padding-bottom: var(--space-2);
            border-bottom: 2px solid var(--color-border);
        }

        .section-icon {
            width: 24px;
            height: 24px;
            border-radius: var(--radius-sm);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: var(--font-md);
        }

        .section-title {
            font-size: var(--font-xl);
            font-weight: 700;
            color: var(--color-text-primary);
            letter-spacing: -0.01em;
        }

        /* Month comparison layout */
        .month-comparison {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: var(--space-3);
            margin-bottom: var(--space-3);
        }

        .month-column {
            background: var(--color-bg-primary);
            border-radius: var(--radius-md);
            padding: var(--space-3);
            min-width: 0;
            flex: 1;
            border: 1px solid var(--color-border);
        }

        .month-column.current {
            background: var(--color-primary-bg);
            border: 2px solid var(--color-primary);
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .month-title {
            text-align: center;
            font-size: var(--font-lg);
            font-weight: 700;
            margin-bottom: var(--space-2);
            padding-bottom: var(--space-2);
            border-bottom: 1px solid var(--color-border);
        }

        .month-title.prev { color: var(--color-text-secondary); }
        .month-title.curr {
            color: var(--color-primary);
            position: relative;
        }
        .month-title.curr::after {
            content: '●';
            font-size: 6px;
            margin-left: 4px;
            vertical-align: middle;
        }

        /* Metric cards grid */
        .metrics-grid {
            display: grid;
            gap: var(--space-2);
        }

        .metrics-grid.cols-2 { grid-template-columns: repeat(2, 1fr); }
        .metrics-grid.cols-3 { grid-template-columns: repeat(3, 1fr); }
        .metrics-grid.cols-4 { grid-template-columns: repeat(4, 1fr); }
        .metrics-grid.cols-5 { grid-template-columns: repeat(5, 1fr); }

        .metric-card {
            background: var(--color-bg-white);
            border-radius: var(--radius-md);
            padding: var(--space-3) var(--space-2);
            text-align: center;
            border: 1px solid var(--color-border);
            transition: transform 0.15s ease, box-shadow 0.15s ease;
        }

        .metric-card:hover {
            transform: translateY(-1px);
            box-shadow: var(--shadow-md);
        }

        .month-column.current .metric-card {
            border: 1px solid var(--color-primary-light);
            background: var(--color-bg-white);
        }

        /* Icon box style */
        .metric-icon-box {
            width: 22px;
            height: 22px;
            border-radius: var(--radius-sm);
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto var(--space-2);
            font-size: var(--font-sm);
        }

        .metric-icon-box.blue { background: var(--color-primary); }
        .metric-icon-box.green { background: var(--color-success); }
        .metric-icon-box.red { background: var(--color-danger); }
        .metric-icon-box.orange { background: var(--color-orange); }
        .metric-icon-box.purple { background: var(--color-purple); }
        .metric-icon-box.gray { background: var(--color-text-muted); }

        .metric-icon { font-size: var(--font-xl); margin-bottom: var(--space-1); }
        .metric-label {
            font-size: var(--font-xs);
            color: var(--color-text-muted);
            margin-bottom: 2px;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.02em;
        }
        .metric-value {
            font-size: 1rem;
            font-weight: 800;
            color: var(--color-text-primary);
            line-height: 1.2;
        }
        .metric-unit {
            font-size: var(--font-sm);
            font-weight: 500;
            color: var(--color-text-muted);
            margin-left: 2px;
        }

        /* Color variants for metric values */
        .metric-value.blue { color: var(--color-primary); }
        .metric-value.green { color: var(--color-success); }
        .metric-value.red { color: var(--color-danger); }
        .metric-value.orange { color: var(--color-orange); }
        .metric-value.purple { color: var(--color-purple); }

        /* Highlight animation for important values */
        .metric-value.highlight {
            position: relative;
        }
        .metric-value.highlight::after {
            content: '';
            position: absolute;
            bottom: -2px;
            left: 0;
            right: 0;
            height: 3px;
            background: linear-gradient(90deg, var(--color-primary), var(--color-primary-light));
            border-radius: 2px;
        }

        /* Sub note (자료 미수신 등) */
        .metric-note {
            font-size: var(--font-sm);
            color: var(--color-warning);
            margin-top: var(--space-1);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 2px;
            font-weight: 500;
        }

        /* Metric card with background variants */
        .metric-card.bg-blue { background: var(--color-primary-bg); }
        .metric-card.bg-green { background: var(--color-success-bg); }
        .metric-card.bg-red { background: var(--color-danger-bg); }
        .metric-card.bg-orange { background: var(--color-orange-bg); }
        .metric-card.bg-gray { background: var(--color-bg-primary); }

        /* TOP5 section with side-by-side layout */
        .top5-comparison {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0;
            margin-bottom: var(--space-3);
            background: var(--color-bg-white);
            border-radius: var(--radius-md);
            border: 1px solid var(--color-border);
            overflow: hidden;
        }

        .top5-column {
            padding: var(--space-3);
            min-width: 0;
        }

        .top5-column.current {
            background: var(--color-bg-primary);
            border-left: 1px solid var(--color-border);
        }

        .top5-header {
            display: flex;
            align-items: center;
            gap: var(--space-1);
            font-size: var(--font-base);
            font-weight: 700;
            color: var(--color-text-primary);
            margin-bottom: var(--space-2);
            padding-bottom: var(--space-2);
            border-bottom: 1px solid var(--color-border);
        }

        .top5-list {
            display: flex;
            flex-direction: column;
            gap: var(--space-1);
        }

        .top5-item {
            display: flex;
            align-items: center;
            gap: var(--space-2);
            padding: var(--space-1) 0;
            border-bottom: 1px solid var(--color-border-light);
            transition: background 0.1s ease;
        }

        .top5-item:hover {
            background: var(--color-bg-primary);
            margin: 0 calc(var(--space-1) * -1);
            padding-left: var(--space-1);
            padding-right: var(--space-1);
            border-radius: var(--radius-sm);
        }

        .top5-item:last-child {
            border-bottom: none;
        }

        .top5-rank {
            width: 18px;
            height: 18px;
            border-radius: var(--radius-sm);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: var(--font-xs);
            font-weight: 700;
            flex-shrink: 0;
        }
        .top5-rank.rank-1 { background: linear-gradient(135deg, #fbbf24, #f59e0b); color: white; }
        .top5-rank.rank-2 { background: linear-gradient(135deg, #94a3b8, #64748b); color: white; }
        .top5-rank.rank-3 { background: linear-gradient(135deg, #d97706, #b45309); color: white; }
        .top5-rank.rank-other { background: var(--color-border-light); color: var(--color-text-muted); }

        .top5-icon {
            font-size: var(--font-md);
            width: 16px;
            flex-shrink: 0;
        }

        .top5-content { flex: 1; min-width: 0; overflow: hidden; }

        .top5-label {
            font-size: var(--font-sm);
            color: var(--color-text-secondary);
            margin-bottom: 2px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 100%;
            font-weight: 500;
        }

        .top5-bar-container {
            height: 4px;
            background: var(--color-border);
            border-radius: 2px;
            overflow: hidden;
        }

        .top5-bar {
            height: 100%;
            border-radius: 2px;
            transition: width 0.3s ease;
        }

        .top5-bar.blue { background: linear-gradient(90deg, var(--color-primary), var(--color-primary-light)); }
        .top5-bar.green { background: linear-gradient(90deg, var(--color-success), #4ade80); }
        .top5-bar.purple { background: linear-gradient(90deg, var(--color-purple), #a78bfa); }
        .top5-bar.amber { background: linear-gradient(90deg, var(--color-warning), #fbbf24); }
        .top5-bar.red { background: linear-gradient(90deg, var(--color-danger), #f87171); }
        .top5-bar.multi { background: linear-gradient(90deg, var(--color-primary), var(--color-success), var(--color-warning)); }

        .top5-stats {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            min-width: 45px;
        }

        .top5-value {
            font-size: var(--font-base);
            font-weight: 700;
            color: var(--color-text-primary);
        }

        .top5-sub {
            font-size: var(--font-xs);
            color: var(--color-text-muted);
        }

        /* Category icons for how_found */
        .category-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            border-radius: var(--radius-sm);
            flex-shrink: 0;
            font-size: var(--font-md);
        }
        .category-icon.online { background: #dbeafe; color: var(--color-primary); }
        .category-icon.offline { background: #fef3c7; color: var(--color-warning); }
        .category-icon.referral { background: #dcfce7; color: var(--color-success); }
        .category-icon.other { background: var(--color-border-light); color: var(--color-text-muted); }

        /* Insight boxes - Key highlights */
        .insight-box {
            background: linear-gradient(135deg, #fefce8 0%, #fef9c3 100%);
            border-left: 3px solid #eab308;
            border-radius: var(--radius-sm);
            padding: var(--space-3) var(--space-4);
            margin-bottom: var(--space-2);
            position: relative;
            overflow: hidden;
        }

        .insight-box::before {
            content: '';
            position: absolute;
            top: 0;
            right: 0;
            width: 60px;
            height: 60px;
            background: radial-gradient(circle at top right, rgba(234, 179, 8, 0.1), transparent);
        }

        .insight-box.blue {
            background: linear-gradient(135deg, var(--color-primary-bg) 0%, #dbeafe 100%);
            border-left-color: var(--color-primary);
        }
        .insight-box.blue::before {
            background: radial-gradient(circle at top right, rgba(59, 130, 246, 0.1), transparent);
        }

        .insight-box.green {
            background: linear-gradient(135deg, var(--color-success-bg) 0%, #dcfce7 100%);
            border-left-color: var(--color-success);
        }
        .insight-box.green::before {
            background: radial-gradient(circle at top right, rgba(34, 197, 94, 0.1), transparent);
        }

        .insight-box.purple {
            background: linear-gradient(135deg, var(--color-purple-bg) 0%, #f3e8ff 100%);
            border-left-color: var(--color-purple);
        }
        .insight-box.purple::before {
            background: radial-gradient(circle at top right, rgba(139, 92, 246, 0.1), transparent);
        }

        .insight-title {
            font-size: var(--font-base);
            font-weight: 700;
            color: var(--color-text-primary);
            margin-bottom: var(--space-1);
            display: flex;
            align-items: center;
            gap: var(--space-2);
        }

        .insight-content {
            font-size: var(--font-sm);
            color: var(--color-text-secondary);
            line-height: 1.5;
        }

        .insight-content strong {
            color: var(--color-text-primary);
            font-weight: 700;
        }

        .insight-content .highlight {
            background: linear-gradient(transparent 50%, #fef08a 50%);
            padding: 0 3px;
            font-weight: 600;
        }

        .insight-content .highlight-blue {
            background: linear-gradient(transparent 50%, #bfdbfe 50%);
            padding: 0 3px;
            font-weight: 600;
        }

        /* Summary section - Featured callout */
        .summary-section {
            background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
            border: 2px solid var(--color-primary-light);
            border-radius: var(--radius-lg);
            padding: var(--space-4);
            margin-bottom: var(--space-3);
            position: relative;
        }

        .summary-section::before {
            content: '★';
            position: absolute;
            top: -8px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--color-primary);
            color: white;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            font-size: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .summary-title {
            text-align: center;
            font-size: var(--font-md);
            font-weight: 700;
            color: var(--color-primary-dark);
            margin-bottom: var(--space-2);
        }

        .summary-content {
            text-align: center;
            color: var(--color-text-secondary);
            font-size: var(--font-sm);
            line-height: 1.5;
        }

        /* Action Plan table - Modernized */
        .action-plan {
            margin-top: var(--space-4);
        }

        .action-plan-title {
            font-size: var(--font-md);
            font-weight: 700;
            color: var(--color-text-primary);
            margin-bottom: var(--space-3);
            display: flex;
            align-items: center;
            gap: var(--space-2);
            padding-bottom: var(--space-2);
            border-bottom: 2px solid var(--color-primary);
        }

        .action-table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            margin-top: var(--space-4);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-lg);
            overflow: hidden;
            table-layout: fixed;
        }

        .action-table th {
            text-align: left;
            padding: var(--space-4) var(--space-5);
            background: var(--color-bg-primary);
            color: var(--color-text-secondary);
            font-weight: 700;
            font-size: var(--font-md);
            border-bottom: 2px solid var(--color-border);
            text-transform: uppercase;
            letter-spacing: 0.03em;
        }

        .action-table td {
            text-align: left;
            padding: var(--space-4) var(--space-5);
            border-bottom: 1px solid var(--color-border-light);
            color: var(--color-text-secondary);
            font-size: var(--font-md);
            line-height: 1.6;
            vertical-align: top;
            white-space: pre-wrap;
        }

        .action-table tr:last-child td {
            border-bottom: none;
        }

        .action-table tr:hover td {
            background: var(--color-bg-primary);
        }

        .agenda-cell {
            background-color: var(--color-bg-primary);
            font-weight: 600;
            color: var(--color-text-primary);
            width: 25%;
            border-right: 1px solid var(--color-border-light);
        }

        .plan-cell {
            color: var(--color-text-secondary);
            font-size: var(--font-sm);
            line-height: 1.5;
        }

        .plan-cell strong {
            color: var(--color-text-primary);
            font-weight: 700;
        }

        .plan-cell .sub-item {
            margin-left: var(--space-3);
            color: var(--color-text-muted);
            font-size: var(--font-xs);
        }

        /* Diagnosis cards - Info panels */
        .diagnosis-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: var(--space-3);
            margin-bottom: var(--space-3);
        }

        .diagnosis-card {
            background: var(--color-bg-white);
            border-radius: var(--radius-md);
            border: 1px solid var(--color-border);
            overflow: hidden;
            transition: box-shadow 0.15s ease;
        }

        .diagnosis-card:hover {
            box-shadow: var(--shadow-md);
        }

        .diagnosis-header {
            padding: var(--space-2) var(--space-3);
            font-weight: 700;
            font-size: var(--font-sm);
            display: flex;
            align-items: center;
            gap: var(--space-2);
        }

        .diagnosis-header.blue { background: var(--color-primary-bg); color: var(--color-primary-dark); }
        .diagnosis-header.green { background: var(--color-success-bg); color: #16a34a; }
        .diagnosis-header.purple { background: var(--color-purple-bg); color: #7c3aed; }
        .diagnosis-header.amber { background: var(--color-warning-bg); color: #b45309; }

        .diagnosis-content {
            padding: var(--space-2) var(--space-3);
            font-size: var(--font-sm);
            color: var(--color-text-secondary);
            line-height: 1.5;
        }

        /* Tables - Clean design */
        .data-table {
            width: 100%;
            border-collapse: collapse;
            font-size: var(--font-sm);
        }

        .data-table th {
            background: var(--color-bg-primary);
            padding: var(--space-2) var(--space-2);
            text-align: left;
            font-weight: 600;
            color: var(--color-text-secondary);
            border-bottom: 2px solid var(--color-border);
            font-size: var(--font-xs);
            text-transform: uppercase;
            letter-spacing: 0.02em;
        }

        .data-table td {
            padding: var(--space-2) var(--space-2);
            border-bottom: 1px solid var(--color-border-light);
            color: var(--color-text-secondary);
        }

        .data-table tr:hover td { background: var(--color-bg-primary); }

        /* Key insight box (yellow gradient) - Important callout */
        .key-insight-box {
            background: linear-gradient(135deg, #fefce8 0%, #fef9c3 100%);
            border: 2px solid #fde68a;
            border-radius: var(--radius-lg);
            padding: var(--space-4);
            margin-bottom: var(--space-3);
            position: relative;
        }

        .key-insight-box::before {
            content: '💡';
            position: absolute;
            top: -10px;
            left: var(--space-4);
            font-size: 14px;
        }

        .key-insight-header {
            display: flex;
            align-items: center;
            gap: var(--space-2);
            font-size: var(--font-base);
            font-weight: 700;
            color: #854d0e;
            margin-bottom: var(--space-2);
        }

        .key-insight-item {
            background: var(--color-bg-white);
            border-radius: var(--radius-sm);
            padding: var(--space-2) var(--space-3);
            margin-bottom: var(--space-2);
            border: 1px solid #fde68a;
            transition: transform 0.1s ease;
        }

        .key-insight-item:hover {
            transform: translateX(4px);
        }

        .key-insight-item:last-child {
            margin-bottom: 0;
        }

        .key-insight-label {
            font-size: var(--font-xs);
            color: #92400e;
            font-weight: 600;
            margin-bottom: 2px;
            text-transform: uppercase;
            letter-spacing: 0.02em;
        }

        .key-insight-title {
            font-size: var(--font-sm);
            font-weight: 700;
            color: var(--color-text-primary);
            margin-bottom: 2px;
        }

        .key-insight-value {
            font-size: var(--font-xs);
            color: var(--color-text-secondary);
        }

        .key-insight-value .highlight {
            color: var(--color-orange);
            font-weight: 700;
        }

        /* Video type distribution section */
        .video-dist-section {
            margin-top: var(--space-3);
        }

        .video-dist-header {
            display: flex;
            align-items: center;
            gap: var(--space-2);
            font-size: var(--font-base);
            font-weight: 700;
            color: var(--color-text-primary);
            margin-bottom: var(--space-2);
        }

        .video-dist-bar {
            height: 20px;
            background: var(--color-border);
            border-radius: var(--radius-md);
            overflow: hidden;
            display: flex;
            box-shadow: inset 0 1px 2px rgba(0,0,0,0.05);
        }

        .video-dist-segment {
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: var(--font-xs);
            font-weight: 700;
            color: white;
            transition: width 0.4s ease;
        }

        .video-dist-segment.longform { background: linear-gradient(90deg, var(--color-primary), var(--color-primary-light)); }
        .video-dist-segment.shortform { background: linear-gradient(90deg, var(--color-danger), #f87171); }

        .video-dist-legend {
            display: flex;
            justify-content: center;
            gap: var(--space-5);
            margin-top: var(--space-2);
        }

        .video-dist-legend-item {
            display: flex;
            align-items: center;
            gap: var(--space-1);
            font-size: var(--font-xs);
            color: var(--color-text-secondary);
            font-weight: 500;
        }

        .video-dist-legend-dot {
            width: 8px;
            height: 8px;
            border-radius: 2px;
        }

        .video-dist-legend-dot.longform { background: var(--color-primary); }
        .video-dist-legend-dot.shortform { background: var(--color-danger); }

        /* Ads 4-column ranking layout */
        .ads-ranking-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: var(--space-2);
            margin-bottom: var(--space-3);
        }

        .ads-ranking-box {
            background: var(--color-bg-white);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-md);
            padding: var(--space-2);
            transition: box-shadow 0.15s ease;
        }

        .ads-ranking-box:hover {
            box-shadow: var(--shadow-md);
        }

        .ads-ranking-box.current {
            border: 2px solid var(--color-primary);
            background: var(--color-bg-primary);
        }

        .ads-ranking-header {
            display: flex;
            align-items: center;
            gap: var(--space-1);
            font-size: var(--font-xs);
            font-weight: 700;
            color: var(--color-text-primary);
            margin-bottom: var(--space-2);
            padding-bottom: var(--space-1);
            border-bottom: 1px solid var(--color-border);
        }

        .ads-ranking-header .icon {
            font-size: var(--font-sm);
        }

        .ads-ranking-list {
            display: flex;
            flex-direction: column;
            gap: var(--space-1);
        }

        .ads-ranking-item {
            display: flex;
            align-items: flex-start;
            gap: var(--space-1);
        }

        .ads-ranking-num {
            width: 14px;
            height: 14px;
            background: var(--color-border-light);
            border-radius: var(--radius-sm);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 8px;
            font-weight: 700;
            color: var(--color-text-muted);
            flex-shrink: 0;
        }

        .ads-ranking-content {
            flex: 1;
            min-width: 0;
        }

        .ads-ranking-keyword {
            font-size: var(--font-xs);
            font-weight: 600;
            color: var(--color-text-primary);
            margin-bottom: 2px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .ads-ranking-bar-container {
            height: 4px;
            background: var(--color-border);
            border-radius: 2px;
            overflow: hidden;
            margin-bottom: 2px;
        }

        .ads-ranking-bar {
            height: 100%;
            border-radius: 2px;
            transition: width 0.3s ease;
        }

        .ads-ranking-bar.impressions { background: linear-gradient(90deg, var(--color-primary), var(--color-primary-light)); }
        .ads-ranking-bar.clicks { background: linear-gradient(90deg, var(--color-success), #4ade80); }

        .ads-ranking-stats {
            display: flex;
            gap: var(--space-2);
            font-size: 8px;
            color: var(--color-text-muted);
        }

        .ads-ranking-stat {
            display: flex;
            align-items: center;
            gap: 2px;
        }

        .ads-ranking-stat-label {
            color: var(--color-text-light);
        }

        .ads-ranking-stat-value {
            font-weight: 600;
            color: var(--color-text-secondary);
        }

        .ads-ranking-stat-value.highlight {
            color: var(--color-primary);
            font-weight: 700;
        }

        /* Posting list table - side by side comparison */
        .posting-list-section {
            margin-top: var(--space-3);
        }

        .posting-list-header {
            display: flex;
            align-items: center;
            gap: var(--space-2);
            font-size: var(--font-base);
            font-weight: 700;
            color: var(--color-text-primary);
            margin-bottom: var(--space-2);
            padding-bottom: var(--space-2);
            border-bottom: 2px solid var(--color-border);
        }

        .posting-comparison {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0;
            border: 1px solid var(--color-border);
            border-radius: var(--radius-md);
            overflow: hidden;
        }

        .posting-column {
            min-width: 0;
        }

        .posting-column.current {
            background: var(--color-bg-primary);
            border-left: 1px solid var(--color-border);
        }

        .posting-column-header {
            background: var(--color-bg-primary);
            padding: var(--space-2);
            text-align: center;
            font-weight: 700;
            font-size: var(--font-sm);
            border-bottom: 1px solid var(--color-border);
        }

        .posting-column.current .posting-column-header {
            background: var(--color-primary-bg);
            color: var(--color-primary);
        }

        .posting-table {
            width: 100%;
            border-collapse: collapse;
        }

        .posting-table th {
            background: var(--color-bg-primary);
            padding: var(--space-2) var(--space-2);
            text-align: left;
            font-weight: 600;
            color: var(--color-text-secondary);
            font-size: var(--font-xs);
            border-bottom: 1px solid var(--color-border);
            text-transform: uppercase;
            letter-spacing: 0.02em;
        }

        .posting-table th.center {
            text-align: center;
        }

        .posting-table th.date { width: 85px; white-space: nowrap; }
        .posting-table th.views { width: 45px; }

        .posting-table td {
            padding: var(--space-2) var(--space-2);
            border-bottom: 1px solid var(--color-border-light);
            font-size: var(--font-xs);
            color: var(--color-text-secondary);
            vertical-align: top;
        }

        .posting-table td.center {
            text-align: center;
        }

        .posting-table td.date {
            white-space: nowrap;
        }

        .posting-table td.views {
            text-align: right;
            color: var(--color-primary);
            font-weight: 700;
        }

        .posting-table tr:last-child td {
            border-bottom: none;
        }

        .posting-table tr:hover td {
            background: var(--color-bg-primary);
        }

        .posting-title {
            font-weight: 500;
            color: var(--color-text-primary);
            display: -webkit-box;
            -webkit-line-clamp: 1;
            -webkit-box-orient: vertical;
            overflow: hidden;
            line-height: 1.3;
        }

        .posting-title a {
            color: var(--color-text-primary);
            text-decoration: none;
            transition: color 0.1s ease;
        }

        .posting-title a:hover {
            color: var(--color-primary);
            text-decoration: underline;
        }

        .posting-empty {
            text-align: center;
            color: var(--color-text-light);
            padding: var(--space-4);
            font-size: var(--font-xs);
            font-style: italic;
        }

        /* Print styles */
        @media print {
            @page { size: A4; margin: 1cm; }
            body { background: white !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            .report-section { box-shadow: none !important; break-inside: avoid; }
            .no-print { display: none !important; }
            .metric-card:hover { transform: none; box-shadow: var(--shadow-sm); }
        }
    </style>
</head>
<body>
    <div class="report-container">
        <!-- Title Section -->
        <div class="report-section" style="text-align: center; padding: var(--space-5) var(--space-4); background: linear-gradient(135deg, var(--color-bg-white) 0%, var(--color-primary-bg) 100%); border: 2px solid var(--color-primary-light);">
            <p style="color: var(--color-text-muted); font-size: var(--font-sm); margin-bottom: var(--space-1); text-transform: uppercase; letter-spacing: 0.05em;">Marketing Performance Report</p>
            <h1 style="font-size: var(--font-2xl); font-weight: 800; color: var(--color-text-primary); margin-bottom: var(--space-2); letter-spacing: -0.02em;">{{ report_title }}</h1>
            <div style="width: 40px; height: 3px; background: linear-gradient(90deg, var(--color-primary), var(--color-primary-light)); margin: var(--space-2) auto; border-radius: 2px;"></div>
            <p style="font-size: var(--font-md); font-weight: 600; color: var(--color-text-secondary);">{{ clinic_name }}</p>
            <p style="color: var(--color-text-light); font-size: var(--font-sm); margin-top: var(--space-1);">{{ report_date }} 발행</p>
        </div>

        {% for dept in departments %}
        {% if dept.has_data %}
        <div class="report-section">
            <!-- Section Header -->
            <div class="section-header">
                <div class="section-icon" style="background: {{ dept.color_bg }};">
                    <span>{{ dept.icon }}</span>
                </div>
                <h2 class="section-title">{{ dept.name }} 성과 분석</h2>
            </div>

            <!-- CPA Banner for Ads -->
            {% if dept.id == 'ads' and dept.cpa_banner %}
            <div style="background: linear-gradient(135deg, #0055FF 0%, #3b82f6 100%); border-radius: 6px; padding: 8px; margin-bottom: 8px; color: white; text-align: center;">
                <p style="font-size: 0.5625rem; margin: 0 0 2px 0; opacity: 0.9;">💰 환자 1인당 마케팅 비용 (CPA)</p>
                <p style="font-size: 1rem; font-weight: 800; margin: 0;">{{ dept.cpa_banner.cpa }}</p>
                <p style="font-size: 0.5rem; margin: 2px 0 0 0; opacity: 0.8;">실 예약 환자 {{ dept.cpa_banner.actual_reservations }}명 기준</p>
                {% if dept.cpa_banner.change_text %}
                <p style="font-size: 0.5rem; margin: 2px 0 0 0; color: {{ dept.cpa_banner.change_color }}; background: white; display: inline-block; padding: 1px 6px; border-radius: 10px;">{{ dept.cpa_banner.change_text }}</p>
                {% endif %}
            </div>
            {% endif %}

            <!-- Month Comparison with metrics -->
            {% if dept.prev_month and dept.curr_month and dept.id not in ['ads', 'design'] %}
            <div class="month-comparison">
                <!-- Previous Month -->
                <div class="month-column">
                    <div class="month-title prev">{{ dept.prev_month }}</div>
                    {% if dept.id == 'reservation' %}
                    <div class="metrics-grid cols-3">
                    {% elif dept.id == 'blog' %}
                    <div class="metrics-grid cols-2" style="margin-bottom: 0.375rem;">
                    {% elif dept.id in ['design', 'youtube'] %}
                    <div class="metrics-grid cols-3">
                    {% elif dept.id == 'ads' %}
                    <div class="metrics-grid cols-3">
                    {% else %}
                    <div class="metrics-grid cols-3">
                    {% endif %}
                        {% for metric in dept.prev_metrics %}
                        <div class="metric-card {{ metric.bg_class|default('bg-gray') }}">
                            <div class="metric-icon-box {{ metric.icon_box_class|default('blue') }}">
                                <span style="filter: brightness(0) invert(1);">{{ metric.icon }}</span>
                            </div>
                            <div class="metric-label">{{ metric.label }}</div>
                            <div class="metric-value {{ metric.color_class|default('') }}">{{ metric.value }}<span class="metric-unit">{{ metric.unit|default('') }}</span></div>
                            {% if metric.note %}
                            <div class="metric-note">⚠️ {{ metric.note }}</div>
                            {% endif %}
                        </div>
                        {% endfor %}
                    </div>
                    {% if dept.id == 'blog' and dept.prev_metrics_row2 %}
                    <div class="metrics-grid cols-2">
                        {% for metric in dept.prev_metrics_row2 %}
                        <div class="metric-card {{ metric.bg_class|default('bg-gray') }}">
                            <div class="metric-icon-box {{ metric.icon_box_class|default('blue') }}">
                                <span style="filter: brightness(0) invert(1);">{{ metric.icon }}</span>
                            </div>
                            <div class="metric-label">{{ metric.label }}</div>
                            <div class="metric-value {{ metric.color_class|default('') }}">{{ metric.value }}<span class="metric-unit">{{ metric.unit|default('') }}</span></div>
                        </div>
                        {% endfor %}
                    </div>
                    {% endif %}
                </div>

                <!-- Current Month -->
                <div class="month-column current">
                    <div class="month-title curr">{{ dept.curr_month }}</div>
                    {% if dept.id == 'reservation' %}
                    <div class="metrics-grid cols-3">
                    {% elif dept.id == 'blog' %}
                    <div class="metrics-grid cols-2" style="margin-bottom: 0.375rem;">
                    {% elif dept.id in ['design', 'youtube'] %}
                    <div class="metrics-grid cols-3">
                    {% elif dept.id == 'ads' %}
                    <div class="metrics-grid cols-3">
                    {% else %}
                    <div class="metrics-grid cols-3">
                    {% endif %}
                        {% for metric in dept.curr_metrics %}
                        <div class="metric-card {{ metric.bg_class|default('') }}">
                            <div class="metric-icon-box {{ metric.icon_box_class|default('blue') }}">
                                <span style="filter: brightness(0) invert(1);">{{ metric.icon }}</span>
                            </div>
                            <div class="metric-label" style="color: {{ metric.label_color|default('#64748b') }};">{{ metric.label }}</div>
                            <div class="metric-value {{ metric.color_class|default('') }}">{{ metric.value }}<span class="metric-unit">{{ metric.unit|default('') }}</span></div>
                            {% if metric.note %}
                            <div class="metric-note">⚠️ {{ metric.note }}</div>
                            {% endif %}
                        </div>
                        {% endfor %}
                    </div>
                    {% if dept.id == 'blog' and dept.curr_metrics_row2 %}
                    <div class="metrics-grid cols-2">
                        {% for metric in dept.curr_metrics_row2 %}
                        <div class="metric-card {{ metric.bg_class|default('') }}">
                            <div class="metric-icon-box {{ metric.icon_box_class|default('blue') }}">
                                <span style="filter: brightness(0) invert(1);">{{ metric.icon }}</span>
                            </div>
                            <div class="metric-label">{{ metric.label }}</div>
                            <div class="metric-value {{ metric.color_class|default('') }}">{{ metric.value }}<span class="metric-unit">{{ metric.unit|default('') }}</span></div>
                        </div>
                        {% endfor %}
                    </div>
                    {% endif %}
                </div>
            </div>
            {% endif %}

            <!-- TOP5 Charts (side by side comparison) -->
            {% if dept.top5_sections %}
            {% for section in dept.top5_sections %}
            <div class="top5-comparison">
                <!-- Previous month TOP5 -->
                <div class="top5-column">
                    <div class="top5-header">{{ section.icon }} {{ section.title }}</div>
                    <div class="top5-list">
                        {% for item in section.prev_items %}
                        <div class="top5-item">
                            {% if item.icon %}
                            <div class="category-icon {{ item.icon_class|default('other') }}">
                                <span>{{ item.icon }}</span>
                            </div>
                            {% endif %}
                            <div class="top5-content">
                                <div class="top5-label">{{ item.label }}</div>
                                <div class="top5-bar-container">
                                    <div class="top5-bar {{ section.bar_color }}" style="width: {{ item.pct }}%;"></div>
                                </div>
                            </div>
                            <div class="top5-stats">
                                <div class="top5-value">{{ item.value_display }}</div>
                                {% if item.sub_value %}
                                <div class="top5-sub">{{ item.sub_value }}</div>
                                {% endif %}
                            </div>
                        </div>
                        {% endfor %}
                        {% if not section.prev_items %}
                        <div style="text-align: center; color: #94a3b8; padding: 2rem; font-style: italic;">{{ section.no_prev_data_msg|default('데이터 없음') }}</div>
                        {% endif %}
                    </div>
                </div>

                <!-- Current month TOP5 -->
                <div class="top5-column current">
                    <div class="top5-header">{{ section.icon }} {{ section.title }}</div>
                    <div class="top5-list">
                        {% for item in section.curr_items %}
                        <div class="top5-item">
                            {% if item.icon %}
                            <div class="category-icon {{ item.icon_class|default('other') }}">
                                <span>{{ item.icon }}</span>
                            </div>
                            {% endif %}
                            <div class="top5-content">
                                <div class="top5-label">{{ item.label }}</div>
                                <div class="top5-bar-container">
                                    <div class="top5-bar {{ section.bar_color }}" style="width: {{ item.pct }}%;"></div>
                                </div>
                            </div>
                            <div class="top5-stats">
                                <div class="top5-value">{{ item.value_display }}</div>
                                {% if item.sub_value %}
                                <div class="top5-sub">{{ item.sub_value }}</div>
                                {% endif %}
                            </div>
                        </div>
                        {% endfor %}
                        {% if not section.curr_items %}
                        <div style="text-align: center; color: #94a3b8; padding: 2rem; font-style: italic;">데이터 없음</div>
                        {% endif %}
                    </div>
                </div>
            </div>
            {% endfor %}
            {% endif %}

            <!-- Blog Key Insights Box (Yellow) -->
            {% if dept.id == 'blog' and dept.key_insights %}
            <div class="key-insight-box">
                <div class="key-insight-header">
                    <span>💡</span> 핵심 인사이트
                </div>
                {% if dept.key_insights.top_post %}
                <div class="key-insight-item">
                    <div class="key-insight-label">🏆 가장 조회수 높은 포스팅</div>
                    <div class="key-insight-title">{{ dept.key_insights.top_post.title }}</div>
                    <div class="key-insight-value">조회수 <span class="highlight">{{ dept.key_insights.top_post.views }}</span>회</div>
                </div>
                {% endif %}
                {% if dept.key_insights.top_keyword %}
                <div class="key-insight-item">
                    <div class="key-insight-label">🔍 가장 유입 많은 검색 키워드</div>
                    <div class="key-insight-title">{{ dept.key_insights.top_keyword.keyword }}</div>
                    <div class="key-insight-value">유입 비율 <span class="highlight">{{ dept.key_insights.top_keyword.ratio }}</span>%</div>
                </div>
                {% endif %}
            </div>
            {% endif %}

            <!-- Blog Posting List - Side by Side Comparison -->
            {% if dept.id == 'blog' and (dept.posting_list or dept.prev_posting_list) %}
            <div class="posting-list-section">
                <div class="posting-list-header">
                    <span>📋</span> 발행 완료 포스팅 목록
                </div>
                <div class="posting-comparison">
                    <!-- 전월 포스팅 -->
                    <div class="posting-column">
                        <div class="posting-column-header">{{ dept.prev_month }} (전월)</div>
                        {% if dept.prev_posting_list %}
                        <table class="posting-table">
                            <thead>
                                <tr>
                                    <th>포스팅 제목</th>
                                    <th class="date center">발행일</th>
                                </tr>
                            </thead>
                            <tbody>
                                {% for post in dept.prev_posting_list %}
                                <tr>
                                    <td>
                                        <div class="posting-title">
                                            {% if post.url %}
                                            <a href="{{ post.url }}" target="_blank">{{ post.title }}</a>
                                            {% else %}
                                            {{ post.title }}
                                            {% endif %}
                                        </div>
                                    </td>
                                    <td class="date center">{{ post.date }}</td>
                                </tr>
                                {% endfor %}
                            </tbody>
                        </table>
                        {% else %}
                        <div class="posting-empty">데이터 없음</div>
                        {% endif %}
                    </div>
                    <!-- 당월 포스팅 -->
                    <div class="posting-column current">
                        <div class="posting-column-header">{{ dept.curr_month }} (당월)</div>
                        {% if dept.posting_list %}
                        <table class="posting-table">
                            <thead>
                                <tr>
                                    <th>포스팅 제목</th>
                                    <th class="date center">발행일</th>
                                </tr>
                            </thead>
                            <tbody>
                                {% for post in dept.posting_list %}
                                <tr>
                                    <td>
                                        <div class="posting-title">
                                            {% if post.url %}
                                            <a href="{{ post.url }}" target="_blank">{{ post.title }}</a>
                                            {% else %}
                                            {{ post.title }}
                                            {% endif %}
                                        </div>
                                    </td>
                                    <td class="date center">{{ post.date }}</td>
                                </tr>
                                {% endfor %}
                            </tbody>
                        </table>
                        {% else %}
                        <div class="posting-empty">데이터 없음</div>
                        {% endif %}
                    </div>
                </div>
            </div>
            {% endif %}

            <!-- Ads 4-column ranking grid -->
            {% if dept.id == 'ads' and dept.ads_ranking_data %}
            <div class="ads-ranking-grid">
                <!-- 전월 노출수 TOP5 -->
                <div class="ads-ranking-box">
                    <div class="ads-ranking-header">
                        <span class="icon">👁️</span> 노출수 기준 TOP 5
                    </div>
                    <div class="ads-ranking-list">
                        {% for item in dept.ads_ranking_data.prev_impressions %}
                        <div class="ads-ranking-item">
                            <div class="ads-ranking-num">{{ loop.index }}</div>
                            <div class="ads-ranking-content">
                                <div class="ads-ranking-keyword">{{ item.keyword }}</div>
                                <div class="ads-ranking-bar-container">
                                    <div class="ads-ranking-bar impressions" style="width: {{ item.pct }}%;"></div>
                                </div>
                                <div class="ads-ranking-stats">
                                    <div class="ads-ranking-stat">
                                        <span class="ads-ranking-stat-label">노출</span>
                                        <span class="ads-ranking-stat-value">{{ item.impressions }}</span>
                                    </div>
                                    <div class="ads-ranking-stat">
                                        <span class="ads-ranking-stat-label">클릭</span>
                                        <span class="ads-ranking-stat-value highlight">{{ item.clicks }}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        {% endfor %}
                        {% if not dept.ads_ranking_data.prev_impressions %}
                        <div style="text-align: center; color: #94a3b8; padding: 1rem; font-size: 0.8125rem;">데이터 없음</div>
                        {% endif %}
                    </div>
                </div>

                <!-- 전월 클릭수 TOP5 -->
                <div class="ads-ranking-box">
                    <div class="ads-ranking-header">
                        <span class="icon">👆</span> 클릭수 기준 TOP 5
                    </div>
                    <div class="ads-ranking-list">
                        {% for item in dept.ads_ranking_data.prev_clicks %}
                        <div class="ads-ranking-item">
                            <div class="ads-ranking-num">{{ loop.index }}</div>
                            <div class="ads-ranking-content">
                                <div class="ads-ranking-keyword">{{ item.keyword }}</div>
                                <div class="ads-ranking-bar-container">
                                    <div class="ads-ranking-bar clicks" style="width: {{ item.pct }}%;"></div>
                                </div>
                                <div class="ads-ranking-stats">
                                    <div class="ads-ranking-stat">
                                        <span class="ads-ranking-stat-label">노출</span>
                                        <span class="ads-ranking-stat-value">{{ item.impressions }}</span>
                                    </div>
                                    <div class="ads-ranking-stat">
                                        <span class="ads-ranking-stat-label">클릭</span>
                                        <span class="ads-ranking-stat-value highlight">{{ item.clicks }}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        {% endfor %}
                        {% if not dept.ads_ranking_data.prev_clicks %}
                        <div style="text-align: center; color: #94a3b8; padding: 1rem; font-size: 0.8125rem;">데이터 없음</div>
                        {% endif %}
                    </div>
                </div>

                <!-- 당월 노출수 TOP5 -->
                <div class="ads-ranking-box current">
                    <div class="ads-ranking-header">
                        <span class="icon">👁️</span> 노출수 기준 TOP 5
                    </div>
                    <div class="ads-ranking-list">
                        {% for item in dept.ads_ranking_data.curr_impressions %}
                        <div class="ads-ranking-item">
                            <div class="ads-ranking-num">{{ loop.index }}</div>
                            <div class="ads-ranking-content">
                                <div class="ads-ranking-keyword">{{ item.keyword }}</div>
                                <div class="ads-ranking-bar-container">
                                    <div class="ads-ranking-bar impressions" style="width: {{ item.pct }}%;"></div>
                                </div>
                                <div class="ads-ranking-stats">
                                    <div class="ads-ranking-stat">
                                        <span class="ads-ranking-stat-label">노출</span>
                                        <span class="ads-ranking-stat-value">{{ item.impressions }}</span>
                                    </div>
                                    <div class="ads-ranking-stat">
                                        <span class="ads-ranking-stat-label">클릭</span>
                                        <span class="ads-ranking-stat-value highlight">{{ item.clicks }}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        {% endfor %}
                        {% if not dept.ads_ranking_data.curr_impressions %}
                        <div style="text-align: center; color: #94a3b8; padding: 1rem; font-size: 0.8125rem;">데이터 없음</div>
                        {% endif %}
                    </div>
                </div>

                <!-- 당월 클릭수 TOP5 -->
                <div class="ads-ranking-box current">
                    <div class="ads-ranking-header">
                        <span class="icon">👆</span> 클릭수 기준 TOP 5
                    </div>
                    <div class="ads-ranking-list">
                        {% for item in dept.ads_ranking_data.curr_clicks %}
                        <div class="ads-ranking-item">
                            <div class="ads-ranking-num">{{ loop.index }}</div>
                            <div class="ads-ranking-content">
                                <div class="ads-ranking-keyword">{{ item.keyword }}</div>
                                <div class="ads-ranking-bar-container">
                                    <div class="ads-ranking-bar clicks" style="width: {{ item.pct }}%;"></div>
                                </div>
                                <div class="ads-ranking-stats">
                                    <div class="ads-ranking-stat">
                                        <span class="ads-ranking-stat-label">노출</span>
                                        <span class="ads-ranking-stat-value">{{ item.impressions }}</span>
                                    </div>
                                    <div class="ads-ranking-stat">
                                        <span class="ads-ranking-stat-label">클릭</span>
                                        <span class="ads-ranking-stat-value highlight">{{ item.clicks }}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        {% endfor %}
                        {% if not dept.ads_ranking_data.curr_clicks %}
                        <div style="text-align: center; color: #94a3b8; padding: 1rem; font-size: 0.8125rem;">데이터 없음</div>
                        {% endif %}
                    </div>
                </div>
            </div>
            {% endif %}

            <!-- YouTube specific sections -->
            {% if dept.id == 'youtube' %}
            <!-- Production metrics (제작 성과) -->
            {% if dept.prev_production_metrics or dept.curr_production_metrics %}
            <div style="margin-bottom: 1.5rem;">
                <h3 style="font-size: 1rem; font-weight: 700; color: #1e293b; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                    <span>🎬</span> 제작 성과 ([영상팀])
                </h3>
                <div class="month-comparison">
                    <div class="month-column">
                        <div class="metrics-grid cols-2">
                            {% for metric in dept.prev_production_metrics %}
                            <div class="metric-card {{ metric.bg_class|default('bg-gray') }}">
                                <div class="metric-icon-box {{ metric.icon_box_class|default('blue') }}">
                                    <span style="filter: brightness(0) invert(1);">{{ metric.icon }}</span>
                                </div>
                                <div class="metric-label">{{ metric.label }}</div>
                                <div class="metric-value">{{ metric.value }}<span class="metric-unit">{{ metric.unit|default('') }}</span></div>
                            </div>
                            {% endfor %}
                        </div>
                    </div>
                    <div class="month-column current">
                        <div class="metrics-grid cols-2">
                            {% for metric in dept.curr_production_metrics %}
                            <div class="metric-card {{ metric.bg_class|default('') }}">
                                <div class="metric-icon-box {{ metric.icon_box_class|default('blue') }}">
                                    <span style="filter: brightness(0) invert(1);">{{ metric.icon }}</span>
                                </div>
                                <div class="metric-label" style="color: {{ metric.label_color|default('#64748b') }};">{{ metric.label }}</div>
                                <div class="metric-value">{{ metric.value }}<span class="metric-unit">{{ metric.unit|default('') }}</span></div>
                            </div>
                            {% endfor %}
                        </div>
                    </div>
                </div>
            </div>
            {% endif %}

            <!-- Video type distribution (영상 종류별 분포) -->
            {% if dept.video_type_distribution %}
            <div class="video-dist-section">
                <h3 class="video-dist-header"><span>📊</span> 영상 종류별 분포</h3>
                <div class="month-comparison">
                    <div class="month-column">
                        {% if dept.video_type_distribution.prev.total > 0 %}
                        <div class="video-dist-bar">
                            {% if dept.video_type_distribution.prev.longform.pct > 0 %}
                            <div class="video-dist-segment longform" style="width: {{ dept.video_type_distribution.prev.longform.pct }}%;">
                                롱폼 {{ dept.video_type_distribution.prev.longform.count }}건 ({{ dept.video_type_distribution.prev.longform.pct }}%)
                            </div>
                            {% endif %}
                            {% if dept.video_type_distribution.prev.shortform.pct > 0 %}
                            <div class="video-dist-segment shortform" style="width: {{ dept.video_type_distribution.prev.shortform.pct }}%;">
                                숏폼 {{ dept.video_type_distribution.prev.shortform.count }}건 ({{ dept.video_type_distribution.prev.shortform.pct }}%)
                            </div>
                            {% endif %}
                        </div>
                        <div class="video-dist-legend">
                            <div class="video-dist-legend-item">
                                <div class="video-dist-legend-dot longform"></div>
                                <span>롱폼 {{ dept.video_type_distribution.prev.longform.count }}건</span>
                            </div>
                            <div class="video-dist-legend-item">
                                <div class="video-dist-legend-dot shortform"></div>
                                <span>숏폼 {{ dept.video_type_distribution.prev.shortform.count }}건</span>
                            </div>
                        </div>
                        {% else %}
                        <div style="text-align: center; color: #94a3b8; padding: 1.5rem; font-style: italic;">데이터 없음</div>
                        {% endif %}
                    </div>
                    <div class="month-column current">
                        {% if dept.video_type_distribution.curr.total > 0 %}
                        <div class="video-dist-bar">
                            {% if dept.video_type_distribution.curr.longform.pct > 0 %}
                            <div class="video-dist-segment longform" style="width: {{ dept.video_type_distribution.curr.longform.pct }}%;">
                                롱폼 {{ dept.video_type_distribution.curr.longform.count }}건 ({{ dept.video_type_distribution.curr.longform.pct }}%)
                            </div>
                            {% endif %}
                            {% if dept.video_type_distribution.curr.shortform.pct > 0 %}
                            <div class="video-dist-segment shortform" style="width: {{ dept.video_type_distribution.curr.shortform.pct }}%;">
                                숏폼 {{ dept.video_type_distribution.curr.shortform.count }}건 ({{ dept.video_type_distribution.curr.shortform.pct }}%)
                            </div>
                            {% endif %}
                        </div>
                        <div class="video-dist-legend">
                            <div class="video-dist-legend-item">
                                <div class="video-dist-legend-dot longform"></div>
                                <span>롱폼 {{ dept.video_type_distribution.curr.longform.count }}건</span>
                            </div>
                            <div class="video-dist-legend-item">
                                <div class="video-dist-legend-dot shortform"></div>
                                <span>숏폼 {{ dept.video_type_distribution.curr.shortform.count }}건</span>
                            </div>
                        </div>
                        {% else %}
                        <div style="text-align: center; color: #94a3b8; padding: 1.5rem; font-style: italic;">데이터 없음</div>
                        {% endif %}
                    </div>
                </div>
            </div>
            {% endif %}
            {% endif %}

            <!-- Design specific sections -->
            {% if dept.id == 'design' %}
            <div style="margin-bottom: 1.5rem;">
                <!-- <h3 style="font-size: 1.125rem; font-weight: 700; color: #1e293b; margin-bottom: 1rem;">🎨 디자인 작업 현황</h3> -->
                
                <div class="month-comparison">
                    <!-- Left Column: Previous Month -->
                    <div class="month-column">
                        <div class="month-title prev">{{ dept.prev_month }} 디자인 성과</div>
                        
                        <!-- Metric Cards (Pink) -->
                        <div class="metrics-grid cols-2" style="margin-bottom: 1rem;">
                            <div class="metric-card" style="background: #fdf2f8; border: 1px solid #fce7f3;">
                                <div class="metric-icon-box" style="background: #ec4899; color: white;">
                                    <i class="fa-solid fa-layer-group"></i>
                                </div>
                                <div class="metric-label">총 작업 건수</div>
                                <div class="metric-value" style="color: #be185d;">{{ dept.tables.clinic_task_count[0].total_tasks if dept.tables.clinic_task_count else 0 }}<span class="metric-unit"> 건</span></div>
                            </div>
                            <div class="metric-card" style="background: #fdf2f8; border: 1px solid #fce7f3;">
                                <div class="metric-icon-box" style="background: #be185d; color: white;">
                                    <i class="fa-regular fa-image"></i>
                                </div>
                                <div class="metric-label">총 완료 페이지</div>
                                <div class="metric-value" style="color: #be185d;">{{ dept.tables.prev_task_list|sum(attribute='pages') }}<span class="metric-unit"> 페이지</span></div>
                            </div>
                        </div>

                        <!-- Task Table -->
                        <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                            <table class="data-table">
                                <thead style="background: #f8fafc;">
                                    <tr>
                                        <th style="padding: 12px; font-size: 0.8rem; color: #64748b;">디자인 작업명</th>
                                        <th style="padding: 12px; font-size: 0.8rem; color: #64748b; text-align: right;">수정 횟수</th>
                                        <th style="padding: 12px; font-size: 0.8rem; color: #64748b; text-align: right;">페이지 수</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {% if dept.tables.prev_task_list %}
                                    {% for task in dept.tables.prev_task_list %}
                                    <tr>
                                        <td style="padding: 12px; border-bottom: 1px solid #f1f5f9; font-size: 0.85rem;">{{ task.name }}</td>
                                        <td style="padding: 12px; border-bottom: 1px solid #f1f5f9; font-size: 0.85rem; text-align: right; color: #64748b;">{{ task.revision_count }}회</td>
                                        <td style="padding: 12px; border-bottom: 1px solid #f1f5f9; font-size: 0.85rem; text-align: right; color: #64748b;">{{ task.pages }}</td>
                                    </tr>
                                    {% endfor %}
                                    {% else %}
                                    <tr><td colspan="2" style="padding: 20px; text-align: center; color: #94a3b8;">데이터 없음</td></tr>
                                    {% endif %}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Right Column: Current Month -->
                    <div class="month-column current">
                         <div class="month-title curr">{{ dept.month }} 디자인 성과</div>
                        
                        <!-- Metric Cards (Pink) -->
                        <div class="metrics-grid cols-2" style="margin-bottom: 1rem;">
                            <div class="metric-card" style="background: #fdf2f8; border: 1px solid #fce7f3;">
                                <div class="metric-icon-box" style="background: #ec4899; color: white;">
                                    <i class="fa-solid fa-layer-group"></i>
                                </div>
                                <div class="metric-label">총 작업 건수</div>
                                <div class="metric-value" style="color: #be185d;">{{ dept.tables.curr_task_list|length }}<span class="metric-unit"> 건</span></div>
                            </div>
                            <div class="metric-card" style="background: #fdf2f8; border: 1px solid #fce7f3;">
                                <div class="metric-icon-box" style="background: #be185d; color: white;">
                                    <i class="fa-regular fa-image"></i>
                                </div>
                                <div class="metric-label">총 완료 페이지</div>
                                <div class="metric-value" style="color: #be185d;">{{ dept.tables.curr_task_list|sum(attribute='pages') }}<span class="metric-unit"> 페이지</span></div>
                            </div>
                        </div>

                         <!-- Task Table -->
                        <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                            <table class="data-table">
                                <thead style="background: #f8fafc;">
                                    <tr>
                                        <th style="padding: 12px; font-size: 0.8rem; color: #64748b;">디자인 작업명</th>
                                        <th style="padding: 12px; font-size: 0.8rem; color: #64748b; text-align: right;">수정 횟수</th>
                                        <th style="padding: 12px; font-size: 0.8rem; color: #64748b; text-align: right;">페이지 수</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {% if dept.tables.curr_task_list %}
                                    {% for task in dept.tables.curr_task_list %}
                                    <tr>
                                        <td style="padding: 12px; border-bottom: 1px solid #f1f5f9; font-size: 0.85rem;">{{ task.name }}</td>
                                        <td style="padding: 12px; border-bottom: 1px solid #f1f5f9; font-size: 0.85rem; text-align: right; color: #64748b;">{{ task.revision_count }}회</td>
                                        <td style="padding: 12px; border-bottom: 1px solid #f1f5f9; font-size: 0.85rem; text-align: right; color: #64748b;">{{ task.pages }}</td>
                                    </tr>
                                    {% endfor %}
                                    {% else %}
                                    <tr><td colspan="2" style="padding: 20px; text-align: center; color: #94a3b8;">데이터 없음</td></tr>
                                    {% endif %}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
            {% endif %}
        </div>
        {% endif %}
        {% endfor %}

        <!-- Summary Section -->
        {% if summary %}
        <div class="report-section">
            <div class="section-header">
                <div class="section-icon" style="background: #dbeafe;">
                    <span>📋</span>
                </div>
                <h2 class="section-title">종합 분석 및 실행 계획</h2>
            </div>

            <!-- Summary Box -->
            <div class="summary-section">
                <div class="summary-title">{{ summary.title }}</div>
                <div class="summary-content">{{ summary.content|safe }}</div>
            </div>

            <!-- Detailed Analysis -->
            {% if summary.analysis_sections %}
            <div style="margin-bottom: 2rem;">
                <h3 style="font-size: 1.125rem; font-weight: 700; color: #1e293b; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                    <span style="background: #3b82f6; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.875rem;">1</span>
                    상세 분석
                </h3>
                {% for section in summary.analysis_sections %}
                <div class="insight-box {{ section.color|default('blue') }}">
                    <div class="insight-title">{{ section.title }}</div>
                    <div class="insight-content">{{ section.content|safe }}</div>
                </div>
                {% endfor %}
            </div>
            {% endif %}

            <!-- Diagnosis and Strategy -->
            {% if summary.diagnosis %}
            <div style="margin-bottom: 2rem;">
                <h3 style="font-size: 1.125rem; font-weight: 700; color: #1e293b; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                    <span style="background: #3b82f6; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.875rem;">2</span>
                    핵심 진단 및 전략
                </h3>
                <div class="diagnosis-grid">
                    {% for item in summary.diagnosis %}
                    <div class="diagnosis-card">
                        <div class="diagnosis-header {{ item.header_color|default('blue') }}">{{ item.title }}</div>
                        <div class="diagnosis-content">{{ item.content|safe }}</div>
                    </div>
                    {% endfor %}
                </div>
            </div>
            {% endif %}

            <!-- Action Plan -->
            {% if summary.action_plan %}
            <div class="action-plan">
                <h3 class="action-plan-title">
                    <span style="background: #3b82f6; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.875rem;">3</span>
                    {{ summary.action_plan_month }} 실행 계획 (Action Plan)
                </h3>
                <table class="action-table">
                    <thead>
                        <tr>
                            <th>아젠다</th>
                            <th>플랜(plan)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {% for item in summary.action_plan %}
                        <tr>
                            <td class="agenda-cell">{{ item.agenda|safe }}</td>
                            <td class="plan-cell">{{ item.plan|safe }}</td>
                        </tr>
                        {% endfor %}
                    </tbody>
                </table>
            </div>
            {% endif %}
        </div>
        {% else %}
        <!-- Default Summary Section -->
        <div class="report-section">
            <div class="section-header">
                <div class="section-icon" style="background: #dbeafe;">
                    <span>📋</span>
                </div>
                <h2 class="section-title">종합 분석 및 실행 계획</h2>
            </div>

            <div class="summary-section">
                <div class="summary-title">종합 요약</div>
                <div class="summary-content">
                    전반적인 데이터 분석 결과, 각 채널별로 유의미한 성과와 개선점이 확인되었습니다.<br>
                    위 데이터를 바탕으로 다음 달 마케팅 전략을 수립하시기 바랍니다.
                </div>
            </div>

            <!-- Action Plan -->
            {% if summary.action_plan %}
            <div class="action-plan">
                <h3 class="action-plan-title">
                    <span style="background: #3b82f6; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.875rem;">1</span>
                    실행 계획 (Action Plan)
                </h3>
                <table class="action-table">
                    <thead>
                        <tr>
                            <th style="width: 40px; text-align: center;">채널</th>
                            <th style="width: 40%;">아젠다</th>
                            <th>플랜(plan)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {% for item in summary.action_plan %}
                        <tr>
                            <td class="agenda-cell" style="text-align: center; font-weight: bold; color: #334155;">{{ item.department }}</td>
                            <td class="agenda-cell">{{ item.agenda|safe }}</td>
                            <td class="plan-cell">{{ item.plan|safe }}</td>
                        </tr>
                        {% endfor %}
                    </tbody>
                </table>
            </div>
            {% endif %}
        </div>
        {% endif %}
    </div>
</body>
</html>
"""


def format_metric_value(value: Any, format_type: str = 'number') -> str:
    """Format metric value for display."""
    if value is None:
        return '-'
    if format_type == 'percent':
        return f"{value:.1f}" if isinstance(value, float) else str(value)
    if format_type == 'currency':
        return f"₩{int(value):,}"
    if isinstance(value, float):
        if abs(value) >= 1000000:
            return f"{value/1000000:,.1f}M"
        elif abs(value) >= 1000:
            return f"{value:,.0f}"
        else:
            return f"{value:,.1f}"
    return f"{value:,}" if isinstance(value, int) else str(value)


def prepare_reservation_data(result: Dict[str, Any]) -> Dict[str, Any]:
    """Prepare reservation department data."""
    curr_month = result.get('month', '-')
    prev_month = result.get('prev_month', '-')
    curr_data = result.get('current_month_data', {})
    prev_data = result.get('prev_month_data', {})
    tables = result.get('tables', {})
    kpi = result.get('kpi', {})

    # 실 예약 수 (이용일시 기준)
    actual_reservations = kpi.get('actual_reservations', 0)
    prev_actual_reservations = kpi.get('prev_actual_reservations', 0)

    # Metrics - 아이콘 박스 스타일 적용
    prev_metrics = [
        {'icon': '📋', 'label': '총 신청', 'value': prev_data.get('total_reservations', 0), 'unit': ' 건', 'icon_box_class': 'blue', 'bg_class': 'bg-gray'},
        {'icon': '✅', 'label': '내원 확정', 'value': prev_actual_reservations, 'unit': ' 건', 'icon_box_class': 'green', 'bg_class': 'bg-green', 'color_class': 'green'},
        {'icon': '❌', 'label': '취소/노쇼', 'value': prev_data.get('canceled_count', 0), 'unit': ' 건', 'icon_box_class': 'red', 'bg_class': 'bg-red', 'color_class': 'red'},
    ]
    curr_metrics = [
        {'icon': '📋', 'label': '총 신청', 'value': curr_data.get('total_reservations', 0), 'unit': ' 건', 'icon_box_class': 'blue', 'bg_class': 'bg-blue', 'label_color': '#3b82f6'},
        {'icon': '✅', 'label': '내원 확정', 'value': actual_reservations, 'unit': ' 건', 'icon_box_class': 'green', 'bg_class': 'bg-green', 'color_class': 'green', 'label_color': '#22c55e'},
        {'icon': '❌', 'label': '취소/노쇼', 'value': curr_data.get('canceled_count', 0), 'unit': ' 건', 'icon_box_class': 'red', 'bg_class': 'bg-red', 'color_class': 'red', 'label_color': '#ef4444'},
    ]

    # Helper function to get icon and class for how_found
    def get_how_found_icon(label: str):
        label_lower = label.lower() if label else ''
        if '온라인' in label_lower or '인터넷' in label_lower or '검색' in label_lower or '네이버' in label_lower:
            return '🔍', 'online'
        elif '오프라인' in label_lower or '간판' in label_lower or '지나가다' in label_lower:
            return '🏢', 'offline'
        elif '지인' in label_lower or '소개' in label_lower or '추천' in label_lower:
            return '👥', 'referral'
        else:
            return '❓', 'other'

    # TOP5 sections
    top5_sections = []

    # Treatment TOP5 - 진료 항목별 색상 바
    prev_treatment = tables.get('prev_treatment_top5', [])
    curr_treatment = tables.get('treatment_top5', [])
    if prev_treatment or curr_treatment:
        prev_max = max((t.get('count', 0) for t in prev_treatment), default=1) or 1
        curr_max = max((t.get('count', 0) for t in curr_treatment), default=1) or 1

        # Treatment color mapping
        treatment_colors = ['#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4']

        top5_sections.append({
            'title': '주요 희망 진료 TOP5',
            'icon': '🦷',
            'bar_color': 'multi',
            'prev_items': [{'label': t.get('treatment', ''), 'value_display': f"{t.get('count', 0)}건", 'pct': (t.get('count', 0) / prev_max) * 100} for t in prev_treatment[:5]],
            'curr_items': [{'label': t.get('treatment', ''), 'value_display': f"{t.get('count', 0)}건", 'pct': (t.get('count', 0) / curr_max) * 100} for t in curr_treatment[:5]],
        })

    # How found TOP5 - 아이콘 추가
    prev_how_found = tables.get('prev_how_found_top5', [])
    curr_how_found = tables.get('how_found_top5', [])
    if prev_how_found or curr_how_found:
        prev_max = max((t.get('count', 0) for t in prev_how_found), default=1) or 1
        curr_max = max((t.get('count', 0) for t in curr_how_found), default=1) or 1
        prev_total = sum(t.get('count', 0) for t in prev_how_found) or 1
        curr_total = sum(t.get('count', 0) for t in curr_how_found) or 1

        def make_how_found_item(t, total, max_val):
            label = t.get('how_found', '')
            icon, icon_class = get_how_found_icon(label)
            return {
                'label': label,
                'value_display': f"{(t.get('count', 0) / total * 100):.1f}%",
                'sub_value': f"{t.get('count', 0)}건",
                'pct': (t.get('count', 0) / max_val) * 100,
                'icon': icon,
                'icon_class': icon_class
            }

        top5_sections.append({
            'title': '어떻게 치과를 알게 되었나요? TOP5',
            'icon': '🔍',
            'bar_color': 'green',
            'prev_items': [make_how_found_item(t, prev_total, prev_max) for t in prev_how_found[:5]],
            'curr_items': [make_how_found_item(t, curr_total, curr_max) for t in curr_how_found[:5]],
        })

    # Cancel reason TOP5 - 빨간색 바
    prev_cancel = tables.get('prev_cancel_reason_top5', [])
    curr_cancel = tables.get('cancel_reason_top5', [])
    if prev_cancel or curr_cancel:
        prev_max = max((t.get('count', 0) for t in prev_cancel), default=1) or 1
        curr_max = max((t.get('count', 0) for t in curr_cancel), default=1) or 1
        top5_sections.append({
            'title': '주요 예약 취소 사유 TOP5',
            'icon': '❌',
            'bar_color': 'red',
            'prev_items': [{'label': t.get('cancel_reason', ''), 'value_display': f"{t.get('count', 0)}건", 'pct': (t.get('count', 0) / prev_max) * 100} for t in prev_cancel[:5]],
            'curr_items': [{'label': t.get('cancel_reason', ''), 'value_display': f"{t.get('count', 0)}건", 'pct': (t.get('count', 0) / curr_max) * 100} for t in curr_cancel[:5]],
        })

    return {
        'prev_month': prev_month,
        'curr_month': curr_month,
        'prev_metrics': prev_metrics,
        'curr_metrics': curr_metrics,
        'top5_sections': top5_sections,
    }


def prepare_blog_data(result: Dict[str, Any]) -> Dict[str, Any]:
    """Prepare blog department data."""
    curr_month = result.get('month', '-')
    prev_month = result.get('prev_month', '-')
    curr_data = result.get('current_month_data', {})
    prev_data = result.get('prev_month_data', {})
    curr_work = curr_data.get('work', {})
    prev_work = prev_data.get('work', {})
    tables = result.get('tables', {})
    diagnosis = result.get('diagnosis', {})
    insights_data = result.get('insights', {})
    kpi = result.get('kpi', {})

    # KPI에서 이월 건수 가져오기
    # CSV 파일의 "지난달 이월 건수" 컬럼 값을 그대로 사용
    prev_contract = kpi.get('prev_contract_count', 0) or prev_work.get('contract_count', 0) or 0
    prev_published = kpi.get('prev_published_count', 0) or prev_work.get('published_count', 0) or 0
    prev_carryover = kpi.get('prev_carryover_count', 0) or max(0, prev_contract - prev_published)

    curr_contract = kpi.get('contract_count', 0) or curr_work.get('contract_count', 0) or 0
    curr_published = kpi.get('published_count', 0) or curr_work.get('published_count', 0) or 0
    # 당월 이월 건수 = CSV 파일의 "지난달 이월 건수" 컬럼 값 사용 (계산하지 않음)
    curr_carryover = kpi.get('carryover_count', 0) or max(0, curr_contract - curr_published)

    # 자료 미수신 건수
    pending_data_count = kpi.get('pending_data_count', 0)

    # Metrics - Row 1 (핵심 요약) - 아이콘 박스 스타일
    prev_metrics = [
        {'icon': '👁️', 'label': '총 조회수', 'value': f"{prev_data.get('total_views', 0):,}", 'unit': '회', 'icon_box_class': 'blue', 'bg_class': 'bg-gray'},
        {'icon': '📄', 'label': '계약 건수', 'value': prev_contract, 'unit': '건', 'icon_box_class': 'purple', 'bg_class': 'bg-gray'},
    ]
    curr_metrics = [
        {'icon': '👁️', 'label': '총 조회수', 'value': f"{curr_data.get('total_views', 0):,}", 'unit': '회', 'icon_box_class': 'blue', 'bg_class': 'bg-blue', 'label_color': '#3b82f6'},
        {'icon': '📄', 'label': '계약 건수', 'value': curr_contract, 'unit': '건', 'icon_box_class': 'purple', 'bg_class': '', 'label_color': '#8b5cf6'},
    ]

    # Metrics - Row 2 (이월 건수 추가) - 아이콘 박스 스타일
    prev_metrics_row2 = [
        {'icon': '✅', 'label': '발행 완료', 'value': prev_published, 'unit': '건', 'color_class': 'green', 'icon_box_class': 'green', 'bg_class': 'bg-gray'},
        {'icon': '➡️', 'label': '이월(지난달 이월 건수)', 'value': prev_carryover, 'unit': '건', 'color_class': 'orange' if prev_carryover > 0 else '', 'icon_box_class': 'orange', 'bg_class': 'bg-gray'},
    ]
    # 자료 미수신 건수가 있으면 note로 표시 (소명)
    curr_carryover_note = f"⏳ 병원 측 임상 자료 대기 중 ({pending_data_count}건)" if pending_data_count > 0 else None
    curr_metrics_row2 = [
        {'icon': '✅', 'label': '발행 완료', 'value': curr_published, 'unit': '건', 'color_class': 'green', 'icon_box_class': 'green', 'bg_class': 'bg-green', 'label_color': '#22c55e'},
        {'icon': '➡️', 'label': '이월(지난달 이월 건수)', 'value': curr_carryover, 'unit': '건', 'color_class': 'orange' if curr_carryover > 0 else '', 'icon_box_class': 'orange', 'bg_class': '', 'note': curr_carryover_note},
    ]

    # TOP5 sections
    top5_sections = []

    # Views TOP5 (당월 기준 - 조회수 순위 데이터는 누적 기준)
    views_top5 = tables.get('views_top5', [])
    prev_views_top5 = tables.get('prev_views_top5', [])
    if views_top5 or prev_views_top5:
        curr_max = max((t.get('views', 0) for t in views_top5), default=1) or 1
        prev_max = max((t.get('views', 0) for t in prev_views_top5), default=1) or 1
        top5_sections.append({
            'title': '조회수 TOP 5 게시물',
            'icon': '👁️',
            'bar_color': 'blue',
            'prev_items': [{'label': t.get('title', '')[:40], 'value_display': f"{t.get('views', 0):,}회", 'pct': (t.get('views', 0) / prev_max) * 100} for t in prev_views_top5[:5]] if prev_views_top5 else [],
            'curr_items': [{'label': t.get('title', '')[:40], 'value_display': f"{t.get('views', 0):,}회", 'pct': (t.get('views', 0) / curr_max) * 100} for t in views_top5[:5]],
            'no_prev_data_msg': '전월 데이터 없음' if not prev_views_top5 else None,
        })

    # Traffic TOP5 + 기타 (총 6개)
    traffic_top5 = tables.get('traffic_top5', [])
    prev_traffic_top5 = tables.get('prev_traffic_top5', [])
    if traffic_top5 or prev_traffic_top5:
        curr_max = max((t.get('ratio', 0) for t in traffic_top5), default=1) or 1
        prev_max = max((t.get('ratio', 0) for t in prev_traffic_top5), default=1) or 1
        top5_sections.append({
            'title': '유입경로 TOP 키워드',
            'icon': '🔍',
            'bar_color': 'green',
            'prev_items': [{'label': t.get('source', ''), 'value_display': f"{t.get('ratio', 0):.1f}%", 'pct': (t.get('ratio', 0) / prev_max) * 100} for t in prev_traffic_top5[:6]] if prev_traffic_top5 else [],
            'curr_items': [{'label': t.get('source', ''), 'value_display': f"{t.get('ratio', 0):.1f}%", 'pct': (t.get('ratio', 0) / curr_max) * 100} for t in traffic_top5[:6]],
            'no_prev_data_msg': '전월 데이터 없음' if not prev_traffic_top5 else None,
        })

    # Key insights for yellow box
    key_insights = {}

    # Get top post from views_top5
    views_top5 = tables.get('views_top5', [])
    if views_top5:
        top_post = views_top5[0]
        key_insights['top_post'] = {
            'title': top_post.get('title', ''),
            'views': f"{top_post.get('views', 0):,}"
        }

    # Get top keyword from traffic_top5
    traffic_top5 = tables.get('traffic_top5', [])
    if traffic_top5:
        top_keyword = traffic_top5[0]
        key_insights['top_keyword'] = {
            'keyword': top_keyword.get('source', ''),
            'ratio': f"{top_keyword.get('ratio', 0):.1f}"
        }

    # 발행일 형식 변환 함수 (요일 제거, YYYY-MM-DD 형식으로)
    def format_publish_date(date_str: str) -> str:
        """발행일을 YYYY-MM-DD 형식으로 변환 (요일 제거)"""
        if not date_str or date_str.lower() == 'nan':
            return ''
        # 이미 YYYY-MM-DD 형식이면 그대로 반환
        import re
        if re.match(r'^\d{4}-\d{2}-\d{2}$', date_str):
            return date_str
        # YYYY.MM.DD(요일) 형식 처리
        match = re.match(r'^(\d{4})\.(\d{1,2})\.(\d{1,2})', date_str)
        if match:
            year, month, day = match.groups()
            return f"{year}-{int(month):02d}-{int(day):02d}"
        # 다른 형식 시도
        try:
            from datetime import datetime
            for fmt in ['%Y.%m.%d', '%Y/%m/%d', '%Y-%m-%d']:
                try:
                    dt = datetime.strptime(date_str.split('(')[0].strip(), fmt)
                    return dt.strftime('%Y-%m-%d')
                except ValueError:
                    continue
        except:
            pass
        return date_str

    # Posting list (발행 완료 포스팅) - 당월 데이터
    posting_list = []
    # Use posting_list from tables (filtered by 완료 status)
    raw_posting_list = tables.get('posting_list', [])

    # views_top5에서 발행일 정보를 매핑하기 위한 딕셔너리 생성
    views_top5 = tables.get('views_top5', [])
    views_map = {post.get('title', ''): post for post in views_top5}

    for post in raw_posting_list:
        status = post.get('status', '').strip().lower()
        # 발행 완료 상태만 표시
        if status in ['완료', '발행완료', '발행 완료']:
            title = post.get('title', '')
            url = post.get('url', '')
            if title and title.lower() != 'nan':
                # 먼저 posting_list에 저장된 write_date 사용
                write_date = post.get('write_date', '')
                # 없으면 views_top5에서 발행일 정보 찾기
                if not write_date:
                    views_info = views_map.get(title, {})
                    write_date = views_info.get('write_date', '')

                posting_list.append({
                    'title': title,
                    'url': url if url and url.lower() != 'nan' else '',
                    'date': format_publish_date(write_date) if write_date else ''
                })
    # Limit to 10
    posting_list = posting_list[:10]

    # If no posting_list, try to use views_top5 as fallback (has write_date)
    if not posting_list and views_top5:
        for post in views_top5[:5]:
            posting_list.append({
                'title': post.get('title', ''),
                'url': '',
                'date': format_publish_date(post.get('write_date', ''))
            })

    # 전월 포스팅 리스트 준비
    prev_posting_list = []
    raw_prev_posting_list = tables.get('prev_posting_list', [])

    # prev_views_top5에서 발행일 정보를 매핑하기 위한 딕셔너리 생성
    prev_views_top5 = tables.get('prev_views_top5', [])
    prev_views_map = {post.get('title', ''): post for post in prev_views_top5}

    for post in raw_prev_posting_list:
        status = post.get('status', '').strip().lower()
        # 발행 완료 상태만 표시
        if status in ['완료', '발행완료', '발행 완료']:
            title = post.get('title', '')
            url = post.get('url', '')
            if title and title.lower() != 'nan':
                # 먼저 posting_list에 저장된 write_date 사용
                write_date = post.get('write_date', '')
                # 없으면 prev_views_top5에서 발행일 정보 찾기
                if not write_date:
                    views_info = prev_views_map.get(title, {})
                    write_date = views_info.get('write_date', '')

                prev_posting_list.append({
                    'title': title,
                    'url': url if url and url.lower() != 'nan' else '',
                    'date': format_publish_date(write_date) if write_date else ''
                })
    # Limit to 10
    prev_posting_list = prev_posting_list[:10]

    # If no prev_posting_list, try to use prev_views_top5 as fallback
    if not prev_posting_list and prev_views_top5:
        for post in prev_views_top5[:5]:
            prev_posting_list.append({
                'title': post.get('title', ''),
                'url': '',
                'date': format_publish_date(post.get('write_date', ''))
            })

    return {
        'prev_month': prev_month,
        'curr_month': curr_month,
        'prev_metrics': prev_metrics,
        'curr_metrics': curr_metrics,
        'prev_metrics_row2': prev_metrics_row2,
        'curr_metrics_row2': curr_metrics_row2,
        'top5_sections': top5_sections,
        'key_insights': key_insights if key_insights else None,
        'posting_list': posting_list if posting_list else None,
        'prev_posting_list': prev_posting_list if prev_posting_list else None,
    }


def prepare_ads_data(result: Dict[str, Any]) -> Dict[str, Any]:
    """Prepare ads department data."""
    curr_month = result.get('month', '-')
    prev_month = result.get('prev_month', '-')
    curr_data = result.get('current_month_data', {})
    prev_data = result.get('prev_month_data', {})
    tables = result.get('tables', {})
    kpi = result.get('kpi', {})

    curr_campaign = curr_data.get('campaign', {})
    prev_campaign = prev_data.get('campaign', {})

    # CPA 데이터
    cpa = kpi.get('cpa', 0)
    prev_cpa = kpi.get('prev_cpa', 0)

    # Metrics - Ads Revisions (노출수, 클릭수 위주)
    # CPA, 광고비 제거 요청 반영
    
    # Calculate Impressions properly
    # If not directly available in kpi/metrics, sum from campaign or use what provided
    curr_imp_val = 0
    prev_imp_val = 0
    
    # Try to get from kpi or metrics if available
    if 'total_impressions' in curr_data:
        curr_imp_val = curr_data['total_impressions']
    elif 'metrics' in kpi and 'impressions' in kpi['metrics']:
        curr_imp_val = kpi['metrics']['impressions']
    
    if 'total_impressions' in prev_data:
        prev_imp_val = prev_data['total_impressions']

    prev_metrics = [
        {'icon': '👁️', 'label': '노출수', 'value': f"{int(prev_imp_val):,}", 'unit': ' 회', 'icon_box_class': 'blue', 'bg_class': 'bg-gray'},
        {'icon': '👆', 'label': '클릭수', 'value': f"{prev_campaign.get('total_clicks', 0):,}", 'unit': ' 회', 'icon_box_class': 'green', 'bg_class': 'bg-gray'},
    ]
    curr_metrics = [
        {'icon': '👁️', 'label': '노출수', 'value': f"{int(curr_imp_val):,}", 'unit': ' 회', 'icon_box_class': 'blue', 'bg_class': 'bg-blue', 'label_color': '#3b82f6'},
        {'icon': '👆', 'label': '클릭수', 'value': f"{curr_campaign.get('total_clicks', 0):,}", 'unit': ' 회', 'icon_box_class': 'green', 'bg_class': 'bg-green', 'label_color': '#22c55e'},
    ]

    # TOP5 sections
    top5_sections = []

    # TOP5 sections - 중복 제거 (아래 4열 그리드로 대체)
    top5_sections = []

    # TOP5 sections (데이터 추출)
    prev_impressions = tables.get('prev_keyword_top5_impressions', [])
    curr_impressions = tables.get('keyword_top5_impressions', [])
    prev_clicks = tables.get('prev_keyword_top5_clicks', [])
    curr_clicks = tables.get('keyword_top5_clicks', [])

    # CPA 배너 데이터
    cpa_growth = kpi.get('cpa_growth', 0)
    actual_reservations = kpi.get('actual_reservations', 0)
    cpa_banner = None
    if cpa > 0:
        cpa_change_text = ""
        cpa_change_color = "#64748b"
        if prev_cpa > 0:
            if cpa_growth < 0:
                cpa_change_text = f"전월 대비 {abs(cpa_growth):.1f}% 절감"
                cpa_change_color = "#22c55e"
            elif cpa_growth > 0:
                cpa_change_text = f"전월 대비 {cpa_growth:.1f}% 증가"
                cpa_change_color = "#ef4444"
        cpa_banner = {
            'cpa': f"₩{int(cpa):,}",
            'actual_reservations': actual_reservations,
            'change_text': cpa_change_text,
            'change_color': cpa_change_color
        }

    # 4열 광고 랭킹 데이터 (전월 노출/클릭, 당월 노출/클릭)
    ads_ranking_data = {}

    # 전월 노출수 TOP5
    if prev_impressions:
        prev_imp_max = max((t.get('impressions', 0) for t in prev_impressions), default=1) or 1
        ads_ranking_data['prev_impressions'] = [
            {
                'keyword': t.get('keyword', ''),
                'impressions': f"{t.get('impressions', 0):,}",
                'clicks': f"{t.get('clicks', 0):,}",
                'pct': (t.get('impressions', 0) / prev_imp_max) * 100
            } for t in prev_impressions[:5]
        ]
    else:
        ads_ranking_data['prev_impressions'] = []

    # 전월 클릭수 TOP5
    if prev_clicks:
        prev_clk_max = max((t.get('clicks', 0) for t in prev_clicks), default=1) or 1
        ads_ranking_data['prev_clicks'] = [
            {
                'keyword': t.get('keyword', ''),
                'impressions': f"{t.get('impressions', 0):,}",
                'clicks': f"{t.get('clicks', 0):,}",
                'pct': (t.get('clicks', 0) / prev_clk_max) * 100
            } for t in prev_clicks[:5]
        ]
    else:
        ads_ranking_data['prev_clicks'] = []

    # 당월 노출수 TOP5
    if curr_impressions:
        curr_imp_max = max((t.get('impressions', 0) for t in curr_impressions), default=1) or 1
        ads_ranking_data['curr_impressions'] = [
            {
                'keyword': t.get('keyword', ''),
                'impressions': f"{t.get('impressions', 0):,}",
                'clicks': f"{t.get('clicks', 0):,}",
                'pct': (t.get('impressions', 0) / curr_imp_max) * 100
            } for t in curr_impressions[:5]
        ]
    else:
        ads_ranking_data['curr_impressions'] = []

    # 당월 클릭수 TOP5
    if curr_clicks:
        curr_clk_max = max((t.get('clicks', 0) for t in curr_clicks), default=1) or 1
        ads_ranking_data['curr_clicks'] = [
            {
                'keyword': t.get('keyword', ''),
                'impressions': f"{t.get('impressions', 0):,}",
                'clicks': f"{t.get('clicks', 0):,}",
                'pct': (t.get('clicks', 0) / curr_clk_max) * 100
            } for t in curr_clicks[:5]
        ]
    else:
        ads_ranking_data['curr_clicks'] = []

    return {
        'prev_month': prev_month,
        'curr_month': curr_month,
        'prev_metrics': prev_metrics,
        'curr_metrics': curr_metrics,
        'top5_sections': top5_sections,
        'cpa_banner': cpa_banner,
        'ads_ranking_data': ads_ranking_data,
    }


def prepare_design_data(result: Dict[str, Any]) -> Dict[str, Any]:
    """Prepare design department data."""
    curr_month = result.get('month', '-')
    prev_month = result.get('prev_month', '-')
    tables = result.get('tables', {})

    # Use aggregated_tasks from design.py
    aggregated_tasks = tables.get('aggregated_tasks', [])
    
    design_tasks = []
    for task in aggregated_tasks:
        design_tasks.append({
            'name': task.get('task_name', ''),
            'avg_rev': task.get('avg_revision', 0),
            'prev': task.get('prev_count', 0),
            'curr': task.get('curr_count', 0)
        })

    return {
        'prev_month': prev_month,
        'curr_month': curr_month,
        # No metrics needed as requested by user
        'curr_metrics': [],
        'design_tasks': design_tasks,
        'tables': tables, # Added this line to fix UndefinedError
    }


def prepare_youtube_data(result: Dict[str, Any]) -> Dict[str, Any]:
    """Prepare youtube department data."""
    curr_month = result.get('month', '-')
    prev_month = result.get('prev_month', '-')
    curr_data = result.get('current_month_data', {})
    prev_data = result.get('prev_month_data', {})
    curr_content = curr_data.get('content', {})
    prev_content = prev_data.get('content', {})
    tables = result.get('tables', {})
    kpi = result.get('kpi', {})

    # 영상 종류별 통계 가져오기
    video_type_stats = tables.get('video_type_stats', {})
    prev_video_type_stats = tables.get('prev_video_type_stats', {})

    longform_stats = video_type_stats.get('롱폼', {})
    shortform_stats = video_type_stats.get('숏폼', {})
    prev_longform_stats = prev_video_type_stats.get('롱폼', {})
    prev_shortform_stats = prev_video_type_stats.get('숏폼', {})

    # Channel metrics - 채널 성과 (3개 지표)
    # 총 시청 시간은 소수점 없이 정수로 표시
    prev_watch_time = int(prev_content.get('total_watch_time', 0))
    curr_watch_time = int(curr_content.get('total_watch_time', 0))

    prev_channel_metrics = [
        {'icon': '🔴', 'label': '총 조회수', 'value': f"{prev_content.get('total_views', 0):,}", 'unit': '회', 'icon_box_class': 'red', 'bg_class': 'bg-gray'},
        {'icon': '⏱️', 'label': '총 시청 시간', 'value': f"{prev_watch_time:,}", 'unit': '시간', 'icon_box_class': 'orange', 'bg_class': 'bg-gray'},
        {'icon': '👥', 'label': '구독자 증감', 'value': f"+{prev_content.get('new_subscribers', 0)}", 'unit': '명', 'icon_box_class': 'green', 'bg_class': 'bg-gray'},
    ]
    curr_channel_metrics = [
        {'icon': '🔴', 'label': '총 조회수', 'value': f"{curr_content.get('total_views', 0):,}", 'unit': '회', 'icon_box_class': 'red', 'bg_class': 'bg-red', 'label_color': '#ef4444'},
        {'icon': '⏱️', 'label': '총 시청 시간', 'value': f"{curr_watch_time:,}", 'unit': '시간', 'icon_box_class': 'orange', 'bg_class': 'bg-orange', 'label_color': '#f97316'},
        {'icon': '👥', 'label': '구독자 증감', 'value': f"+{curr_content.get('new_subscribers', 0)}", 'unit': '명', 'icon_box_class': 'green', 'bg_class': 'bg-green', 'label_color': '#22c55e'},
    ]

    # Production metrics - 제작 성과 (계약/완료)
    prev_contract = kpi.get('prev_contract_count', 0)
    prev_completed = kpi.get('prev_completed_count', 0)
    curr_contract = kpi.get('contract_count', 0)
    curr_completed = kpi.get('completed_count', 0)

    prev_production_metrics = [
        {'icon': '📝', 'label': '계약 건수', 'value': prev_contract, 'unit': '건', 'icon_box_class': 'purple', 'bg_class': 'bg-gray'},
        {'icon': '✅', 'label': '제작 완료', 'value': prev_completed, 'unit': '건', 'icon_box_class': 'blue', 'bg_class': 'bg-gray'},
    ]
    curr_production_metrics = [
        {'icon': '📝', 'label': '계약 건수', 'value': curr_contract, 'unit': '건', 'icon_box_class': 'purple', 'bg_class': '', 'label_color': '#8b5cf6'},
        {'icon': '✅', 'label': '제작 완료', 'value': curr_completed, 'unit': '건', 'icon_box_class': 'blue', 'bg_class': 'bg-blue', 'label_color': '#3b82f6'},
    ]

    # TOP3 sections (조회수 TOP3 동영상 + 트래픽 소스 TOP3)
    top3_sections = []

    # Videos TOP3 (당월/전월 비교)
    top5_videos = tables.get('top5_videos', [])
    prev_top5_videos = tables.get('prev_top5_videos', [])
    if top5_videos or prev_top5_videos:
        curr_max = max((t.get('views', 0) for t in top5_videos), default=1) or 1
        prev_max = max((t.get('views', 0) for t in prev_top5_videos), default=1) or 1
        top3_sections.append({
            'title': '조회수 TOP 3 동영상',
            'icon': '🎬',
            'bar_color': 'red',
            'prev_items': [{'label': t.get('title', '')[:25], 'value_display': f"{t.get('views', 0):,} 회", 'pct': (t.get('views', 0) / prev_max) * 100} for t in prev_top5_videos[:3]] if prev_top5_videos else [],
            'curr_items': [{'label': t.get('title', '')[:25], 'value_display': f"{t.get('views', 0):,} 회", 'pct': (t.get('views', 0) / curr_max) * 100} for t in top5_videos[:3]],
            'no_prev_data_msg': '데이터 없음' if not prev_top5_videos else None,
        })

    # Traffic source TOP3 (당월/전월 비교)
    traffic = tables.get('traffic_by_source', [])
    prev_traffic = tables.get('prev_traffic_by_source', [])
    if traffic or prev_traffic:
        curr_max = max((t.get('views', 0) for t in traffic), default=1) or 1
        curr_total = sum(t.get('views', 0) for t in traffic) or 1
        prev_max = max((t.get('views', 0) for t in prev_traffic), default=1) or 1
        prev_total = sum(t.get('views', 0) for t in prev_traffic) or 1
        top3_sections.append({
            'title': '트래픽 소스 TOP 3',
            'icon': '📡',
            'bar_color': 'amber',
            'prev_items': [{'label': t.get('source', ''), 'value_display': f"{(t.get('views', 0) / prev_total * 100):.1f} %", 'pct': (t.get('views', 0) / prev_max) * 100} for t in prev_traffic[:3]] if prev_traffic else [],
            'curr_items': [{'label': t.get('source', ''), 'value_display': f"{(t.get('views', 0) / curr_total * 100):.1f} %", 'pct': (t.get('views', 0) / curr_max) * 100} for t in traffic[:3]],
            'no_prev_data_msg': '데이터 없음' if not prev_traffic else None,
        })

    # Video type distribution (영상 종류별 분포)
    # 전월
    prev_longform_completed = prev_longform_stats.get('completed', 0)
    prev_shortform_completed = prev_shortform_stats.get('completed', 0)
    prev_total_completed = prev_longform_completed + prev_shortform_completed

    # 당월
    curr_longform_completed = longform_stats.get('completed', 0)
    curr_shortform_completed = shortform_stats.get('completed', 0)
    curr_total_completed = curr_longform_completed + curr_shortform_completed

    video_type_distribution = {
        'prev': {
            'longform': {'count': prev_longform_completed, 'pct': round((prev_longform_completed / prev_total_completed * 100), 1) if prev_total_completed > 0 else 0},
            'shortform': {'count': prev_shortform_completed, 'pct': round((prev_shortform_completed / prev_total_completed * 100), 1) if prev_total_completed > 0 else 0},
            'total': prev_total_completed
        },
        'curr': {
            'longform': {'count': curr_longform_completed, 'pct': round((curr_longform_completed / curr_total_completed * 100), 1) if curr_total_completed > 0 else 0},
            'shortform': {'count': curr_shortform_completed, 'pct': round((curr_shortform_completed / curr_total_completed * 100), 1) if curr_total_completed > 0 else 0},
            'total': curr_total_completed
        }
    }

    return {
        'prev_month': prev_month,
        'curr_month': curr_month,
        'prev_metrics': prev_channel_metrics,  # 채널 성과
        'curr_metrics': curr_channel_metrics,
        'prev_production_metrics': prev_production_metrics,  # 제작 성과
        'curr_production_metrics': curr_production_metrics,
        'top5_sections': top3_sections,  # TOP3 sections (기존 구조 유지)
        'video_type_distribution': video_type_distribution,  # 영상 종류별 분포
    }


def prepare_department_data(name: str, dept_id: str, result: Dict[str, Any]) -> Dict[str, Any]:
    """Prepare department data for HTML template."""
    dept_styles = {
        'reservation': {'icon': '📅', 'color_bg': '#dbeafe'},
        'blog': {'icon': '📝', 'color_bg': '#dcfce7'},
        'ads': {'icon': '📊', 'color_bg': '#fef3c7'},
        'design': {'icon': '🎨', 'color_bg': '#fce7f3'},
        'youtube': {'icon': '🎬', 'color_bg': '#fee2e2'},
        'setting': {'icon': '⚙️', 'color_bg': '#e0e7ff'},
    }

    style = dept_styles.get(dept_id, {'icon': '📋', 'color_bg': '#f1f5f9'})

    if not result or not result.get('kpi'):
        return {'name': name, 'id': dept_id, 'has_data': False, 'icon': style['icon'], 'color_bg': style['color_bg']}

    # Get department-specific data
    dept_data = {}
    if dept_id == 'reservation':
        dept_data = prepare_reservation_data(result)
    elif dept_id == 'blog':
        dept_data = prepare_blog_data(result)
    elif dept_id == 'ads':
        dept_data = prepare_ads_data(result)
    elif dept_id == 'design':
        dept_data = prepare_design_data(result)
    elif dept_id == 'youtube':
        dept_data = prepare_youtube_data(result)

    return {
        'name': name,
        'id': dept_id,
        'has_data': True,
        'icon': style['icon'],
        'color_bg': style['color_bg'],
        **dept_data
    }


def generate_html_report(results: Dict[str, Dict[str, Any]],
                         clinic_name: str = None,
                         report_date: str = None) -> str:
    """Generate HTML report from processed results."""
    if clinic_name is None:
        clinic_name = '서울리멤버치과'
    if report_date is None:
        report_date = datetime.now().strftime('%Y년 %m월 %d일')

    report_title = f"{clinic_name} {datetime.now().strftime('%Y-%m')} 월간 분석 보고서"

    dept_configs = [
        ('예약 퍼널', 'reservation'),
        ('블로그', 'blog'),
        ('유튜브', 'youtube'),
        ('네이버 광고', 'ads'),
        ('디자인', 'design'),
        ('세팅팀', 'setting')
    ]

    departments = []
    for name, dept_id in dept_configs:
        result = results.get(dept_id, {})
        dept_data = prepare_department_data(name, dept_id, result)
        departments.append(dept_data)

    
    # Generate summary
    summary = generate_summary(results)

    template = Template(HTML_TEMPLATE)
    return template.render(
        report_title=report_title,
        report_date=report_date,
        clinic_name=clinic_name,
        departments=departments,
        summary=summary
    )


def get_report_filename(clinic_name: str = None) -> str:
    """Generate report filename."""
    if clinic_name is None:
        clinic_name = '서울리멤버치과'
    safe_name = clinic_name.replace(' ', '_')
    return f"{safe_name}_Monthly_Report_{datetime.now().strftime('%Y%m')}.html"
