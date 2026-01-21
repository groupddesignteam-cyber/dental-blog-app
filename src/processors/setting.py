"""
세팅팀 데이터 처리 모듈
- Setting KPI CSV: '세팅KPI.csv'
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


def is_completed_status(status_value, completion_date_value=None) -> bool:
    """
    Check if a channel is completed based on status or completion date.
    Completed = (상태 contains 완료/완료됨/O/Y) OR (작업완료일 not null)
    """
    # Check completion date first
    if completion_date_value is not None and pd.notna(completion_date_value):
        date_str = str(completion_date_value).strip()
        if date_str and date_str.lower() not in ['nan', 'nat', '']:
            return True

    # Check status
    if pd.isna(status_value):
        return False

    status_str = str(status_value).strip().upper()

    # Check for completion indicators
    completion_keywords = ['완료', '완료됨', 'O', 'Y', 'YES', 'DONE', 'COMPLETE']
    for keyword in completion_keywords:
        if keyword in status_str:
            return True

    return False


def extract_channel_groups(columns: List[str]) -> Dict[str, Dict[str, str]]:
    """
    Extract channel groups from column names.
    Channels have suffixes: -상태, -종류, -작업완료일, -작업시작일

    Returns dict: {channel_name: {suffix: column_name}}
    """
    channel_suffixes = ['-상태', '-종류', '-작업완료일', '-작업시작일']
    channels = {}

    for col in columns:
        col_str = str(col).strip()
        for suffix in channel_suffixes:
            if col_str.endswith(suffix):
                channel_name = col_str[:-len(suffix)]
                if channel_name not in channels:
                    channels[channel_name] = {}
                channels[channel_name][suffix] = col
                break

    return channels


def process_setting(files: List[LoadedFile]) -> Dict[str, Any]:
    """
    Main processor for setting team.

    Handles '세팅KPI.csv'

    Args:
        files: List of LoadedFile objects

    Returns:
        dict with department, month, prev_month, current_month_data, prev_month_data,
        growth_rate, kpi, tables, charts, clean_data
    """
    clinic_data = []

    for f in files:
        if not re.match(r'세팅KPI.*\.csv', f.name, re.IGNORECASE):
            continue

        try:
            if f.df is not None:
                df = f.df.copy()
            elif f.raw_bytes:
                df = pd.read_csv(BytesIO(f.raw_bytes), encoding='utf-8-sig')
            else:
                continue

            # Find clinic key column and other info columns
            clinic_col = None
            marketing_start_col = None
            contract_item_col = None
            platform_name_col = None
            data_received_col = None

            for col in df.columns:
                col_str = str(col).strip()
                if '거래처명' in col_str:
                    clinic_col = col
                elif '제목' in col_str and clinic_col is None:
                    clinic_col = col
                elif '마케팅 시작일' in col_str:
                    marketing_start_col = col
                elif '계약상품' in col_str:
                    contract_item_col = col
                elif '플랫폼명' in col_str:
                    platform_name_col = col
                elif '자료 수신' in col_str and '현황' not in col_str: # Avoid '자료 수신 현황' group
                    data_received_col = col

            if clinic_col is None:
                continue

            # Extract channel groups
            channel_groups = extract_channel_groups(df.columns.tolist())

            if not channel_groups:
                continue

            total_channels = len(channel_groups)

            for _, row in df.iterrows():
                clinic_name = str(row.get(clinic_col, '')).strip()
                if not clinic_name or clinic_name == 'nan':
                    continue
                
                marketing_start_date = str(row.get(marketing_start_col, '')).strip() if marketing_start_col else ''
                contract_item = str(row.get(contract_item_col, '')).strip() if contract_item_col else ''
                platform_name = str(row.get(platform_name_col, '')).strip() if platform_name_col else ''
                data_received = str(row.get(data_received_col, '')).strip() if data_received_col else ''

                # Count completed channels for this clinic
                completed_channels = 0
                channel_status = {}

                for channel_name, suffixes in channel_groups.items():
                    status_col = suffixes.get('-상태')
                    completion_date_col = suffixes.get('-작업완료일')

                    status_value = row.get(status_col) if status_col else None
                    completion_date = row.get(completion_date_col) if completion_date_col else None

                    is_completed = is_completed_status(status_value, completion_date)
                    channel_status[channel_name] = is_completed

                    if is_completed:
                        completed_channels += 1

                progress_rate = (completed_channels / total_channels * 100) if total_channels > 0 else 0

                clinic_data.append({
                    'clinic': clinic_name,
                    'marketing_start_date': marketing_start_date,
                    'contract_item': contract_item,
                    'platform_name': platform_name,
                    'data_received': data_received,
                    'total_channels': total_channels,
                    'completed_channels': completed_channels,
                    'progress_rate': round(progress_rate, 2),
                    'channel_status': channel_status
                })

        except Exception as e:
            print(f"Error processing setting file {f.name}: {e}")
            continue

    if not clinic_data:
        return {
            'department': '세팅팀',
            'month': None,
            'prev_month': None,
            'current_month_data': {},
            'prev_month_data': {},
            'growth_rate': {},
            'kpi': {},
            'tables': {},
            'charts': {},
            'clean_data': {}
        }

    clinic_df = pd.DataFrame(clinic_data)

    # Calculate KPIs
    avg_progress_rate = clinic_df['progress_rate'].mean()
    completed_clinics = len(clinic_df[clinic_df['progress_rate'] >= 70])  # >= 70%
    risk_clinics = len(clinic_df[clinic_df['progress_rate'] < 40])  # < 40%
    total_clinics = len(clinic_df)

    # Clinic progress table (sorted desc by progress_rate)
    clinic_progress = clinic_df[['clinic', 'total_channels', 'completed_channels', 'progress_rate']].sort_values(
        'progress_rate', ascending=False
    ).to_dict('records')

    # Channel completion rate
    all_channel_statuses = {}
    for _, row in clinic_df.iterrows():
        for channel, status in row['channel_status'].items():
            if channel not in all_channel_statuses:
                all_channel_statuses[channel] = {'completed': 0, 'total': 0}
            all_channel_statuses[channel]['total'] += 1
            if status:
                all_channel_statuses[channel]['completed'] += 1

    channel_completion_rate = []
    for channel, counts in all_channel_statuses.items():
        rate = (counts['completed'] / counts['total'] * 100) if counts['total'] > 0 else 0
        channel_completion_rate.append({
            'channel': channel,
            'completed': counts['completed'],
            'total': counts['total'],
            'completion_rate': round(rate, 2)
        })

    channel_completion_rate = sorted(channel_completion_rate, key=lambda x: x['completion_rate'], reverse=True)

    # KPI
    kpi = {
        'avg_progress_rate': round(avg_progress_rate, 2),
        'completed_clinics': completed_clinics,
        'risk_clinics': risk_clinics,
        'total_clinics': total_clinics
    }

    # Tables
    tables = {
        'clinic_progress': clinic_progress,
        'channel_completion_rate': channel_completion_rate
    }

    # Charts
    charts = {
        'progress_distribution': {
            'high': len(clinic_df[clinic_df['progress_rate'] >= 70]),
            'medium': len(clinic_df[(clinic_df['progress_rate'] >= 40) & (clinic_df['progress_rate'] < 70)]),
            'low': len(clinic_df[clinic_df['progress_rate'] < 40])
        }
    }

    # Clean data
    clean_data = {
        'clinic_data': clinic_df.to_dict('records')
    }

    return {
        'department': '세팅팀',
        'month': None,  # Setting KPI is not month-based
        'prev_month': None,
        'current_month_data': {
            'avg_progress_rate': avg_progress_rate,
            'completed_clinics': completed_clinics,
            'risk_clinics': risk_clinics
        },
        'prev_month_data': {},
        'growth_rate': {},
        'kpi': kpi,
        'tables': tables,
        'charts': charts,
        'clean_data': clean_data
    }
