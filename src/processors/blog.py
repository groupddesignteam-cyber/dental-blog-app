"""
콘텐츠팀(블로그) 데이터 처리 모듈
- Work CSV: '[콘텐츠팀] 포스팅 업무 현황*.csv'
- Inflow xlsx: '유입분석_월간_*.xlsx'
- Views rank xlsx: '조회수_순위_월간_*.xlsx'
- Views monthly xlsx: '조회수_월간_*.xlsx'

추가 분석 기능:
1. 검색어 심층 분석: URL에서 query/q 파라미터 추출
2. 효자 콘텐츠(스테디셀러) 발굴: 과거 게시물 중 인기글 표시
3. 성과 원인 자동 진단: 조회수 하락 원인 분석
"""

import re
import pandas as pd
import numpy as np
from io import BytesIO
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from urllib.parse import urlparse, parse_qs, unquote
import warnings
warnings.filterwarnings('ignore')


@dataclass
class LoadedFile:
    name: str
    df: Optional[pd.DataFrame] = None
    raw_bytes: Optional[bytes] = None


def extract_search_keyword_from_url(url: str) -> Optional[str]:
    """
    URL에서 검색 키워드를 추출합니다.
    query=, q=, search=, keyword= 등의 파라미터를 파싱합니다.
    """
    if not url or pd.isna(url):
        return None

    try:
        url_str = str(url).strip()
        if not url_str or url_str.lower() == 'nan':
            return None

        # URL 파싱
        parsed = urlparse(url_str)
        query_params = parse_qs(parsed.query)

        # 검색어 파라미터 우선순위
        search_params = ['query', 'q', 'search', 'keyword', 'searchKeyword', 'where']

        for param in search_params:
            if param in query_params:
                keyword = query_params[param][0]
                # URL 디코딩
                keyword = unquote(keyword)
                # 빈 문자열이 아닌 경우만 반환
                if keyword and keyword.strip():
                    return keyword.strip()

        # 네이버 검색 URL 특수 처리
        if 'naver.com' in url_str:
            # 네이버 검색 결과 URL 패턴
            match = re.search(r'[?&]query=([^&]+)', url_str)
            if match:
                return unquote(match.group(1))

        # 다음 검색 URL 특수 처리
        if 'daum.net' in url_str:
            match = re.search(r'[?&]q=([^&]+)', url_str)
            if match:
                return unquote(match.group(1))

        # 구글 검색 URL 특수 처리
        if 'google.com' in url_str or 'google.co.kr' in url_str:
            match = re.search(r'[?&]q=([^&]+)', url_str)
            if match:
                return unquote(match.group(1))

    except Exception:
        pass

    return None


def parse_write_date(date_str: str) -> Optional[pd.Timestamp]:
    """작성일 문자열을 파싱하여 Timestamp로 변환합니다."""
    if not date_str or pd.isna(date_str):
        return None

    try:
        date_str = str(date_str).strip()
        if not date_str or date_str.lower() == 'nan':
            return None

        # 다양한 날짜 형식 파싱
        dt = pd.to_datetime(date_str, errors='coerce')
        if pd.notna(dt):
            return dt
    except Exception:
        pass

    return None


def is_steady_seller(write_date_str: str, analysis_month: str) -> bool:
    """
    스테디셀러(효자 콘텐츠)인지 판단합니다.
    작성일이 분석 대상 월 이전이면 스테디셀러입니다.
    """
    if not write_date_str or not analysis_month:
        return False

    try:
        write_dt = parse_write_date(write_date_str)
        if write_dt is None:
            return False

        # 분석 월의 첫날
        analysis_dt = pd.to_datetime(f"{analysis_month}-01")

        # 작성일이 분석 월 이전인지 확인
        return write_dt < analysis_dt
    except Exception:
        return False


def generate_performance_diagnosis(
    curr_views: int,
    prev_views: int,
    curr_publish_count: int,
    prev_publish_count: int = None
) -> Dict[str, Any]:
    """
    성과 원인을 자동 진단합니다.
    조회수 하락 시 발행량 부족인지 검색 노출 하락인지 분석합니다.
    """
    diagnosis = {
        'has_issue': False,
        'issue_type': None,
        'severity': 'normal',
        'message': '',
        'recommendation': ''
    }

    if prev_views <= 0:
        return diagnosis

    # 증감률 계산
    growth_rate = ((curr_views - prev_views) / prev_views) * 100

    # 10% 이상 하락 시 진단
    if growth_rate <= -10:
        diagnosis['has_issue'] = True
        diagnosis['severity'] = 'warning' if growth_rate > -30 else 'critical'

        # 발행량 분석
        if curr_publish_count <= 2:
            # 발행량 부족이 원인
            diagnosis['issue_type'] = 'low_publish_count'
            diagnosis['message'] = f"⚠️ 조회수가 {abs(growth_rate):.1f}% 하락했습니다. 이번 달 발행량({curr_publish_count}건)이 매우 적습니다."
            diagnosis['recommendation'] = "📌 발행 주기를 단축하여 콘텐츠 생산량을 늘릴 것을 권장합니다. 월 최소 4건 이상의 포스팅을 목표로 설정하세요."
        else:
            # 검색 노출 하락이 원인
            diagnosis['issue_type'] = 'search_exposure_drop'
            diagnosis['message'] = f"⚠️ 조회수가 {abs(growth_rate):.1f}% 하락했습니다. 발행량({curr_publish_count}건)은 적절하나 검색 노출이 감소한 것으로 보입니다."
            diagnosis['recommendation'] = "📌 키워드 최적화와 콘텐츠 품질 개선이 필요합니다. 인기 검색어를 활용한 제목 수정을 고려하세요."

    elif growth_rate >= 20:
        # 성장 중
        diagnosis['severity'] = 'success'
        diagnosis['message'] = f"✅ 조회수가 {growth_rate:.1f}% 상승했습니다. 좋은 성과입니다!"
        if curr_publish_count > 0:
            diagnosis['recommendation'] = "현재 콘텐츠 전략을 유지하면서 인기 콘텐츠의 패턴을 분석해 보세요."

    return diagnosis


def parse_date_to_year_month(date_value) -> Optional[str]:
    """Parse various date formats to YYYY-MM."""
    if pd.isna(date_value):
        return None

    try:
        if isinstance(date_value, pd.Timestamp):
            return date_value.strftime('%Y-%m')

        date_str = str(date_value).strip()
        if not date_str or date_str.lower() == 'nan':
            return None

        dt = pd.to_datetime(date_str, errors='coerce')
        if pd.notna(dt):
            return dt.strftime('%Y-%m')
    except Exception:
        pass

    return None


def parse_date_range_to_year_month(range_str: str) -> Optional[str]:
    """Parse date range like '2025-12-01~2025-12-31' to YYYY-MM from start date."""
    if pd.isna(range_str):
        return None

    try:
        match = re.search(r'(\d{4}-\d{2}-\d{2})', str(range_str))
        if match:
            date_str = match.group(1)
            dt = pd.to_datetime(date_str)
            return dt.strftime('%Y-%m')
    except Exception:
        pass

    return None


def find_header_row_by_columns(df: pd.DataFrame, required_cols: List[str]) -> int:
    """Find row index containing required column names."""
    for idx in range(min(20, len(df))):
        row_values = [str(v).strip() for v in df.iloc[idx].values if pd.notna(v)]
        matches = sum(1 for col in required_cols if any(col in v for v in row_values))
        if matches >= len(required_cols):
            return idx
    return -1


def process_work_csv(files: List[LoadedFile]) -> Dict[str, Any]:
    """Process work CSV: '[콘텐츠팀] 포스팅 업무 현황*.csv'"""
    all_work = []

    # Forward fill columns for Notion-style data
    ffill_columns = ['*ID', '상태', '거래처 명', '계약상품', '계약 건수', '발행 완료 건수', '발행 완료', '남은 작업 건수', '지난달 이월 건수']

    for f in files:
        if not f.name.lower().endswith('.csv'):
            continue
        if '콘텐츠' not in f.name and '포스팅' not in f.name:
            continue

        try:
            if f.df is not None:
                df = f.df.copy()
            elif f.raw_bytes:
                df = pd.read_csv(BytesIO(f.raw_bytes), encoding='utf-8-sig')
            else:
                continue

            # Forward fill for Notion-style grouped data
            # IMPORTANT: ffill within *ID groups only to prevent cross-client data leakage
            id_col = None
            for c in df.columns:
                if str(c).strip() == '*ID':
                    id_col = c
                    break
            
            if id_col:
                # First, forward fill the ID column itself
                df[id_col] = df[id_col].ffill()
                
                # Then forward fill other columns WITHIN each ID group
                for col in ffill_columns:
                    if col == '*ID':
                        continue  # Already handled above
                    matching_cols = [c for c in df.columns if col in str(c)]
                    for mc in matching_cols:
                        df[mc] = df.groupby(id_col)[mc].ffill()
            else:
                # Fallback: simple ffill if no ID column found
                for col in ffill_columns:
                    matching_cols = [c for c in df.columns if col in str(c)]
                    for mc in matching_cols:
                        df[mc] = df[mc].ffill()

            # Find column mappings based on actual data
            col_mapping = {}
            for col in df.columns:
                col_str = str(col).strip()

                if col_str == '포스팅-업로드':
                    col_mapping['upload_date'] = col
                elif col_str == '포스팅-작업완료일':
                    col_mapping['complete_date'] = col
                elif col_str == '포스팅-자료 수신일':
                    col_mapping['receive_date'] = col
                elif col_str == '거래처 명':
                    col_mapping['clinic'] = col
                elif col_str == '계약 건수' and 'contract_count' not in col_mapping:
                    col_mapping['contract_count'] = col
                elif (col_str == '발행 완료 건수' or col_str == '발행 완료') and 'published_count' not in col_mapping:
                    col_mapping['published_count'] = col
                elif col_str == '남은 작업 건수' and 'remaining_count' not in col_mapping:
                    col_mapping['remaining_count'] = col
                elif col_str == '지난달 이월 건수' and 'base_carryover' not in col_mapping:
                    col_mapping['base_carryover'] = col
                elif col_str == '시작일' and 'start_date' not in col_mapping:
                    col_mapping['start_date'] = col
                elif (col_str == '상태' or col_str == '포스팅-상태') and 'status' not in col_mapping:
                    col_mapping['status'] = col
                elif col_str == '계약상품':
                    col_mapping['contract_item'] = col
                elif col_str == '포스팅-포스팅 URL':
                    col_mapping['post_url'] = col
                elif col_str == '포스팅-게시물 제목':
                    col_mapping['post_title'] = col

            for _, row in df.iterrows():
                # year_month 결정 로직:
                # 1. 포스팅 행: upload_date (발행일) 기준
                # 2. ID 그룹 대표 행: start_date 기준
                year_month = None
                upload_date_raw = ''
                group_year_month = None  # ID 그룹의 대표 월 (start_date 기준)

                # upload_date (발행일)을 우선 사용 - 각 포스팅의 실제 발행 월
                if 'upload_date' in col_mapping:
                    upload_val = row.get(col_mapping['upload_date'], '')
                    if pd.notna(upload_val) and str(upload_val).strip() and str(upload_val).strip().lower() != 'nan':
                        year_month = parse_date_to_year_month(upload_val)
                        upload_date_raw = str(upload_val).strip()

                # upload_date가 없으면 start_date 사용 (계약 시작 월)
                if not year_month and 'start_date' in col_mapping:
                    start_val = row.get(col_mapping['start_date'], '')
                    if pd.notna(start_val) and str(start_val).strip() and str(start_val).strip().lower() != 'nan':
                        year_month = parse_date_to_year_month(start_val)

                # ID 그룹의 대표 월 (start_date 기준) - 계약 정보 집계용
                if 'start_date' in col_mapping:
                    start_val = row.get(col_mapping['start_date'], '')
                    if pd.notna(start_val) and str(start_val).strip() and str(start_val).strip().lower() != 'nan':
                        group_year_month = parse_date_to_year_month(start_val)

                clinic = str(row.get(col_mapping.get('clinic', ''), '')).strip()
                contract_item = str(row.get(col_mapping.get('contract_item', ''), '')).strip()
                status = str(row.get(col_mapping.get('status', ''), '')).strip()
                post_url = str(row.get(col_mapping.get('post_url', ''), '')).strip()
                post_title = str(row.get(col_mapping.get('post_title', ''), '')).strip()

                contract_count = pd.to_numeric(row.get(col_mapping.get('contract_count', ''), 0), errors='coerce') or 0
                published_count = pd.to_numeric(row.get(col_mapping.get('published_count', ''), 0), errors='coerce') or 0
                remaining_count = pd.to_numeric(row.get(col_mapping.get('remaining_count', ''), 0), errors='coerce') or 0
                base_carryover = pd.to_numeric(row.get(col_mapping.get('base_carryover', ''), 0), errors='coerce') or 0

                # Skip empty rows
                if not clinic or clinic.lower() == 'nan':
                    continue

                all_work.append({
                    'year_month': year_month,  # 발행일 기준 월 (포스팅 분류용)
                    'group_year_month': group_year_month,  # 시작일 기준 월 (계약 정보 집계용)
                    'clinic': clinic,
                    'contract_item': contract_item if contract_item.lower() != 'nan' else '',
                    'status': status if status.lower() != 'nan' else '',
                    'post_url': post_url if post_url.lower() != 'nan' else '',
                    'post_title': post_title if post_title.lower() != 'nan' else '',
                    'upload_date': upload_date_raw if upload_date_raw.lower() != 'nan' else '',
                    'contract_count': int(contract_count),
                    'published_count': int(published_count),
                    'remaining_count': int(remaining_count),
                    'base_carryover': int(base_carryover)
                })

        except Exception as e:
            print(f"Error processing work file {f.name}: {e}")
            continue

    if not all_work:
        return {}

    work_df = pd.DataFrame(all_work)

    # Get unique clinic summaries (first row per clinic)
    clinic_summary = work_df.drop_duplicates(subset=['clinic'], keep='first')

    # Aggregate by group_year_month (시작일 기준)
    # 중요: ID 그룹별로 계약 정보는 첫 행에만 있으므로,
    # group_year_month (시작일) 기준으로 집계해야 함
    # year_month (발행일)는 포스팅 목록 분류에만 사용

    # group_year_month가 있는 행만 사용 (계약 정보가 있는 ID 그룹 대표 행)
    contract_info_rows = work_df[work_df['group_year_month'].notna()].copy()

    if not contract_info_rows.empty:
        # group_year_month 기준 월별 집계 (계약 정보)
        monthly_summary = contract_info_rows.groupby('group_year_month').agg({
            'contract_count': 'first',  # ID 그룹의 첫 행 값 사용
            'published_count': 'first',
            'remaining_count': 'first',
            'base_carryover': 'first'
        }).reset_index()
        monthly_summary = monthly_summary.rename(columns={'group_year_month': 'year_month'})

        monthly_summary['completion_rate'] = np.where(
            monthly_summary['contract_count'] > 0,
            monthly_summary['published_count'] / monthly_summary['contract_count'] * 100,
            0
        )

        # 상태별 건수 계산 (월별) - year_month (발행일) 기준으로 포스팅 수 계산
        valid_work = work_df[work_df['year_month'].notna()]
        for ym in monthly_summary['year_month'].unique():
            # 해당 월에 발행된 포스팅 수 (year_month 기준)
            month_rows = valid_work[valid_work['year_month'] == ym]

            # 상태별 필터링 (대소문자 및 공백 무시)
            completed_count = len(month_rows[
                month_rows['status'].str.strip().str.lower().isin(['완료', '발행완료', '발행 완료'])
            ])
            pending_data_count = len(month_rows[
                month_rows['status'].str.strip().str.lower().isin(['자료대기', '자료 대기'])
            ])

            # monthly_summary에 추가
            monthly_summary.loc[monthly_summary['year_month'] == ym, 'completed_status_count'] = completed_count
            monthly_summary.loc[monthly_summary['year_month'] == ym, 'pending_data_count'] = pending_data_count
    else:
        monthly_summary = pd.DataFrame()

    # Get all individual work rows (for post_title, post_url display)
    # Filter rows that have valid post_title or post_url
    individual_posts = work_df[
        (work_df['post_title'].notna() & (work_df['post_title'] != '')) |
        (work_df['post_url'].notna() & (work_df['post_url'] != ''))
    ].copy()

    return {
        'monthly_summary': monthly_summary.to_dict('records') if not monthly_summary.empty else [],
        'work_summary': individual_posts.to_dict('records') if not individual_posts.empty else clinic_summary.to_dict('records'),
        'by_clinic': clinic_summary[['clinic', 'contract_count', 'published_count', 'remaining_count']].to_dict('records')
    }


def extract_month_from_filename(filename: str) -> Optional[str]:
    """Extract month from filename like '11월' or '12월' or date patterns."""
    # Pattern: 11월, 12월
    match = re.search(r'(\d{1,2})월', filename)
    if match:
        month = int(match.group(1))
        # Assume current year context (2025)
        return f"2025-{month:02d}"

    # Pattern: 2025-12, 202512
    match = re.search(r'(\d{4})[-_]?(\d{2})', filename)
    if match:
        return f"{match.group(1)}-{match.group(2)}"

    return None


def process_inflow_xlsx(files: List[LoadedFile]) -> Dict[str, Any]:
    """
    Process inflow xlsx: '유입분석_월간_*.xlsx'
    추가: URL에서 검색 키워드 추출하여 급상승 검색어 TOP10 생성
    월별 데이터 분리하여 전월/당월 비교 가능
    """
    inflow_data = []
    search_keywords = []  # 검색어 수집
    file_months = []

    for f in files:
        if not f.name.lower().endswith('.xlsx'):
            continue
        if '유입분석' not in f.name:
            continue

        # Extract month from filename
        file_month = extract_month_from_filename(f.name)
        if file_month:
            file_months.append(file_month)

        try:
            # Check df first, then raw_bytes
            if f.df is not None:
                df_raw = f.df.copy()
            elif f.raw_bytes:
                df_raw = pd.read_excel(BytesIO(f.raw_bytes), header=None)
            else:
                continue

            # Find header row containing '유입경로' and '비율'
            # In actual data: Row 7 has ['유입경로', '비율', '상세유입경로', '비율']
            # 유입경로 (첫번째 컬럼) 데이터를 사용 (상세유입경로 아님)
            header_idx = -1
            for idx in range(min(15, len(df_raw))):
                row_values = [str(v).strip() for v in df_raw.iloc[idx].values if pd.notna(v)]
                if '유입경로' in row_values:
                    header_idx = idx
                    break

            if header_idx < 0:
                continue

            df = df_raw.iloc[header_idx + 1:].copy()
            df.columns = df_raw.iloc[header_idx].values
            df = df.reset_index(drop=True)

            # 실제 엑셀 구조 (유입분석_ 파일):
            # 헤더 행 (8행, 인덱스 7): ['유입경로', '비율', '상세유입경로', '비율']
            # [0]열 (A열): 유입경로 (네이버 통합검색, 네이버 블로그 등) ★ 이 데이터 사용
            # [1]열 (B열): 비율 (유입경로 비율) ★ 이 데이터 사용
            # [2]열 (C열): 상세유입경로 (검색 키워드)
            # [3]열 (D열): 비율 (키워드 비율)

            # 컬럼명 리스트
            col_names = [str(c).strip() if pd.notna(c) else '' for c in df.columns]

            # A열(유입경로)과 B열(비율)을 사용
            # 첫 번째 '유입경로' 컬럼 찾기
            inflow_col_idx = 0  # A열: 유입경로
            inflow_ratio_col_idx = 1  # B열: 비율

            for i, col_name in enumerate(col_names):
                if col_name == '유입경로':
                    inflow_col_idx = i
                    # 바로 다음 컬럼이 비율
                    if i + 1 < len(col_names):
                        inflow_ratio_col_idx = i + 1
                    break

            # 데이터 추출 - A열(유입경로)과 B열(비율) 사용
            for _, row in df.iterrows():
                if inflow_col_idx >= len(row) or inflow_ratio_col_idx >= len(row):
                    continue

                inflow_val = row.iloc[inflow_col_idx]
                ratio_val = row.iloc[inflow_ratio_col_idx]

                # 유입경로 값이 있는지 확인 (NaN, 빈 문자열 제외)
                inflow_raw = str(inflow_val).strip() if pd.notna(inflow_val) else ''
                ratio = pd.to_numeric(str(ratio_val).replace('%', ''), errors='coerce') or 0

                # 유입경로에 값이 있고 비율도 있는 행만 추가
                if inflow_raw and inflow_raw.lower() != 'nan' and ratio > 0:
                    inflow_data.append({
                        'source': inflow_raw,
                        'ratio': round(ratio, 2),
                        'file_month': file_month
                    })

        except Exception as e:
            print(f"Error processing inflow file {f.name}: {e}")
            continue

    if not inflow_data:
        return {}

    inflow_df = pd.DataFrame(inflow_data)
    sorted_months = sorted(set(file_months)) if file_months else []

    # 비율 정규화 함수 (합이 100%가 되도록)
    def normalize_ratio(df_agg):
        """비율 합계를 100%로 정규화"""
        total = df_agg['ratio'].sum()
        if total > 0:
            df_agg = df_agg.copy()
            df_agg['ratio'] = (df_agg['ratio'] / total * 100).round(1)
        return df_agg

    # 기타를 맨 아래로 보내고 TOP5 + 기타 = 6개 가져오는 함수
    def get_top5_with_etc(df_agg):
        """기타를 제외한 TOP5 + 기타 = 총 6개 반환 (비율 정규화 적용)"""
        # 먼저 비율 정규화
        df_agg = normalize_ratio(df_agg)

        etc_row = df_agg[df_agg['source'] == '기타']
        non_etc = df_agg[df_agg['source'] != '기타']
        top5_non_etc = non_etc.nlargest(5, 'ratio')
        # 기타가 있으면 마지막에 추가
        if not etc_row.empty:
            result = pd.concat([top5_non_etc, etc_row], ignore_index=True)
        else:
            result = top5_non_etc
        return result.to_dict('records')

    # 월별로 TOP5 + 기타 분리
    monthly_traffic_top5 = {}
    for month in sorted_months:
        month_data = inflow_df[inflow_df['file_month'] == month]
        if not month_data.empty:
            month_agg = month_data.groupby('source')['ratio'].sum().reset_index()
            monthly_traffic_top5[month] = get_top5_with_etc(month_agg)

    # 전체 집계 (하위 호환성)
    inflow_agg = inflow_df.groupby('source')['ratio'].sum().reset_index()
    top5 = get_top5_with_etc(inflow_agg)

    # 검색어 TOP10 집계 (월별)
    search_keywords_top10 = []
    monthly_search_keywords = {}
    if search_keywords:
        kw_df = pd.DataFrame(search_keywords)
        # 월별 검색어
        for month in sorted_months:
            month_kw = kw_df[kw_df['file_month'] == month]
            if not month_kw.empty:
                month_kw_agg = month_kw.groupby('keyword')['ratio'].sum().reset_index()
                month_kw_agg = month_kw_agg.sort_values('ratio', ascending=False)
                monthly_search_keywords[month] = month_kw_agg.head(10).to_dict('records')

        # 전체 검색어
        kw_agg = kw_df.groupby('keyword')['ratio'].sum().reset_index()
        kw_agg = kw_agg.sort_values('ratio', ascending=False)
        search_keywords_top10 = kw_agg.head(10).to_dict('records')

    return {
        'traffic_top5': top5,
        'search_keywords_top10': search_keywords_top10,  # 급상승 검색어 TOP10
        'file_months': sorted_months,
        'monthly_traffic_top5': monthly_traffic_top5,  # 월별 트래픽 TOP5
        'monthly_search_keywords': monthly_search_keywords  # 월별 검색어 TOP10
    }


def process_views_rank_xlsx(files: List[LoadedFile], analysis_month: str = None) -> Dict[str, Any]:
    """
    Process views rank xlsx: '조회수_순위_월간_*.xlsx'
    추가: 스테디셀러(효자 콘텐츠) 발굴 - 작성일이 분석 월 이전인 인기 게시물 표시
    월별 데이터 분리하여 전월/당월 비교 가능
    """
    views_data = []
    file_months = []

    for f in files:
        if not f.name.lower().endswith('.xlsx'):
            continue
        if '조회수_순위' not in f.name:
            continue

        # Extract month from filename
        file_month = extract_month_from_filename(f.name)
        if file_month:
            file_months.append(file_month)

        try:
            # Check df first, then raw_bytes
            if f.df is not None:
                df_raw = f.df.copy()
            elif f.raw_bytes:
                df_raw = pd.read_excel(BytesIO(f.raw_bytes), header=None)
            else:
                continue

            # Find header row containing '순위', '조회수'
            # Row 7 has: ['순위', '제목', '조회수', '작성일']
            header_idx = -1
            for idx in range(min(15, len(df_raw))):
                row_values = [str(v).strip() for v in df_raw.iloc[idx].values if pd.notna(v)]
                if '순위' in row_values and '조회수' in row_values:
                    header_idx = idx
                    break

            if header_idx < 0:
                continue

            df = df_raw.iloc[header_idx + 1:].copy()
            df.columns = df_raw.iloc[header_idx].values
            df = df.reset_index(drop=True)

            # Find columns
            rank_col = None
            views_col = None
            title_col = None
            write_date_col = None

            for col in df.columns:
                if pd.isna(col):
                    continue
                col_str = str(col).strip()
                if col_str == '순위':
                    rank_col = col
                elif col_str == '조회수':
                    views_col = col
                elif col_str == '제목':
                    title_col = col
                elif col_str == '작성일':
                    write_date_col = col

            if views_col and title_col:
                for _, row in df.iterrows():
                    views = pd.to_numeric(row.get(views_col, 0), errors='coerce') or 0
                    title = str(row.get(title_col, '')).strip()
                    rank = pd.to_numeric(row.get(rank_col, 0), errors='coerce') or 0 if rank_col else 0
                    write_date = str(row.get(write_date_col, '')).strip() if write_date_col else ''

                    if views > 0 and title and title.lower() != 'nan':
                        # 스테디셀러 여부 판단
                        is_steady = is_steady_seller(write_date, analysis_month) if analysis_month else False

                        views_data.append({
                            'rank': int(rank),
                            'title': title,
                            'views': int(views),
                            'write_date': write_date if write_date.lower() != 'nan' else '',
                            'is_steady_seller': is_steady,
                            'file_month': file_month
                        })

        except Exception as e:
            print(f"Error processing views rank file {f.name}: {e}")
            continue

    if not views_data:
        return {}

    views_df = pd.DataFrame(views_data)
    sorted_months = sorted(set(file_months)) if file_months else []

    # 월별로 TOP5 분리
    monthly_views_top5 = {}
    for month in sorted_months:
        month_data = views_df[views_df['file_month'] == month]
        if not month_data.empty:
            monthly_views_top5[month] = month_data.nlargest(5, 'views').to_dict('records')

    # 전체 집계 (하위 호환성)
    top10 = views_df.nlargest(10, 'views').to_dict('records')
    top5 = views_df.nlargest(5, 'views').to_dict('records')

    # 스테디셀러만 필터링
    steady_sellers = [v for v in top10 if v.get('is_steady_seller', False)]

    return {
        'views_top5': top5,
        'views_top10': top10,
        'steady_sellers': steady_sellers,  # 효자 콘텐츠(스테디셀러)
        'file_months': sorted_months,
        'monthly_views_top5': monthly_views_top5  # 월별 조회수 TOP5
    }


def process_views_monthly_xlsx(files: List[LoadedFile]) -> Dict[str, Any]:
    """Process views monthly xlsx: '조회수_월간_*.xlsx'"""
    monthly_views = []

    for f in files:
        if not f.name.lower().endswith('.xlsx'):
            continue
        # Match 조회수_월간_ but not 조회수_순위_월간_
        if '조회수_월간_' not in f.name or '순위' in f.name:
            continue

        try:
            # Check df first, then raw_bytes
            if f.df is not None:
                df_raw = f.df.copy()
            elif f.raw_bytes:
                df_raw = pd.read_excel(BytesIO(f.raw_bytes), header=None)
            else:
                continue

            # Find header row containing '기간' and '전체'
            # Row 6 has: ['기간', '기간', '전체', '피이웃', '서로이웃', '기타']
            header_idx = -1
            for idx in range(min(15, len(df_raw))):
                row_values = [str(v).strip() for v in df_raw.iloc[idx].values if pd.notna(v)]
                if '기간' in row_values and '전체' in row_values:
                    header_idx = idx
                    break

            if header_idx < 0:
                continue

            df = df_raw.iloc[header_idx + 1:].copy()
            df.columns = df_raw.iloc[header_idx].values
            df = df.reset_index(drop=True)

            # Find period and total columns
            # Data row: ['2025-12-01~2025-12-31', '739', '5', '64', '670']
            # The first non-nan value containing date range is the period
            # The '전체' column has the total views

            period_col = None
            total_col = None

            col_list = list(df.columns)
            for i, col in enumerate(col_list):
                if pd.isna(col):
                    continue
                col_str = str(col).strip()
                if col_str == '기간' and period_col is None:
                    period_col = col
                elif col_str == '전체':
                    total_col = col

            if total_col:
                for _, row in df.iterrows():
                    # Get the first column value as period (it contains the date range)
                    period = str(row.iloc[0]).strip() if len(row) > 0 else ''
                    year_month = parse_date_range_to_year_month(period)
                    total_views = pd.to_numeric(row.get(total_col, 0), errors='coerce') or 0

                    if year_month and total_views > 0:
                        monthly_views.append({
                            'year_month': year_month,
                            'total_views': int(total_views)
                        })

        except Exception as e:
            print(f"Error processing views monthly file {f.name}: {e}")
            continue

    if not monthly_views:
        return {}

    views_df = pd.DataFrame(monthly_views)
    views_df = views_df.groupby('year_month')['total_views'].sum().reset_index()
    views_df = views_df.sort_values('year_month')
    views_df['mom_growth'] = views_df['total_views'].pct_change() * 100

    return {
        'monthly_views': views_df.to_dict('records'),
        'total_by_month': dict(zip(views_df['year_month'], views_df['total_views']))
    }


def process_blog(files: List[LoadedFile]) -> Dict[str, Any]:
    """
    Main processor for blog/content team.

    Args:
        files: List of LoadedFile objects

    Returns:
        dict with department, month, prev_month, current_month_data, prev_month_data,
        growth_rate, kpi, tables, charts, clean_data, diagnosis, insights

    분석 로직:
    1. 이월 건수: 계약 건수 - 발행 완료 건수
    2. 포스팅 리스트: 제목과 URL (클릭 가능한 링크)
    3. 전월 대비 조회수 증감률 계산
    """
    work_result = process_work_csv(files)
    inflow_result = process_inflow_xlsx(files)
    views_monthly_result = process_views_monthly_xlsx(files)

    # Determine months first (views_rank needs current_month for steady_seller detection)
    all_months = set()
    if work_result.get('monthly_summary'):
        all_months.update([s['year_month'] for s in work_result['monthly_summary'] if s.get('year_month')])
    if views_monthly_result.get('monthly_views'):
        all_months.update([s['year_month'] for s in views_monthly_result['monthly_views']])

    sorted_months = sorted(all_months) if all_months else []
    current_month = sorted_months[-1] if sorted_months else None
    prev_month = sorted_months[-2] if len(sorted_months) >= 2 else None

    # Process views rank with analysis_month for steady seller detection
    views_rank_result = process_views_rank_xlsx(files, analysis_month=current_month)

    # Current month data
    current_month_data = {}
    prev_month_data = {}

    if work_result.get('monthly_summary'):
        for summary in work_result['monthly_summary']:
            if summary.get('year_month') == current_month:
                current_month_data['work'] = summary
            elif summary.get('year_month') == prev_month:
                prev_month_data['work'] = summary

    if views_monthly_result.get('total_by_month'):
        current_month_data['total_views'] = views_monthly_result['total_by_month'].get(current_month, 0)
        prev_month_data['total_views'] = views_monthly_result['total_by_month'].get(prev_month, 0)

    # Growth rate
    growth_rate = {}
    curr_views = current_month_data.get('total_views', 0)
    prev_views = prev_month_data.get('total_views', 0)
    if prev_views > 0:
        growth_rate['views'] = ((curr_views - prev_views) / prev_views) * 100
    else:
        growth_rate['views'] = 0

    # KPI
    work_summary = current_month_data.get('work', {})
    curr_publish_count = work_summary.get('published_count', 0)
    contract_count = work_summary.get('contract_count', 0)

    # 이월 건수 취합: "지난달 이월 건수" 컬럼 데이터 사용 (User Request Reversion)
    carryover_count = work_summary.get('base_carryover', 0)

    # 전월 데이터
    prev_work_summary = prev_month_data.get('work', {})
    prev_publish_count = prev_work_summary.get('published_count', 0)
    prev_contract_count = prev_work_summary.get('contract_count', 0)
    prev_carryover_count = prev_work_summary.get('base_carryover', 0)

    kpi = {
        'publish_completion_rate': round(work_summary.get('completion_rate', 0), 2),
        'remaining_cnt': work_summary.get('remaining_count', 0),
        'total_views': current_month_data.get('total_views', 0),
        'views_mom_growth': round(growth_rate.get('views', 0), 2),
        'published_count': curr_publish_count,  # 발행량
        'contract_count': contract_count,  # 계약 건수
        'carryover_count': carryover_count,  # 이월 건수 (계약-발행)
        'pending_data_count': work_summary.get('pending_data_count', 0),  # 자료 미수신 건수
        # 전월 데이터
        'prev_published_count': prev_publish_count,
        'prev_contract_count': prev_contract_count,
        'prev_carryover_count': prev_carryover_count,
        'prev_total_views': prev_month_data.get('total_views', 0)
    }

    # 성과 원인 자동 진단
    diagnosis = generate_performance_diagnosis(
        curr_views=curr_views,
        prev_views=prev_views,
        curr_publish_count=curr_publish_count,
        prev_publish_count=prev_month_data.get('work', {}).get('published_count', 0)
    )

    # Separate work_summary by month for side-by-side comparison
    all_work_summary = work_result.get('work_summary', [])
    work_df = pd.DataFrame(all_work_summary) if all_work_summary else pd.DataFrame()

    curr_work_summary = []
    prev_work_summary = []

    if not work_df.empty and 'year_month' in work_df.columns:
        curr_work_df = work_df[work_df['year_month'] == current_month]
        prev_work_df = work_df[work_df['year_month'] == prev_month]
        curr_work_summary = curr_work_df.to_dict('records') if not curr_work_df.empty else []
        prev_work_summary = prev_work_df.to_dict('records') if not prev_work_df.empty else []

    # 월별 TOP5 데이터 추출 (posting_list에서 발행일 매핑에 사용)
    monthly_views_top5 = views_rank_result.get('monthly_views_top5', {})

    # 당월/전월 views_top5 먼저 가져오기 (발행일 매핑용)
    curr_views_top5 = monthly_views_top5.get(current_month, views_rank_result.get('views_top5', []))
    prev_views_top5 = monthly_views_top5.get(prev_month, [])

    # views_top5에서 제목 -> 발행일 매핑 생성
    curr_views_date_map = {post.get('title', ''): post.get('write_date', '') for post in curr_views_top5}
    prev_views_date_map = {post.get('title', ''): post.get('write_date', '') for post in prev_views_top5}

    # 포스팅 리스트 - 제목, URL, 발행일 정리 (클릭 가능한 링크용)
    posting_list = []
    for post in curr_work_summary:
        title = post.get('post_title', '')
        url = post.get('post_url', '')
        status = post.get('status', '')
        # 직접 upload_date 사용 (없으면 views_top5에서 찾기)
        write_date = post.get('upload_date', '')
        if not write_date:
            write_date = curr_views_date_map.get(title, '')
        if title and title.lower() != 'nan':
            posting_list.append({
                'title': title,
                'url': url if url and url.lower() != 'nan' else '',
                'status': status,
                'write_date': write_date  # 발행일 추가
            })

    prev_posting_list = []
    for post in prev_work_summary:
        title = post.get('post_title', '')
        url = post.get('post_url', '')
        status = post.get('status', '')
        # 직접 upload_date 사용 (없으면 views_top5에서 찾기)
        write_date = post.get('upload_date', '')
        if not write_date:
            write_date = prev_views_date_map.get(title, '')
        if title and title.lower() != 'nan':
            prev_posting_list.append({
                'title': title,
                'url': url if url and url.lower() != 'nan' else '',
                'status': status,
                'write_date': write_date  # 발행일 추가
            })

    monthly_traffic_top5 = inflow_result.get('monthly_traffic_top5', {})

    # 당월/전월 traffic_top5
    curr_traffic_top5 = monthly_traffic_top5.get(current_month, inflow_result.get('traffic_top5', []))
    prev_traffic_top5 = monthly_traffic_top5.get(prev_month, [])

    # Tables with new features
    tables = {
        'traffic_top5': curr_traffic_top5,
        'prev_traffic_top5': prev_traffic_top5,  # 전월 트래픽 TOP5
        'views_top5': curr_views_top5,
        'prev_views_top5': prev_views_top5,  # 전월 조회수 TOP5
        'views_top10': views_rank_result.get('views_top10', []),
        'work_summary': all_work_summary,
        'curr_work_summary': curr_work_summary,
        'prev_work_summary': prev_work_summary,
        # 포스팅 리스트 (제목 + URL)
        'posting_list': posting_list,
        'prev_posting_list': prev_posting_list,
        # 새로운 분석 데이터
        'search_keywords_top10': inflow_result.get('search_keywords_top10', []),  # 급상승 검색어
        'steady_sellers': views_rank_result.get('steady_sellers', []),  # 효자 콘텐츠
        # 월별 데이터 (상세)
        'monthly_views_top5': monthly_views_top5,
        'monthly_traffic_top5': monthly_traffic_top5
    }

    # Charts
    charts = {
        'views_trend': views_monthly_result.get('monthly_views', [])
    }

    # Clean data
    clean_data = {
        'work': work_result,
        'inflow': inflow_result,
        'views_rank': views_rank_result,
        'views_monthly': views_monthly_result
    }

    # 인사이트 생성
    insights = {
        'diagnosis': diagnosis,
        'has_steady_sellers': len(views_rank_result.get('steady_sellers', [])) > 0,
        'steady_seller_count': len(views_rank_result.get('steady_sellers', [])),
        'has_search_keywords': len(inflow_result.get('search_keywords_top10', [])) > 0,
        'search_keyword_count': len(inflow_result.get('search_keywords_top10', []))
    }

    return {
        'department': '콘텐츠팀',
        'month': current_month,
        'prev_month': prev_month,
        'current_month_data': current_month_data,
        'prev_month_data': prev_month_data,
        'growth_rate': growth_rate,
        'kpi': kpi,
        'tables': tables,
        'charts': charts,
        'clean_data': clean_data,
        'diagnosis': diagnosis,  # 성과 원인 진단
        'insights': insights  # 인사이트
    }
