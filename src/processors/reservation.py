"""
예약 데이터 처리 모듈
- Reservation xlsx files (네이버 예약자관리)
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


# 실제 네이버 예약자관리 파일의 헤더
REQUIRED_HEADERS = ['예약번호', '유입경로', '상태', '예약신청일시', '예약취소일시', '취소사유']

# 진료항목 수식어 패턴 - 실제 치료명 앞에 붙는 마케팅 문구들
# 순서 중요: 더 긴 패턴을 먼저 배치 (쉼표+공백 > 쉼표 > 단독)
TREATMENT_MODIFIERS = [
    '구강건강을 지키는', '방치하면 안돼요', '예방의 중요성', '빠를수록 좋은',
    '두려움과 통증을 완화하는', '자연스러운 미소를 위한', '건강한 치아를 위한',
    '아프지 않은', '편안한', '정확한', '안전한', '꼼꼼한', '세심한',
    '전문적인', '체계적인', '맞춤형', '개인별', '1:1', '프리미엄',
    '부담없는', '합리적인', '경제적인', '가성비 좋은',
    # 추가 수식어 (쉼표+공백, 쉼표, 느낌표 등 다양한 형태)
    '빼자, ', '빼자,', '빼자! ', '빼자!', '빼자 ', '빼자',
    '뽑자, ', '뽑자,', '뽑자! ', '뽑자!', '뽑자 ', '뽑자',
    '해결하자, ', '해결하자,', '해결하자! ', '해결하자!', '해결하자 ', '해결하자',
    '치료하자, ', '치료하자,', '치료하자! ', '치료하자!', '치료하자 ', '치료하자',
    '고치자, ', '고치자,', '고치자! ', '고치자!', '고치자 ', '고치자',
    '없애자, ', '없애자,', '없애자! ', '없애자!', '없애자 ', '없애자',
    '잡자, ', '잡자,', '잡자! ', '잡자!', '잡자 ', '잡자',
]

# AI 관련 키워드 (치과 인지 경로에서 감지)
AI_KEYWORDS = [
    'chatgpt', 'gpt', 'gemini', 'claude', 'ai', '인공지능', '챗봇', 'bard',
    '챗지피티', '챗gpt', 'chat gpt', '제미나이', '클로드'
]

# "어떻게 치과를 알게 되었나요?" 응답 통합 규칙
# 네이버 관련 → "네이버 검색"
NAVER_KEYWORDS = ['네이버 지도', '네이버지도', '블로그', '블로그 검색', '네이버 검색', '네이버검색', '네이버']
# 일반 인터넷 검색 → "온라인 검색"
ONLINE_SEARCH_KEYWORDS = ['인터넷 검색', '인터넷검색', '검색', '인터넷', '구글', '다음']
# 카페 관련 → "온라인 카페"
CAFE_KEYWORDS = ['카페 검색', '카페검색', '카페', '맘카페', '육아카페', '지역카페']


def normalize_how_found(text: str) -> str:
    """
    "어떻게 치과를 알게 되었나요?" 응답을 통합 카테고리로 정규화합니다.
    - 네이버 지도, 블로그, 블로그 검색, 네이버 검색 등 → "네이버 검색"
    - 인터넷 검색, 검색, 인터넷 → "온라인 검색"
    - 카페 검색 등 카페 관련 → "온라인 카페"
    """
    if not text or pd.isna(text):
        return ''

    text_lower = str(text).lower().strip()
    text_original = str(text).strip()

    # 빈 값 체크
    if not text_lower or text_lower == 'nan':
        return ''

    # 카페 관련 먼저 체크 (더 구체적인 매칭)
    for keyword in CAFE_KEYWORDS:
        if keyword.lower() in text_lower:
            return '온라인 카페'

    # 네이버 관련 체크
    for keyword in NAVER_KEYWORDS:
        if keyword.lower() in text_lower:
            return '네이버 검색'

    # 일반 온라인 검색 체크
    for keyword in ONLINE_SEARCH_KEYWORDS:
        if keyword.lower() in text_lower:
            return '온라인 검색'

    # 해당 없으면 원본 반환
    return text_original


def extract_treatment_name(raw_treatment: str) -> str:
    """
    진료항목에서 수식어를 제거하고 실제 치료명만 추출합니다.
    예: "구강건강을 지키는 스케일링" -> "스케일링"
    """
    if not raw_treatment or raw_treatment == '기타' or pd.isna(raw_treatment):
        return raw_treatment

    treatment = str(raw_treatment).strip()

    # 수식어 제거
    for modifier in TREATMENT_MODIFIERS:
        if treatment.startswith(modifier):
            treatment = treatment[len(modifier):].strip()
            break

    # 추가 정리: 앞뒤 공백, 특수문자 제거
    treatment = re.sub(r'^[\s\-·•]+', '', treatment)
    treatment = re.sub(r'[\s\-·•]+$', '', treatment)

    return treatment if treatment else raw_treatment


def detect_ai_source(text: str) -> bool:
    """AI 관련 키워드가 포함되어 있는지 감지합니다."""
    if not text or pd.isna(text):
        return False
    text_lower = str(text).lower()
    return any(keyword in text_lower for keyword in AI_KEYWORDS)


def parse_korean_datetime(date_str: str) -> Optional[pd.Timestamp]:
    """
    Parse Korean datetime string like '2025-10-30 (목) 오후 23:43:03' into datetime.
    Handles 오전 (AM) and 오후 (PM) with 24h conversion.
    """
    if pd.isna(date_str) or not date_str:
        return None

    date_str = str(date_str).strip()
    if not date_str or date_str.lower() == 'nan':
        return None

    try:
        # Pattern: 2025-10-30 (목) 오후 23:43:03
        pattern = r'(\d{4}-\d{2}-\d{2})\s*(?:\([^)]+\))?\s*(오전|오후)?\s*(\d{1,2}):(\d{2}):(\d{2})'
        match = re.search(pattern, date_str)

        if match:
            date_part = match.group(1)
            am_pm = match.group(2)
            hour = int(match.group(3))
            minute = int(match.group(4))
            second = int(match.group(5))

            # Convert to 24h format
            # Note: 오후 23:43 seems like already 24h format in the data
            # Only convert if hour is <= 12
            if am_pm == '오후' and hour < 12:
                hour += 12
            elif am_pm == '오전' and hour == 12:
                hour = 0

            datetime_str = f"{date_part} {hour:02d}:{minute:02d}:{second:02d}"
            return pd.to_datetime(datetime_str)

        # Try standard parsing as fallback
        return pd.to_datetime(date_str, errors='coerce')

    except Exception:
        return None


def find_header_row(df: pd.DataFrame) -> int:
    """Find the row index containing the required headers."""
    for idx in range(min(10, len(df))):
        row_values = [str(v).strip() for v in df.iloc[idx].values if pd.notna(v)]
        # Check for key columns
        matches = sum(1 for h in ['예약번호', '유입경로', '상태', '예약신청일시'] if any(h in v for v in row_values))
        if matches >= 3:
            return idx
    return -1


def process_reservation(files: List[LoadedFile]) -> Dict[str, Any]:
    """
    Main processor for reservation data.

    Args:
        files: List of LoadedFile objects

    Returns:
        dict with department, month, prev_month, current_month_data, prev_month_data,
        growth_rate, kpi, tables, charts, clean_data

    분석 로직:
    1. 이용일시 기준으로 월별 데이터 필터링 (예약신청일이 아닌 이용완료일시 기준)
    2. 취소사유 Top 5 분석 및 시각화 데이터 제공
    3. 실 예약 수(이용완료) 계산
    """
    all_reservations = []

    for f in files:
        if not f.name.lower().endswith('.xlsx'):
            continue

        try:
            # Check df first, then raw_bytes
            if f.df is not None:
                df_raw = f.df.copy()
            elif f.raw_bytes:
                df_raw = pd.read_excel(BytesIO(f.raw_bytes), header=None)
            else:
                continue

            # Find header row (usually row 2 after disclaimer rows)
            header_row_idx = find_header_row(df_raw)
            if header_row_idx < 0:
                print(f"Could not find header row in {f.name}")
                continue

            # Set columns from header row
            df = df_raw.iloc[header_row_idx + 1:].copy()
            df.columns = df_raw.iloc[header_row_idx].values
            df = df.reset_index(drop=True)

            # Find column mappings - match actual column names from the data
            col_mapping = {}
            print(f"[DEBUG] 예약 파일 컬럼 목록: {[str(c).strip() for c in df.columns if pd.notna(c)]}")
            for col in df.columns:
                if pd.isna(col):
                    continue
                col_str = str(col).strip()

                if col_str == '유입경로':
                    col_mapping['inflow'] = col
                elif col_str == '상태':
                    col_mapping['status'] = col
                elif col_str == '예약신청일시':
                    col_mapping['request_datetime'] = col
                elif col_str == '예약취소일시':
                    col_mapping['cancel_datetime'] = col
                elif col_str == '취소사유':
                    col_mapping['cancel_reason'] = col
                elif col_str == '이용완료일시':
                    col_mapping['completed_datetime'] = col
            # "어떻게 알게 되었나요" 컬럼 - 다양한 뉘앙스 통합 처리
            # Priority-based selection for how_found column
            best_how_found_col = None
            how_found_priority = -1

            for col in df.columns:
                if pd.isna(col):
                    continue
                col_str = str(col).strip()

                # Priority 3: 명확한 "어떻게 알게" 패턴
                if '어떻게' in col_str and '알게' in col_str:
                    if 3 > how_found_priority:
                        best_how_found_col = col
                        how_found_priority = 3
                # Priority 2: "방문 경로" 또는 "내원 경로" 패턴
                elif ('방문' in col_str or '내원' in col_str) and '경로' in col_str:
                    if 2 > how_found_priority:
                        best_how_found_col = col
                        how_found_priority = 2
                # Priority 1: "알게 된 경로/계기" 패턴
                elif '알게' in col_str and ('경로' in col_str or '계기' in col_str):
                    if 1 > how_found_priority:
                        best_how_found_col = col
                        how_found_priority = 1
                # Priority 0: "유입 경로" (설문 형태) - 기본 유입경로와 다른 설문 컬럼
                elif '유입' in col_str and '경로' in col_str and '추가정보' in col_str:
                    if 0 > how_found_priority:
                        best_how_found_col = col
                        how_found_priority = 0

            if best_how_found_col:
                col_mapping['how_found'] = best_how_found_col
                print(f"[DEBUG] 어떻게 알게 되었나요 컬럼 발견: '{best_how_found_col}' (Priority {how_found_priority})")

            # Treatment Column Priority Selection
            # Find the best column for 'treatment' among candidates
            best_treatment_col = None
            highest_priority = -1
            
            for col in df.columns:
                if pd.isna(col): continue
                col_str = str(col).strip()
                
                # Priority 3: Explicit Survey (User Request)
                if '원하시는 진료' in col_str:
                    if 3 > highest_priority:
                        best_treatment_col = col
                        highest_priority = 3
                # Priority 2: Detail Selection
                elif '선택시술(상세)' in col_str:
                    if 2 > highest_priority:
                        best_treatment_col = col
                        highest_priority = 2
                # Priority 1: Generic Question
                elif '어떤 진료' in col_str or '진료를 원하세요' in col_str:
                    if 1 > highest_priority:
                        best_treatment_col = col
                        highest_priority = 1
                # Priority 0: Product Name (Fallback)
                elif '상품명' in col_str:
                    if 0 > highest_priority:
                        best_treatment_col = col
                        highest_priority = 0
            
            if best_treatment_col:
                col_mapping['treatment'] = best_treatment_col
                print(f"[DEBUG] Selected Treatment Column: '{best_treatment_col}' (Priority {highest_priority})")

            for _, row in df.iterrows():
                request_dt = parse_korean_datetime(row.get(col_mapping.get('request_datetime', ''), ''))
                cancel_dt = parse_korean_datetime(row.get(col_mapping.get('cancel_datetime', ''), ''))
                completed_dt = parse_korean_datetime(row.get(col_mapping.get('completed_datetime', ''), ''))

                if request_dt is None:
                    continue

                year_month = request_dt.strftime('%Y-%m')

                status = str(row.get(col_mapping.get('status', ''), '')).strip()
                is_canceled = '취소' in status
                is_completed = '이용완료' in status or pd.notna(completed_dt)

                # Calculate cancel lead hours
                cancel_lead_hours = None
                if cancel_dt and request_dt:
                    time_diff = (cancel_dt - request_dt).total_seconds() / 3600
                    cancel_lead_hours = round(time_diff, 2)

                inflow = str(row.get(col_mapping.get('inflow', ''), '')).strip()
                treatment_raw = str(row.get(col_mapping.get('treatment', ''), '')).strip()
                cancel_reason = str(row.get(col_mapping.get('cancel_reason', ''), '')).strip()
                how_found_raw = str(row.get(col_mapping.get('how_found', ''), '')).strip()
                # "어떻게 치과를 알게 되었나요?" 응답 정규화 (네이버 검색, 온라인 검색, 온라인 카페 등으로 통합)
                how_found = normalize_how_found(how_found_raw)

                # 진료항목 전처리 - 수식어 제거
                treatment = extract_treatment_name(treatment_raw) if treatment_raw and treatment_raw.lower() != 'nan' else '기타'

                # AI 경로 감지 (원본 텍스트로 감지)
                is_ai_source = detect_ai_source(how_found_raw)

                # 이용일시 기준 year_month (이용완료일 기준, 없으면 예약신청일 기준)
                # 이용완료일시가 있으면 해당 월로, 없으면 예약신청일 월로
                usage_year_month = completed_dt.strftime('%Y-%m') if pd.notna(completed_dt) else year_month

                all_reservations.append({
                    'year_month': year_month,  # 예약신청일 기준 월
                    'usage_year_month': usage_year_month,  # 이용일시 기준 월
                    'request_datetime': request_dt,
                    'cancel_datetime': cancel_dt,
                    'completed_datetime': completed_dt,  # 이용완료일시 추가
                    'status': status,
                    'is_canceled': is_canceled,
                    'is_completed': is_completed,
                    'cancel_lead_hours': cancel_lead_hours,
                    'inflow': inflow if inflow and inflow.lower() != 'nan' else '기타',
                    'treatment': treatment,
                    'cancel_reason': cancel_reason if cancel_reason and cancel_reason.lower() != 'nan' else '',
                    'how_found': how_found if how_found and how_found.lower() != 'nan' else '',
                    'is_ai_source': is_ai_source
                })

        except Exception as e:
            print(f"Error processing reservation file {f.name}: {e}")
            continue

    if not all_reservations:
        return {
            'department': '예약',
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

    reservations_df = pd.DataFrame(all_reservations)

    # Determine months
    sorted_months = sorted(reservations_df['year_month'].unique())
    current_month = sorted_months[-1] if sorted_months else None
    prev_month = sorted_months[-2] if len(sorted_months) >= 2 else None

    # Calculate metrics per month
    def calculate_monthly_metrics(df_month):
        if df_month.empty:
            return {
                'total_reservations': 0,
                'completed_count': 0,
                'canceled_count': 0,
                'cancel_rate': 0,
                'completion_rate': 0
            }

        total = len(df_month)
        canceled = df_month['is_canceled'].sum()
        completed = df_month['is_completed'].sum()
        cancel_rate = (canceled / total * 100) if total > 0 else 0
        completion_rate = (completed / total * 100) if total > 0 else 0

        return {
            'total_reservations': total,
            'completed_count': int(completed),
            'canceled_count': int(canceled),
            'cancel_rate': round(cancel_rate, 2),
            'completion_rate': round(completion_rate, 2)
        }

    current_df = reservations_df[reservations_df['year_month'] == current_month] if current_month else pd.DataFrame()
    prev_df = reservations_df[reservations_df['year_month'] == prev_month] if prev_month else pd.DataFrame()

    current_month_data = calculate_monthly_metrics(current_df)
    prev_month_data = calculate_monthly_metrics(prev_df)

    # Growth rate
    growth_rate = {}
    if prev_month_data['total_reservations'] > 0:
        growth_rate['total_reservations'] = (
            (current_month_data['total_reservations'] - prev_month_data['total_reservations'])
            / prev_month_data['total_reservations'] * 100
        )
    else:
        growth_rate['total_reservations'] = 0

    # Helper function to get TOP5 data from a dataframe
    def get_top5_data(df_target):
        if df_target.empty:
            return [], [], [], [], [], 0

        # Inflow TOP5
        inflow_top5 = df_target.groupby('inflow').size().reset_index(name='count')
        inflow_top5 = inflow_top5.nlargest(5, 'count').to_dict('records')

        # Treatment TOP5 - 수식어 제거된 실제 치료명만 추출
        treatment_list = []
        for t in df_target['treatment']:
            if t and t != '기타':
                for item in str(t).split(','):
                    item = item.strip()
                    # 추가로 수식어 제거 적용 (이미 전처리됨)
                    cleaned = extract_treatment_name(item)
                    if cleaned and cleaned != '기타':
                        treatment_list.append(cleaned)

        if treatment_list:
            treatment_df = pd.DataFrame({'treatment': treatment_list})
            treatment_top5 = treatment_df.groupby('treatment').size().reset_index(name='count')
            treatment_top5 = treatment_top5.nlargest(5, 'count').to_dict('records')
        else:
            treatment_top5 = []

        # Cancel reason TOP5
        canceled_df = df_target[df_target['is_canceled'] & (df_target['cancel_reason'] != '')]
        if not canceled_df.empty:
            cancel_reason_top5 = canceled_df.groupby('cancel_reason').size().reset_index(name='count')
            cancel_reason_top5 = cancel_reason_top5.nlargest(5, 'count').to_dict('records')
        else:
            cancel_reason_top5 = []

        # How Found TOP5 (어떻게 치과를 알게 되었나요?)
        how_found_df = df_target[df_target['how_found'] != '']
        if not how_found_df.empty:
            how_found_top5 = how_found_df.groupby('how_found').size().reset_index(name='count')
            how_found_top5 = how_found_top5.nlargest(5, 'count').to_dict('records')
        else:
            how_found_top5 = []

        # AI 경로 특이사항 - AI로 알게 된 건수
        ai_source_count = int(df_target['is_ai_source'].sum())

        # AI 경로 상세 내용 수집
        ai_sources = []
        if ai_source_count > 0:
            ai_df = df_target[df_target['is_ai_source']]
            ai_sources = ai_df['how_found'].unique().tolist()[:5]  # 최대 5개 예시

        return inflow_top5, treatment_top5, cancel_reason_top5, how_found_top5, ai_sources, ai_source_count

    # TOP5 tables for current month
    inflow_top5, treatment_top5, cancel_reason_top5, how_found_top5, ai_sources, ai_source_count = get_top5_data(current_df)
    print(f"[DEBUG] 당월({current_month}) 희망진료 TOP5: {treatment_top5}")
    print(f"[DEBUG] 당월({current_month}) 어떻게 알게 되었나요 TOP5: {how_found_top5}")

    # TOP5 tables for previous month
    prev_inflow_top5, prev_treatment_top5, prev_cancel_reason_top5, prev_how_found_top5, prev_ai_sources, prev_ai_source_count = get_top5_data(prev_df)
    print(f"[DEBUG] 전월({prev_month}) 희망진료 TOP5: {prev_treatment_top5}")
    print(f"[DEBUG] 전월({prev_month}) 어떻게 알게 되었나요 TOP5: {prev_how_found_top5}")

    # 이용일시 기준 통계 (실 예약 수 = 이용완료 건수)
    # 이용완료일시가 해당 월인 데이터만 필터링
    usage_current_df = reservations_df[reservations_df['usage_year_month'] == current_month] if current_month else pd.DataFrame()
    usage_prev_df = reservations_df[reservations_df['usage_year_month'] == prev_month] if prev_month else pd.DataFrame()

    # 실 예약 수 (이용일시 기준 이용완료 건수)
    actual_reservations = int(usage_current_df['is_completed'].sum()) if not usage_current_df.empty else 0
    prev_actual_reservations = int(usage_prev_df['is_completed'].sum()) if not usage_prev_df.empty else 0

    # 취소사유 분석 데이터 (차트용)
    cancel_reason_chart_data = []
    if cancel_reason_top5:
        total_cancel = sum(item['count'] for item in cancel_reason_top5)
        for item in cancel_reason_top5:
            percentage = round((item['count'] / total_cancel * 100), 1) if total_cancel > 0 else 0
            cancel_reason_chart_data.append({
                'reason': item['cancel_reason'],
                'count': item['count'],
                'percentage': percentage
            })

    prev_cancel_reason_chart_data = []
    if prev_cancel_reason_top5:
        prev_total_cancel = sum(item['count'] for item in prev_cancel_reason_top5)
        for item in prev_cancel_reason_top5:
            percentage = round((item['count'] / prev_total_cancel * 100), 1) if prev_total_cancel > 0 else 0
            prev_cancel_reason_chart_data.append({
                'reason': item['cancel_reason'],
                'count': item['count'],
                'percentage': percentage
            })

    # KPI
    kpi = {
        'total_reservations': current_month_data['total_reservations'],
        'cancel_rate': current_month_data['cancel_rate'],
        'completion_rate': current_month_data['completion_rate'],
        'mom_growth': round(growth_rate.get('total_reservations', 0), 2),
        # 실 예약 수 (이용일시 기준)
        'actual_reservations': actual_reservations,
        'prev_actual_reservations': prev_actual_reservations,
        # 전월 데이터
        'prev_total_reservations': prev_month_data['total_reservations'],
        'prev_cancel_rate': prev_month_data['cancel_rate'],
        'prev_completion_rate': prev_month_data['completion_rate'],
        'canceled_count': current_month_data['canceled_count'],
        'prev_canceled_count': prev_month_data['canceled_count']
    }

    # Tables - include both current and previous month data
    tables = {
        'inflow_top5': inflow_top5,
        'treatment_top5': treatment_top5,
        'cancel_reason_top5': cancel_reason_top5,
        'how_found_top5': how_found_top5,
        'prev_inflow_top5': prev_inflow_top5,
        'prev_treatment_top5': prev_treatment_top5,
        'prev_cancel_reason_top5': prev_cancel_reason_top5,
        'prev_how_found_top5': prev_how_found_top5,
        # AI 특이사항
        'ai_source_count': ai_source_count,
        'ai_sources': ai_sources,
        'prev_ai_source_count': prev_ai_source_count,
        'prev_ai_sources': prev_ai_sources,
        # 취소사유 차트 데이터 (시각화용)
        'cancel_reason_chart_data': cancel_reason_chart_data,
        'prev_cancel_reason_chart_data': prev_cancel_reason_chart_data
    }

    # Charts - use standard aggregation instead of apply
    monthly_data = []
    for ym in sorted_months:
        month_df = reservations_df[reservations_df['year_month'] == ym]
        monthly_data.append({
            'year_month': ym,
            'total': len(month_df),
            'canceled': int(month_df['is_canceled'].sum()),
            'completed': int(month_df['is_completed'].sum()),
            'cancel_rate': round(month_df['is_canceled'].sum() / len(month_df) * 100, 2) if len(month_df) > 0 else 0
        })

    charts = {
        'monthly_trend': monthly_data
    }

    # Clean data
    clean_data = {
        'all_reservations': reservations_df.to_dict('records')
    }

    return {
        'department': '예약',
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
