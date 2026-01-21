"""
디자인팀 데이터 처리 모듈
- Work CSV: '[디자인팀] 업무 협조 요청*.csv'
"""

import re
import pandas as pd
import numpy as np
from io import BytesIO
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
import warnings
warnings.filterwarnings('ignore')


@dataclass
class LoadedFile:
    name: str
    df: Optional[pd.DataFrame] = None
    raw_bytes: Optional[bytes] = None


def parse_year_month_from_date(date_value) -> str:
    """Extract YYYY-MM from datetime string or datetime object."""
    if pd.isna(date_value):
        return None

    try:
        if isinstance(date_value, pd.Timestamp):
            return date_value.strftime('%Y-%m')

        date_str = str(date_value).strip()
        if not date_str or date_str.lower() == 'nan':
            return None

        # Try parsing various formats
        for fmt in ['%Y-%m-%d %H:%M:%S', '%Y-%m-%d', '%Y.%m.%d', '%Y/%m/%d']:
            try:
                dt = pd.to_datetime(date_str, format=fmt)
                return dt.strftime('%Y-%m')
            except:
                continue

        # Fallback: try pandas auto-parse
        dt = pd.to_datetime(date_str, errors='coerce')
        if pd.notna(dt):
            return dt.strftime('%Y-%m')

    except Exception:
        pass

    return None


def process_design(files: List[LoadedFile]) -> Dict[str, Any]:
    """
    Main processor for design department.

    Handles '[디자인팀] 업무 협조 요청*.csv'

    Args:
        files: List of LoadedFile objects

    Returns:
        dict with department, month, prev_month, current_month_data, prev_month_data,
        growth_rate, kpi, tables, charts, clean_data
    """
    all_tasks = []

    for f in files:
        # CSV와 XLSX 모두 지원
        is_csv = f.name.lower().endswith('.csv')
        is_xlsx = f.name.lower().endswith('.xlsx')

        if not (is_csv or is_xlsx):
            continue

        # Check if it's a design file
        if '디자인' not in f.name and '업무 협조' not in f.name and '업무협조' not in f.name:
            continue

        print(f"[DEBUG] 디자인 파일 처리 시작: {f.name}")

        try:
            if f.df is not None:
                df = f.df.copy()
            elif f.raw_bytes:
                if is_csv:
                    df = pd.read_csv(BytesIO(f.raw_bytes), encoding='utf-8-sig')
                else:  # xlsx
                    df = pd.read_excel(BytesIO(f.raw_bytes))
            else:
                continue

            print(f"[DEBUG] 디자인 파일 컬럼: {list(df.columns)}")
            print(f"[DEBUG] 디자인 파일 행 수: {len(df)}")

            # Find relevant columns based on actual data structure
            col_mapping = {}
            for col in df.columns:
                col_str = str(col).strip()

                if col_str == '의뢰일':
                    col_mapping['request_date'] = col
                elif col_str == '업무기한':
                    col_mapping['deadline'] = col
                elif col_str == '완료 페이지':
                    col_mapping['completed_pages'] = col
                elif col_str == '수정 횟수':
                    col_mapping['revision_count'] = col
                elif col_str == '상태':
                    col_mapping['status'] = col
                elif col_str == '치과명':  # Actual column name in data
                    col_mapping['clinic'] = col
                elif col_str == '디자인 작업명':
                    col_mapping['task_name'] = col
                elif col_str == '분류':
                    col_mapping['category'] = col

            for _, row in df.iterrows():
                # Use Deadline for month classification if available, else Request Date
                date_val = row.get(col_mapping.get('deadline', ''), '')
                if not date_val or str(date_val).lower() == 'nan':
                    date_val = row.get(col_mapping.get('request_date', ''), '')
                
                year_month = parse_year_month_from_date(date_val)

                status = str(row.get(col_mapping.get('status', ''), '')).strip()
                is_completed = '완료' in status

                completed_pages = pd.to_numeric(
                    row.get(col_mapping.get('completed_pages', ''), 0),
                    errors='coerce'
                ) or 0

                revision_count_val = pd.to_numeric(
                    row.get(col_mapping.get('revision_count', ''), 0),
                    errors='coerce'
                )
                revision_count = 0 if pd.isna(revision_count_val) else int(revision_count_val)

                clinic = str(row.get(col_mapping.get('clinic', ''), '')).strip()
                task_name = str(row.get(col_mapping.get('task_name', ''), '')).strip()
                category = str(row.get(col_mapping.get('category', ''), '')).strip()

                # Skip if no valid task name
                if not task_name or task_name.lower() == 'nan':
                    continue

                all_tasks.append({
                    'year_month': year_month,
                    'status': status,
                    'is_completed': is_completed,
                    'completed_pages': completed_pages,
                    'revision_count': revision_count,
                    'clinic': clinic if clinic and clinic.lower() != 'nan' else '미지정',
                    'task_name': task_name,
                    'category': category if category and category.lower() != 'nan' else '기타'
                })

        except Exception as e:
            print(f"Error processing design file {f.name}: {e}")
            continue

    if not all_tasks:
        return {
            'department': '디자인팀',
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

    tasks_df = pd.DataFrame(all_tasks)

    # Filter for valid year_month, but keep all if none valid
    valid_tasks = tasks_df[tasks_df['year_month'].notna()]
    if valid_tasks.empty:
        valid_tasks = tasks_df

    # Determine months
    valid_months = valid_tasks[valid_tasks['year_month'].notna()]['year_month'].unique()
    sorted_months = sorted(valid_months) if len(valid_months) > 0 else []
    current_month = sorted_months[-1] if sorted_months else None
    prev_month = sorted_months[-2] if len(sorted_months) >= 2 else None

    # Calculate metrics per month
    def calculate_monthly_metrics(df_month):
        if df_month.empty:
            return {
                'completed_tasks': 0,
                'total_tasks': 0,
                'avg_revision': 0,
                'heavy_revision_rate': 0,
                'total_pages': 0
            }

        completed = df_month[df_month['is_completed']]
        completed_count = len(completed)
        total_count = len(df_month)

        avg_revision = df_month['revision_count'].mean() if len(df_month) > 0 else 0
        heavy_revision = df_month[df_month['revision_count'] >= 3]
        heavy_revision_rate = (len(heavy_revision) / total_count * 100) if total_count > 0 else 0

        total_pages = df_month['completed_pages'].sum()

        return {
            'completed_tasks': completed_count,
            'total_tasks': total_count,
            'avg_revision': round(avg_revision, 2),
            'heavy_revision_rate': round(heavy_revision_rate, 2),
            'total_pages': int(total_pages)
        }

    if current_month:
        current_df = valid_tasks[valid_tasks['year_month'] == current_month]
    else:
        current_df = valid_tasks

    if prev_month:
        prev_df = valid_tasks[valid_tasks['year_month'] == prev_month]
    else:
        prev_df = pd.DataFrame()

    current_month_data = calculate_monthly_metrics(current_df)
    prev_month_data = calculate_monthly_metrics(prev_df)

    # Growth rate
    growth_rate = {}
    if prev_month_data['completed_tasks'] > 0:
        growth_rate['completed_tasks'] = (
            (current_month_data['completed_tasks'] - prev_month_data['completed_tasks'])
            / prev_month_data['completed_tasks'] * 100
        )
    else:
        growth_rate['completed_tasks'] = 0

    # Heavy revision tasks TOP10 (Restored for compatibility)
    heavy_revision_tasks = valid_tasks[
        valid_tasks['revision_count'] >= 3
    ].nlargest(10, 'revision_count')[['task_name', 'clinic', 'revision_count']].to_dict('records')

    # Clinic task count (Restored for compatibility)
    clinic_task_count = valid_tasks.groupby('clinic').agg({
        'task_name': 'count',
        'is_completed': 'sum'
    }).reset_index()
    clinic_task_count.columns = ['clinic', 'total_tasks', 'completed_tasks']
    clinic_task_count['completed_tasks'] = clinic_task_count['completed_tasks'].astype(int)
    clinic_task_count = clinic_task_count.sort_values('total_tasks', ascending=False).to_dict('records')

    # KPI
    kpi = {
        'completed_tasks': current_month_data['completed_tasks'],
        'mom_growth': round(growth_rate.get('completed_tasks', 0), 2),
        'avg_revision': current_month_data['avg_revision'],
        'heavy_revision_rate': current_month_data['heavy_revision_rate']
    }

    # Helper to generate task list with page count
    def get_task_list_with_pages(df_month):
        if df_month.empty:
            return []
        
        # Aggregate by task_name -> sum(completed_pages), sum(revision_count)
        agg = df_month.groupby('task_name').agg({
            'completed_pages': 'sum',
            'revision_count': 'sum'
        }).reset_index()
        
        # Sort by pages desc
        agg = agg.sort_values('completed_pages', ascending=False)
        
        results = []
        for _, row in agg.iterrows():
            results.append({
                'name': row['task_name'],
                'pages': int(row['completed_pages']),
                'revision_count': int(row['revision_count'])
            })
        return results

    prev_task_list = get_task_list_with_pages(prev_df)
    curr_task_list = get_task_list_with_pages(current_df)

    tables = {
        'heavy_revision_tasks': heavy_revision_tasks,
        'clinic_task_count': clinic_task_count,
        'prev_task_list': prev_task_list, # New for split view
        'curr_task_list': curr_task_list, # New for split view
        # 'aggregated_tasks' will be kept for compatibility if needed, but we focus on separate lists now
    }

    # Aggregation Logic
    # 1. Collect all unique task names
    # 2. For each task name, count prev_month and current_month occurrence
    # 3. Calculate avg revision for that task name (across both months or just current? usually overall or recent)

    # Let's count per month
    
    aggregated_tasks = {} # name -> {prev: 0, curr: 0, revisions: [], category: ''}

    for idx, row in valid_tasks.iterrows():
        name = row['task_name']
        ym = row['year_month']
        rev = row['revision_count']
        
        if name not in aggregated_tasks:
            aggregated_tasks[name] = {
                'name': name, 
                'prev_count': 0, 
                'curr_count': 0, 
                'revisions': [], 
                'category': row['category']
            }
        
        aggregated_tasks[name]['revisions'].append(rev)
        
        if ym == prev_month:
            aggregated_tasks[name]['prev_count'] += 1
        elif ym == current_month:
            aggregated_tasks[name]['curr_count'] += 1
            
    # Convert to list and calculate avg
    final_task_list = []
    for name, data in aggregated_tasks.items():
        revs = data['revisions']
        avg_rev = sum(revs) / len(revs) if revs else 0
        
        # Filter: Show if it has activity in either month
        if data['prev_count'] > 0 or data['curr_count'] > 0:
            final_task_list.append({
                'task_name': name,
                'category': data['category'],
                'prev_count': data['prev_count'],
                'curr_count': data['curr_count'],
                'avg_revision': round(avg_rev, 1)
            })
            
    # Sort by current count desc, then prev count desc
    final_task_list.sort(key=lambda x: (x['curr_count'], x['prev_count']), reverse=True)

    # Tables
    # Update existing tables dict instead of overwriting
    tables['aggregated_tasks'] = final_task_list

    # Charts - use standard loop instead of apply to avoid FutureWarning
    monthly_data = []
    for ym in sorted_months:
        month_df = valid_tasks[valid_tasks['year_month'] == ym]
        monthly_data.append({
            'year_month': ym,
            'completed': int(month_df['is_completed'].sum()),
            'total': len(month_df)
        })

    charts = {
        'monthly_trend': monthly_data if monthly_data else []
    }

    # Clean data
    # 거래처명 수집 (불일치 감지용)
    clinic_names = valid_tasks['clinic'].dropna().unique().tolist() if 'clinic' in valid_tasks.columns else []
    clinic_name = clinic_names[0] if clinic_names else None

    clean_data = {
        'all_tasks': valid_tasks.to_dict('records'),
        'clinic_name': clinic_name,
        'clinic_names': clinic_names
    }

    return {
        'department': '디자인팀',
        'month': current_month,
        'prev_month': prev_month,
        'current_month_data': current_month_data,
        'prev_month_data': prev_month_data,
        'growth_rate': growth_rate,
        'kpi': kpi,
        'tables': tables, # Contains aggregated_tasks
        'charts': charts,
        'clean_data': clean_data
    }
