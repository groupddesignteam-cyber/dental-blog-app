"""
종합 분석 및 실행 계획 생성 모듈
- 데이터 기반의 구체적인 솔루션 제공
- 계절성/시즌 이슈 반영
"""

from typing import Dict, Any, List
from datetime import datetime, timedelta

def get_next_month_seasonality() -> Dict[str, str]:
    """
    다음 달의 주요 시즌/이슈 키워드를 반환합니다.
    """
    next_month = datetime.now() + timedelta(days=30)
    month = next_month.month
    
    seasonality = {
        1: "새해, 명절 준비, 방학, 신년 계획",
        2: "졸업, 발렌타인데이, 봄 방학 마무리",
        3: "입학, 개강, 화이트데이, 봄맞이",
        4: "벚꽃, 중간고사, 봄 나들이",
        5: "가정의 달, 어버이날, 어린이날, 결혼 시즌",
        6: "현충일, 여름 휴가 준비, 종강",
        7: "여름 휴가, 방학, 초복",
        8: "광복절, 휴가 피크, 말복",
        9: "추석, 가을 학기 개강, 명절 증후군",
        10: "개천절, 한글날, 할로윈, 가을 나들이",
        11: "수능, 빼빼로데이, 블랙프라이데이",
        12: "크리스마스, 연말, 송년회, 겨울 방학"
    }
    
    return {
        'month': month,
        'theme': seasonality.get(month, "")
    }

def generate_summary(results: Dict[str, Any]) -> Dict[str, Any]:
    """
    각 채널별 데이터를 분석하여 구체적이고 실행 가능한 Action Plan을 생성합니다.
    """
    action_plan = []
    season_info = get_next_month_seasonality()
    next_month_theme = season_info['theme']
    next_month_num = season_info['month']

    # 1. 예약 (Reservation) - 유지 보수 및 강화
    res_data = results.get('reservation', {})
    res_tables = res_data.get('tables', {})
    
    res_agenda = ""
    res_plan = ""
    
    # Analyze Top Cancel Reason
    cancel_top = res_tables.get('cancel_reason_top5', [])
    top_cancel_reason = cancel_top[0].get('cancel_reason', '') if cancel_top else ''
    
    if top_cancel_reason:
        res_agenda = f"<strong>예약 부도 방지 및 취소 사유 '{top_cancel_reason}' 집중 케어</strong>"
        res_plan = f"예약 1일 전 해피콜 및 미내원 고객 대상 재예약 유도 콜 진행, '{top_cancel_reason}' 관련 안내 강화"
    else:
        res_agenda = "<strong>예약 관리 프로세스 점검 및 내원율 증대</strong>"
        res_plan = "신규 예약 고객 대상 안내 문자 발송 시점 점검 및 접점별 고객 응대 매뉴얼 리뉴얼"
    
    action_plan.append({'department': '예약', 'agenda': res_agenda, 'plan': res_plan})


    # 2. 블로그 (Blog) - 시의성 + 희망 진료 + 계약 건수
    blog_data = results.get('blog', {})
    
    # Try to get top treatments from reservation data for "High desired appointments"
    # Assuming 'how_found' or similar might contain hints, otherwise generic
    res_how_found = res_tables.get('how_found_top5', [])
    top_treatment_keyword = "임플란트/교정" # Default fallback
    if res_how_found:
        # Just taking the top keyword as a proxy for interest
        top_treatment_keyword = res_how_found[0].get('how_found', '주요 진료')

    blog_agenda = f"<strong>{next_month_num}월 시즌 이슈 및 주요 진료({top_treatment_keyword}) 연계 콘텐츠 기획</strong>"
    blog_plan = f"'{next_month_theme}' 키워드와 내원 희망이 많은 '{top_treatment_keyword}'를 결합한 정보성 콘텐츠 발행 (계약 건수 달성 목표)"
        
    action_plan.append({'department': '블로그', 'agenda': blog_agenda, 'plan': blog_plan})


    # 3. 유튜브 (YouTube) - 블로그 연계 + 톤앤매너
    yt_agenda = "<strong>블로그 주제와 연계된 영상 콘텐츠 기획 (One-Source Multi-Use)</strong>"
    yt_plan = f"블로그에서 다룬 '{top_treatment_keyword}' 및 시즌 주제를 영상으로 구성하여 채널 간 톤앤매너 통일 및 시너지 창출"
        
    action_plan.append({'department': '유튜브', 'agenda': yt_agenda, 'plan': yt_plan})


    # 4. 디자인 (Design) - 시즌 맞춤 제안
    design_agenda = f"<strong>{next_month_num}월 시즌({next_month_theme}) 맞춤형 원내외 디자인 리뉴얼</strong>"
    design_plan = f"'{next_month_theme}' 분위기를 반영한 대기실 POP 및 이벤트 배너 제작으로 내원 고객 만족도 제고"

    action_plan.append({
        'department': '디자인',
        'agenda': design_agenda,
        'plan': design_plan
    })


    # 5. 광고 (Ads) - 톤앤매너 통일
    ads_agenda = "<strong>콘텐츠(블로그/유튜브)와 톤앤매너가 일치하는 광고 캠페인 운영</strong>"
    ads_plan = "블로그/영상 주요 소구점과 디자인 무드를 광고 소재(T&D)에 반영하여 브랜드 일관성 확보 및 클릭률 증대"

    action_plan.append({'department': '네이버 광고', 'agenda': ads_agenda, 'plan': ads_plan})

    return {
         'action_plan': action_plan,
         'action_plan_month': f"{next_month_num}월"
    }
