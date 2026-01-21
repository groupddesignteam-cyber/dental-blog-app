"""
광고팀 데이터 처리 모듈
- Spend xlsx: '945246_소진_내역_*.xlsx'
- Campaign csv: '캠페인 보고서*.csv'
"""

import re
import pandas as pd
import numpy as np
from io import BytesIO
from typing import List, Dict, Any, Optional
from dataclasses import dataclass


@dataclass
class LoadedFile:
    name: str
    df: Optional[pd.DataFrame] = None
    raw_bytes: Optional[bytes] = None


def parse_currency(value: str) -> float:
    """Parse currency string like ￦1,127,742 to float."""
    if pd.isna(value):
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    cleaned = re.sub(r'[^\d.-]', '', str(value))
    return float(cleaned) if cleaned else 0.0


def parse_year_month_period(period: str) -> str:
    """Parse period like '2025.12' to 'YYYY-MM' format."""
    if pd.isna(period):
        return None
    match = re.search(r'(\d{4})\.(\d{1,2})', str(period))
    if match:
        year, month = match.groups()
        return f"{year}-{int(month):02d}"
    return None


def parse_year_month_monthly(monthly: str) -> str:
    """Parse monthly like '2025.11.' to 'YYYY-MM' format."""
    if pd.isna(monthly):
        return None
    match = re.search(r'(\d{4})\.(\d{1,2})', str(monthly))
    if match:
        year, month = match.groups()
        return f"{year}-{int(month):02d}"
    return None


def process_spend_xlsx(files: List[LoadedFile]) -> Dict[str, Any]:
    """Process spend xlsx files: '945246_소진_내역_*.xlsx'"""
    spend_data = []

    for f in files:
        if not re.match(r'945246_소진_내역_.*\.xlsx', f.name, re.IGNORECASE):
            continue

        try:
            if f.df is not None:
                df_raw = f.df.copy()
                # If loaded with header=None, first row is the header
                first_col = df_raw.columns[0]
                if isinstance(first_col, (int, np.integer)):
                    df = df_raw.iloc[1:].copy()
                    df.columns = df_raw.iloc[0].values
                    df = df.reset_index(drop=True)
                else:
                    df = df_raw
            elif f.raw_bytes:
                df = pd.read_excel(BytesIO(f.raw_bytes))
            else:
                continue

            # Find columns for 기간 and 소진액
            period_col = None
            spend_col = None

            for col in df.columns:
                col_str = str(col).strip()
                if '기간' in col_str:
                    period_col = col
                elif '소진액' in col_str or '소진' in col_str:
                    spend_col = col

            if period_col is None or spend_col is None:
                continue

            for _, row in df.iterrows():
                year_month = parse_year_month_period(row[period_col])
                if year_month:
                    spend = parse_currency(row[spend_col])
                    spend_data.append({
                        'year_month': year_month,
                        'spend': spend
                    })
        except Exception as e:
            print(f"Error processing spend file {f.name}: {e}")
            continue

    if not spend_data:
        return {}

    spend_df = pd.DataFrame(spend_data)
    monthly_spend = spend_df.groupby('year_month')['spend'].sum().reset_index()
    monthly_spend = monthly_spend.sort_values('year_month')
    monthly_spend['mom_growth'] = monthly_spend['spend'].pct_change() * 100

    return {
        'monthly_spend': monthly_spend.to_dict('records'),
        'total_by_month': dict(zip(monthly_spend['year_month'], monthly_spend['spend']))
    }


def process_campaign_csv(files: List[LoadedFile]) -> Dict[str, Any]:
    """Process campaign csv files: '캠페인 보고서*.csv'"""
    campaign_data = []

    for f in files:
        if not re.match(r'캠페인 보고서.*\.csv', f.name, re.IGNORECASE):
            continue

        try:
            # Check df first, then raw_bytes
            if f.df is not None:
                df_raw = f.df.copy()
                # If loaded without proper parsing (single column), we need to re-parse
                # This happens when the first row is a title and pandas treats it as header
                if len(df_raw.columns) == 1:
                    # The data was loaded incorrectly, skip to raw_bytes handling
                    # We can't fix this without re-reading the file
                    # Fall through to raw_bytes if available, otherwise try to parse the single column
                    if f.raw_bytes:
                        df = pd.read_csv(BytesIO(f.raw_bytes), skiprows=1, encoding='utf-8-sig')
                    else:
                        # Try to split the single column data
                        # This is a workaround for improperly loaded CSV
                        continue
                else:
                    # Check if first row is header (contains '캠페인', '검색어', etc.)
                    first_row_vals = [str(v).strip() for v in df_raw.iloc[0].values if pd.notna(v)]
                    if '캠페인' in first_row_vals and '검색어' in first_row_vals:
                        df = df_raw.iloc[1:].copy()
                        df.columns = df_raw.iloc[0].values
                        df = df.reset_index(drop=True)
                    else:
                        df = df_raw
            elif f.raw_bytes:
                # First line is title, skip it
                df = pd.read_csv(BytesIO(f.raw_bytes), skiprows=1, encoding='utf-8-sig')
            else:
                continue

            # Expected columns after skiprows: 캠페인, 검색어, 월별, 노출수, 클릭수
            col_mapping = {}
            for col in df.columns:
                col_str = str(col).strip()
                if '캠페인' in col_str:
                    col_mapping['campaign'] = col
                elif '검색어' in col_str:
                    col_mapping['keyword'] = col
                elif '월별' in col_str:
                    col_mapping['monthly'] = col
                elif '노출수' in col_str or '노출' in col_str:
                    col_mapping['impressions'] = col
                elif '클릭수' in col_str or '클릭' in col_str:
                    col_mapping['clicks'] = col

            for _, row in df.iterrows():
                year_month = parse_year_month_monthly(row.get(col_mapping.get('monthly', ''), ''))
                if year_month:
                    impressions = pd.to_numeric(row.get(col_mapping.get('impressions', ''), 0), errors='coerce') or 0
                    clicks = pd.to_numeric(row.get(col_mapping.get('clicks', ''), 0), errors='coerce') or 0
                    campaign_data.append({
                        'year_month': year_month,
                        'campaign': row.get(col_mapping.get('campaign', ''), ''),
                        'keyword': row.get(col_mapping.get('keyword', ''), ''),
                        'impressions': impressions,
                        'clicks': clicks
                    })
        except Exception as e:
            print(f"Error processing campaign file {f.name}: {e}")
            continue

    if not campaign_data:
        return {}

    campaign_df = pd.DataFrame(campaign_data)

    # Aggregate by keyword and year_month
    keyword_stats = campaign_df.groupby(['year_month', 'keyword']).agg({
        'impressions': 'sum',
        'clicks': 'sum'
    }).reset_index()

    keyword_stats['ctr'] = np.where(
        keyword_stats['impressions'] > 0,
        (keyword_stats['clicks'] / keyword_stats['impressions']) * 100,
        0
    )

    result = {}
    for ym in keyword_stats['year_month'].unique():
        month_data = keyword_stats[keyword_stats['year_month'] == ym]

        # TOP5 데이터에 impressions와 clicks 모두 포함
        top5_impressions = month_data.nlargest(5, 'impressions')[['keyword', 'impressions', 'clicks']].to_dict('records')
        top5_clicks = month_data.nlargest(5, 'clicks')[['keyword', 'clicks', 'impressions']].to_dict('records')
        top5_ctr = month_data.nlargest(5, 'ctr')[['keyword', 'ctr', 'impressions', 'clicks']].to_dict('records')

        result[ym] = {
            'top5_by_impressions': top5_impressions,
            'top5_by_clicks': top5_clicks,
            'top5_by_ctr': top5_ctr,
            'total_impressions': int(month_data['impressions'].sum()),
            'total_clicks': int(month_data['clicks'].sum()),
            'avg_ctr': float(month_data['ctr'].mean()) if len(month_data) > 0 else 0
        }

    return result


def process_ads(files: List[LoadedFile], reservation_data: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    Main processor for ads department.

    Args:
        files: List of LoadedFile objects
        reservation_data: Optional reservation data for CPA calculation

    Returns:
        dict with department, month, prev_month, current_month_data, prev_month_data,
        growth_rate, kpi, tables, charts, clean_data

    분석 로직:
    1. CPA (Cost Per Acquisition) 계산: 광고 소진액 / 실 예약 수
    2. 전월 대비 증감률 계산
    """
    spend_result = process_spend_xlsx(files)
    campaign_result = process_campaign_csv(files)

    # Determine months
    all_months = set()
    if spend_result.get('monthly_spend'):
        all_months.update([s['year_month'] for s in spend_result['monthly_spend']])
    if campaign_result:
        all_months.update(campaign_result.keys())

    sorted_months = sorted(all_months) if all_months else []
    current_month = sorted_months[-1] if sorted_months else None
    prev_month = sorted_months[-2] if len(sorted_months) >= 2 else None

    # Current and previous month data
    current_month_data = {}
    prev_month_data = {}
    growth_rate = {}

    if spend_result.get('total_by_month'):
        current_spend = spend_result['total_by_month'].get(current_month, 0)
        prev_spend = spend_result['total_by_month'].get(prev_month, 0)
        current_month_data['total_spend'] = current_spend
        prev_month_data['total_spend'] = prev_spend

        if prev_spend > 0:
            growth_rate['spend'] = ((current_spend - prev_spend) / prev_spend) * 100
        else:
            growth_rate['spend'] = 0

    if campaign_result:
        if current_month in campaign_result:
            current_month_data['campaign'] = campaign_result[current_month]
        if prev_month in campaign_result:
            prev_month_data['campaign'] = campaign_result[prev_month]

        # Calculate impressions growth
        curr_imp = campaign_result.get(current_month, {}).get('total_impressions', 0)
        prev_imp = campaign_result.get(prev_month, {}).get('total_impressions', 0)
        if prev_imp > 0:
            growth_rate['impressions'] = ((curr_imp - prev_imp) / prev_imp) * 100
        else:
            growth_rate['impressions'] = 0

    # CPA 계산 (Cost Per Acquisition = 광고 소진액 / 실 예약 수)
    # reservation_data에서 실 예약 수(actual_reservations) 가져오기
    actual_reservations = 0
    prev_actual_reservations = 0

    if reservation_data:
        actual_reservations = reservation_data.get('kpi', {}).get('actual_reservations', 0)
        prev_actual_reservations = reservation_data.get('kpi', {}).get('prev_actual_reservations', 0)

    current_spend = current_month_data.get('total_spend', 0)
    prev_spend = prev_month_data.get('total_spend', 0)

    # CPA 계산 (0으로 나누기 방지)
    cpa = round(current_spend / actual_reservations, 0) if actual_reservations > 0 else 0
    prev_cpa = round(prev_spend / prev_actual_reservations, 0) if prev_actual_reservations > 0 else 0

    # CPA 증감률
    cpa_growth = 0
    if prev_cpa > 0:
        cpa_growth = ((cpa - prev_cpa) / prev_cpa) * 100

    # Build KPI
    kpi = {
        'total_spend': current_month_data.get('total_spend', 0),
        'spend_mom_growth': growth_rate.get('spend', 0),
        'total_impressions': current_month_data.get('campaign', {}).get('total_impressions', 0),
        'total_clicks': current_month_data.get('campaign', {}).get('total_clicks', 0),
        'avg_ctr': current_month_data.get('campaign', {}).get('avg_ctr', 0),
        'impressions_mom_growth': growth_rate.get('impressions', 0),
        # CPA 관련 지표
        'cpa': cpa,  # Cost Per Acquisition (광고 소진액 / 실 예약 수)
        'prev_cpa': prev_cpa,
        'cpa_growth': round(cpa_growth, 2),
        'actual_reservations': actual_reservations,
        'prev_actual_reservations': prev_actual_reservations,
        # 전월 데이터
        'prev_total_spend': prev_spend,
        'prev_total_impressions': prev_month_data.get('campaign', {}).get('total_impressions', 0),
        'prev_total_clicks': prev_month_data.get('campaign', {}).get('total_clicks', 0)
    }

    # Build tables with both current and previous month data for side-by-side comparison
    tables = {
        'monthly_spend': spend_result.get('monthly_spend', []),
        # Current month
        'keyword_top5_impressions': current_month_data.get('campaign', {}).get('top5_by_impressions', []),
        'keyword_top5_clicks': current_month_data.get('campaign', {}).get('top5_by_clicks', []),
        'keyword_top5_ctr': current_month_data.get('campaign', {}).get('top5_by_ctr', []),
        # Previous month for side-by-side comparison
        'prev_keyword_top5_impressions': prev_month_data.get('campaign', {}).get('top5_by_impressions', []),
        'prev_keyword_top5_clicks': prev_month_data.get('campaign', {}).get('top5_by_clicks', []),
        'prev_keyword_top5_ctr': prev_month_data.get('campaign', {}).get('top5_by_ctr', [])
    }

    # Charts data (for plotly)
    charts = {
        'spend_trend': spend_result.get('monthly_spend', [])
    }

    # Clean data for further processing
    clean_data = {
        'spend': spend_result,
        'campaign': campaign_result
    }

    return {
        'department': '광고팀',
        'month': current_month,
        'prev_month': prev_month,
        'current_month_data': current_month_data,
        'prev_month_data': prev_month_data,
        'growth_rate': growth_rate,
        'kpi': kpi,
        'tables': tables,
        'charts': charts,
        'clean_data': clean_data
    }
