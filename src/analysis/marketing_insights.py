"""
마케팅 현황 분석 및 방향성 제시 모듈
- 데이터 기반 인사이트 생성
- 마케팅 방향성 제안
"""

from typing import Dict, Any, List, Optional
import pandas as pd


def analyze_reservation_data(result: Dict[str, Any]) -> Dict[str, Any]:
    """예약 데이터 분석 및 인사이트 생성"""
    if not result:
        return {}

    kpi = result.get('kpi', {})
    insights = []
    recommendations = []

    # 문의 → 계약 전환율 분석
    conversion_rate = kpi.get('conversion_rate', 0)
    prev_conversion_rate = kpi.get('prev_conversion_rate', 0)

    if conversion_rate > 0:
        if conversion_rate >= 30:
            insights.append(f"✅ 문의→계약 전환율 {conversion_rate:.1f}%로 우수한 성과를 보이고 있습니다.")
        elif conversion_rate >= 20:
            insights.append(f"📊 문의→계약 전환율 {conversion_rate:.1f}%로 양호한 수준입니다.")
        else:
            insights.append(f"⚠️ 문의→계약 전환율 {conversion_rate:.1f}%로 개선이 필요합니다.")
            recommendations.append("전환율 개선을 위해 상담 스크립트 개선 및 후속 연락 프로세스 강화를 권장합니다.")

    # 전월 대비 변화 분석
    if prev_conversion_rate > 0:
        change = conversion_rate - prev_conversion_rate
        if change > 5:
            insights.append(f"📈 전월 대비 전환율이 {change:.1f}%p 상승했습니다.")
        elif change < -5:
            insights.append(f"📉 전월 대비 전환율이 {abs(change):.1f}%p 하락했습니다.")
            recommendations.append("전환율 하락 원인 분석이 필요합니다. 상담 품질, 경쟁사 프로모션 등을 점검해 보세요.")

    # 실 예약 수 분석
    actual_reservations = kpi.get('actual_reservations', 0)
    prev_actual = kpi.get('prev_actual_reservations', 0)

    if actual_reservations > 0 and prev_actual > 0:
        growth = ((actual_reservations - prev_actual) / prev_actual) * 100
        if growth > 10:
            insights.append(f"🎯 실 예약 수가 전월 대비 {growth:.1f}% 증가했습니다.")
        elif growth < -10:
            insights.append(f"⚠️ 실 예약 수가 전월 대비 {abs(growth):.1f}% 감소했습니다.")
            recommendations.append("예약 수 감소에 대응하여 프로모션이나 할인 이벤트를 검토해 보세요.")

    # 이월 건수 분석
    pending_count = kpi.get('pending_publications', 0)
    if pending_count > 5:
        insights.append(f"📋 이월 건수 {pending_count}건이 누적되어 있습니다.")
        recommendations.append("이월 건수 처리를 위한 업무 프로세스 점검이 필요합니다.")

    return {
        'summary': generate_summary(kpi, 'reservation'),
        'insights': insights,
        'recommendations': recommendations,
        'key_metrics': {
            '전환율': f"{conversion_rate:.1f}%",
            '실예약수': f"{actual_reservations}건",
            '이월건수': f"{pending_count}건"
        }
    }


def analyze_ads_data(result: Dict[str, Any]) -> Dict[str, Any]:
    """광고 데이터 분석 및 인사이트 생성"""
    if not result:
        return {}

    kpi = result.get('kpi', {})
    insights = []
    recommendations = []

    # CPA 분석
    cpa = kpi.get('cpa', 0)
    prev_cpa = kpi.get('prev_cpa', 0)

    if cpa > 0:
        if cpa <= 30000:
            insights.append(f"✅ CPA {cpa:,.0f}원으로 효율적인 광고 집행을 하고 있습니다.")
        elif cpa <= 50000:
            insights.append(f"📊 CPA {cpa:,.0f}원으로 양호한 수준입니다.")
        else:
            insights.append(f"⚠️ CPA {cpa:,.0f}원으로 광고 효율 개선이 필요합니다.")
            recommendations.append("CPA 개선을 위해 저효율 키워드 제외 및 고효율 키워드 집중 배분을 권장합니다.")

    # CPA 변화 분석
    if prev_cpa > 0 and cpa > 0:
        change = ((cpa - prev_cpa) / prev_cpa) * 100
        if change < -10:
            insights.append(f"📈 CPA가 전월 대비 {abs(change):.1f}% 감소하여 효율이 개선되었습니다.")
        elif change > 10:
            insights.append(f"📉 CPA가 전월 대비 {change:.1f}% 증가했습니다.")
            recommendations.append("광고 타겟팅 및 키워드 전략 재검토가 필요합니다.")

    # 클릭률 분석
    total_impressions = kpi.get('total_impressions', 0)
    total_clicks = kpi.get('total_clicks', 0)

    if total_impressions > 0:
        ctr = (total_clicks / total_impressions) * 100
        if ctr >= 3:
            insights.append(f"✅ CTR {ctr:.2f}%로 우수한 광고 매력도를 보이고 있습니다.")
        elif ctr >= 1.5:
            insights.append(f"📊 CTR {ctr:.2f}%로 양호한 수준입니다.")
        else:
            insights.append(f"⚠️ CTR {ctr:.2f}%로 광고 문구 및 소재 개선이 필요합니다.")
            recommendations.append("광고 카피와 소재를 A/B 테스트하여 CTR 개선을 도모하세요.")

    # 광고비 추이 분석
    total_spend = kpi.get('total_spend', 0)
    prev_spend = kpi.get('prev_total_spend', 0)

    if total_spend > 0 and prev_spend > 0:
        spend_change = ((total_spend - prev_spend) / prev_spend) * 100
        if spend_change > 20:
            insights.append(f"💰 광고비가 전월 대비 {spend_change:.1f}% 증가했습니다.")
            if cpa > prev_cpa:
                recommendations.append("광고비 증가 대비 효율이 낮아졌습니다. ROI 분석 후 예산 재배분을 검토하세요.")

    return {
        'summary': generate_summary(kpi, 'ads'),
        'insights': insights,
        'recommendations': recommendations,
        'key_metrics': {
            'CPA': f"{cpa:,.0f}원",
            '광고비': f"{total_spend:,.0f}원",
            '클릭수': f"{total_clicks:,}회"
        }
    }


def analyze_blog_data(result: Dict[str, Any]) -> Dict[str, Any]:
    """블로그 데이터 분석 및 인사이트 생성"""
    if not result:
        return {}

    kpi = result.get('kpi', {})
    insights = []
    recommendations = []

    # 조회수 분석
    total_views = kpi.get('total_views', 0)
    prev_views = kpi.get('prev_total_views', 0)

    if total_views > 0 and prev_views > 0:
        growth = ((total_views - prev_views) / prev_views) * 100
        if growth > 20:
            insights.append(f"📈 블로그 조회수가 전월 대비 {growth:.1f}% 증가했습니다.")
        elif growth < -10:
            insights.append(f"📉 블로그 조회수가 전월 대비 {abs(growth):.1f}% 감소했습니다.")
            recommendations.append("콘텐츠 발행 빈도 및 SEO 키워드 전략을 재검토해 보세요.")

    # 유입 분석
    total_inflow = kpi.get('total_inflow', 0)
    prev_inflow = kpi.get('prev_total_inflow', 0)

    if total_inflow > 0 and prev_inflow > 0:
        inflow_growth = ((total_inflow - prev_inflow) / prev_inflow) * 100
        if inflow_growth > 15:
            insights.append(f"✅ 검색 유입이 전월 대비 {inflow_growth:.1f}% 증가했습니다.")
        elif inflow_growth < -10:
            insights.append(f"⚠️ 검색 유입이 전월 대비 {abs(inflow_growth):.1f}% 감소했습니다.")
            recommendations.append("검색 유입 개선을 위해 롱테일 키워드 콘텐츠 강화를 권장합니다.")

    # 발행 수 분석
    total_posts = kpi.get('total_posts', 0)
    if total_posts > 0:
        if total_posts >= 20:
            insights.append(f"✅ 월 {total_posts}개 포스팅으로 활발한 콘텐츠 활동을 하고 있습니다.")
        elif total_posts >= 10:
            insights.append(f"📊 월 {total_posts}개 포스팅으로 꾸준한 활동을 유지하고 있습니다.")
        else:
            recommendations.append(f"월 발행량({total_posts}개)을 늘려 검색 노출 기회를 확대하세요.")

    return {
        'summary': generate_summary(kpi, 'blog'),
        'insights': insights,
        'recommendations': recommendations,
        'key_metrics': {
            '조회수': f"{total_views:,}회",
            '유입수': f"{total_inflow:,}회",
            '발행수': f"{total_posts}개"
        }
    }


def analyze_youtube_data(result: Dict[str, Any]) -> Dict[str, Any]:
    """유튜브 데이터 분석 및 인사이트 생성"""
    if not result:
        return {}

    kpi = result.get('kpi', {})
    insights = []
    recommendations = []

    # 조회수 분석
    total_views = kpi.get('total_views', 0)
    prev_views = kpi.get('prev_total_views', 0)

    if total_views > 0 and prev_views > 0:
        growth = ((total_views - prev_views) / prev_views) * 100
        if growth > 20:
            insights.append(f"📈 유튜브 조회수가 전월 대비 {growth:.1f}% 증가했습니다.")
        elif growth < -10:
            insights.append(f"📉 유튜브 조회수가 전월 대비 {abs(growth):.1f}% 감소했습니다.")
            recommendations.append("영상 업로드 빈도 및 썸네일/제목 최적화를 검토해 보세요.")

    # 구독자 분석
    subscribers = kpi.get('subscribers', 0)
    prev_subscribers = kpi.get('prev_subscribers', 0)

    if subscribers > 0 and prev_subscribers > 0:
        sub_growth = subscribers - prev_subscribers
        if sub_growth > 100:
            insights.append(f"✅ 구독자가 {sub_growth}명 증가했습니다.")
        elif sub_growth < 0:
            insights.append(f"⚠️ 구독자가 {abs(sub_growth)}명 감소했습니다.")
            recommendations.append("구독 유도 CTA 강화 및 시청자 참여 콘텐츠를 기획해 보세요.")

    # 롱폼/숏폼 비율 분석
    longform_count = kpi.get('longform_count', 0)
    shortform_count = kpi.get('shortform_count', 0)
    total_videos = longform_count + shortform_count

    if total_videos > 0:
        shortform_ratio = (shortform_count / total_videos) * 100
        if shortform_ratio < 30:
            recommendations.append("숏폼 콘텐츠 비중을 늘려 신규 유입 확대를 도모하세요.")
        insights.append(f"📹 롱폼 {longform_count}개, 숏폼 {shortform_count}개 제작 (숏폼 비율: {shortform_ratio:.0f}%)")

    return {
        'summary': generate_summary(kpi, 'youtube'),
        'insights': insights,
        'recommendations': recommendations,
        'key_metrics': {
            '조회수': f"{total_views:,}회",
            '구독자': f"{subscribers:,}명",
            '영상수': f"{total_videos}개"
        }
    }


def analyze_design_data(result: Dict[str, Any]) -> Dict[str, Any]:
    """디자인 데이터 분석 및 인사이트 생성"""
    if not result:
        return {}

    kpi = result.get('kpi', {})
    insights = []
    recommendations = []

    # 계약 vs 발행 완료 분석
    total_contracts = kpi.get('total_contracts', 0)
    completed = kpi.get('published_count', 0)
    pending = kpi.get('pending_publications', 0)

    if total_contracts > 0:
        completion_rate = (completed / total_contracts) * 100
        if completion_rate >= 90:
            insights.append(f"✅ 발행 완료율 {completion_rate:.1f}%로 우수한 업무 처리를 보이고 있습니다.")
        elif completion_rate >= 70:
            insights.append(f"📊 발행 완료율 {completion_rate:.1f}%입니다.")
        else:
            insights.append(f"⚠️ 발행 완료율 {completion_rate:.1f}%로 개선이 필요합니다.")
            recommendations.append("작업 프로세스 개선 및 리소스 배분 최적화를 검토해 보세요.")

    # 이월 건수
    if pending > 5:
        insights.append(f"📋 이월 건수 {pending}건이 누적되어 있습니다.")
        recommendations.append("이월 건수 해소를 위한 우선순위 정리 및 추가 리소스 투입을 검토하세요.")
    elif pending <= 2:
        insights.append(f"✅ 이월 건수 {pending}건으로 양호한 업무 관리 상태입니다.")

    return {
        'summary': generate_summary(kpi, 'design'),
        'insights': insights,
        'recommendations': recommendations,
        'key_metrics': {
            '계약건수': f"{total_contracts}건",
            '발행완료': f"{completed}건",
            '이월건수': f"{pending}건"
        }
    }


def generate_summary(kpi: Dict[str, Any], dept_type: str) -> str:
    """부서별 요약 생성"""
    summaries = {
        'reservation': _generate_reservation_summary(kpi),
        'ads': _generate_ads_summary(kpi),
        'blog': _generate_blog_summary(kpi),
        'youtube': _generate_youtube_summary(kpi),
        'design': _generate_design_summary(kpi)
    }
    return summaries.get(dept_type, "데이터 분석 중...")


def _generate_reservation_summary(kpi: Dict[str, Any]) -> str:
    """예약 요약 생성"""
    actual = kpi.get('actual_reservations', 0)
    conversion = kpi.get('conversion_rate', 0)
    return f"이번 달 실예약 {actual}건 달성, 문의→계약 전환율 {conversion:.1f}%를 기록했습니다."


def _generate_ads_summary(kpi: Dict[str, Any]) -> str:
    """광고 요약 생성"""
    spend = kpi.get('total_spend', 0)
    cpa = kpi.get('cpa', 0)
    return f"광고비 {spend:,.0f}원 집행, CPA {cpa:,.0f}원을 달성했습니다."


def _generate_blog_summary(kpi: Dict[str, Any]) -> str:
    """블로그 요약 생성"""
    views = kpi.get('total_views', 0)
    inflow = kpi.get('total_inflow', 0)
    return f"블로그 조회수 {views:,}회, 검색 유입 {inflow:,}회를 기록했습니다."


def _generate_youtube_summary(kpi: Dict[str, Any]) -> str:
    """유튜브 요약 생성"""
    views = kpi.get('total_views', 0)
    subscribers = kpi.get('subscribers', 0)
    return f"유튜브 조회수 {views:,}회, 구독자 {subscribers:,}명을 보유하고 있습니다."


def _generate_design_summary(kpi: Dict[str, Any]) -> str:
    """디자인 요약 생성"""
    contracts = kpi.get('total_contracts', 0)
    completed = kpi.get('published_count', 0)
    return f"계약 {contracts}건 중 {completed}건 발행 완료했습니다."


def generate_overall_marketing_direction(all_results: Dict[str, Any]) -> Dict[str, Any]:
    """전체 마케팅 방향성 제시"""
    directions = []
    priorities = []

    # 예약 데이터 기반 방향성
    reservation = all_results.get('reservation', {})
    if reservation:
        kpi = reservation.get('kpi', {})
        conversion = kpi.get('conversion_rate', 0)
        if conversion < 20:
            priorities.append({
                'area': '상담 전환',
                'priority': 'HIGH',
                'action': '상담 스크립트 개선 및 리드 후속 관리 강화'
            })

    # 광고 데이터 기반 방향성
    ads = all_results.get('ads', {})
    if ads:
        kpi = ads.get('kpi', {})
        cpa = kpi.get('cpa', 0)
        if cpa > 50000:
            priorities.append({
                'area': '광고 효율',
                'priority': 'HIGH',
                'action': '고비용 저효율 키워드 제외, 전환율 높은 키워드 집중'
            })

    # 블로그 데이터 기반 방향성
    blog = all_results.get('blog', {})
    if blog:
        kpi = blog.get('kpi', {})
        posts = kpi.get('total_posts', 0)
        if posts < 10:
            priorities.append({
                'area': '콘텐츠 생산',
                'priority': 'MEDIUM',
                'action': '블로그 발행량 확대로 오가닉 유입 증대'
            })

    # 유튜브 데이터 기반 방향성
    youtube = all_results.get('youtube', {})
    if youtube:
        kpi = youtube.get('kpi', {})
        shortform = kpi.get('shortform_count', 0)
        if shortform < 5:
            priorities.append({
                'area': '숏폼 콘텐츠',
                'priority': 'MEDIUM',
                'action': '숏폼 콘텐츠 확대로 신규 유입 채널 다각화'
            })

    # 종합 방향성 생성
    directions = [
        "1. **리드 품질 개선**: 광고 타겟팅 정교화 및 상담 전환 프로세스 강화",
        "2. **콘텐츠 마케팅 강화**: 블로그/유튜브 오가닉 채널 육성으로 광고 의존도 감소",
        "3. **데이터 기반 최적화**: CPA/전환율 지표 기반 예산 재배분",
        "4. **채널 다각화**: 숏폼 콘텐츠 및 SNS 채널 확대"
    ]

    return {
        'directions': directions,
        'priorities': priorities,
        'focus_areas': ['전환율 개선', 'CPA 최적화', '콘텐츠 확대']
    }
