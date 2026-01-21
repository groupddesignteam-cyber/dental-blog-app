"""
Streamlit UI Layout and Components - Month Comparison Design
"""

import streamlit as st
import plotly.express as px
import plotly.graph_objects as go
import pandas as pd
from typing import Dict, Any, List, Optional

# 마케팅 인사이트 모듈 임포트
try:
    from src.analysis.marketing_insights import (
        analyze_reservation_data,
        analyze_ads_data,
        analyze_blog_data,
        analyze_youtube_data,
        analyze_design_data,
        generate_overall_marketing_direction
    )
except ImportError:
    # Fallback for relative import
    analyze_reservation_data = None
    analyze_ads_data = None
    analyze_blog_data = None
    analyze_youtube_data = None
    analyze_design_data = None
    generate_overall_marketing_direction = None

# Plotly Layout - Clean Light Theme
PLOTLY_LAYOUT = dict(
    font=dict(family="Inter, Noto Sans KR, sans-serif", color="#1E293B"),
    paper_bgcolor='rgba(0,0,0,0)',
    plot_bgcolor='rgba(0,0,0,0)',
    margin=dict(l=20, r=20, t=40, b=20),
    xaxis=dict(
        gridcolor='#E2E8F0',
        linecolor='#CBD5E1',
        tickfont=dict(color='#64748B')
    ),
    yaxis=dict(
        gridcolor='#E2E8F0',
        linecolor='#CBD5E1',
        tickfont=dict(color='#64748B')
    ),
    legend=dict(font=dict(color='#64748B'))
)

# Colors
COLORS = {
    'primary': '#3B82F6',
    'secondary': '#60A5FA',
    'success': '#10B981',
    'danger': '#EF4444',
    'warning': '#F59E0B',
    'info': '#3B82F6',
    'text': '#1E293B',
    'subtext': '#64748B'
}


def format_number(value: float, prefix: str = '', suffix: str = '') -> str:
    """Format number with locale-aware separators."""
    if pd.isna(value) or value is None:
        return '-'
    if isinstance(value, float):
        if abs(value) >= 1000000:
            return f"{prefix}{value/1000000:,.1f}M{suffix}"
        elif abs(value) >= 1000:
            return f"{prefix}{value:,.0f}{suffix}"
        else:
            return f"{prefix}{value:,.1f}{suffix}"
    return f"{prefix}{value:,}{suffix}"


def calculate_change(current: float, previous: float) -> tuple:
    """Calculate change and percentage."""
    if pd.isna(current) or current is None:
        current = 0
    if pd.isna(previous) or previous is None:
        previous = 0

    change = current - previous
    if previous > 0:
        pct = (change / previous) * 100
    else:
        pct = 0 if current == 0 else 100
    return change, pct


def render_month_header_st(month: str, is_current: bool = False):
    """Render a month header using Streamlit native components."""
    bg_color = "#3b82f6" if is_current else "#64748b"
    st.markdown(f"""
        <div style="background: {bg_color}; color: white; padding: 12px 16px;
                    border-radius: 8px; text-align: center; margin-bottom: 16px;">
            <span style="font-size: 18px; font-weight: 700;">{month or '-'}</span>
        </div>
    """, unsafe_allow_html=True)


def render_metrics_st(metrics: List[Dict]):
    """Render metrics using Streamlit columns and metric components."""
    cols = st.columns(len(metrics))
    for i, m in enumerate(metrics):
        with cols[i]:
            val = m.get('value', 0)
            label = f"{m.get('icon', '')} {m.get('label', '')}"
            st.metric(label=label, value=format_number(val if isinstance(val, (int, float)) else 0))


def render_change_summary_st(changes: List[Dict]):
    """Render change indicators using Streamlit columns."""
    cols = st.columns(len(changes))
    for i, c in enumerate(changes):
        with cols[i]:
            curr = c.get('curr', 0)
            prev = c.get('prev', 0)
            reverse = c.get('reverse', False)
            label = c.get('label', '')

            change, pct = calculate_change(curr, prev)
            if change > 0:
                delta_color = "inverse" if reverse else "normal"
            elif change < 0:
                delta_color = "normal" if reverse else "inverse"
            else:
                delta_color = "off"

            st.metric(
                label=label,
                value=format_number(curr),
                delta=f"{pct:+.1f}%",
                delta_color=delta_color
            )


def render_marketing_insights(insights_data: Dict[str, Any], section_key: str):
    """마케팅 인사이트 및 방향성 제시 컴포넌트"""
    if not insights_data:
        return

    st.markdown("---")
    st.subheader("📈 마케팅 인사이트 및 방향성")

    # 요약
    summary = insights_data.get('summary', '')
    if summary:
        st.markdown(f"""
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        padding: 20px; border-radius: 12px; margin-bottom: 16px;">
                <p style="color: white; font-size: 16px; margin: 0; line-height: 1.6;">
                    💡 {summary}
                </p>
            </div>
        """, unsafe_allow_html=True)

    col1, col2 = st.columns(2)

    # 인사이트
    with col1:
        insights = insights_data.get('insights', [])
        if insights:
            st.markdown("**📊 핵심 인사이트**")
            for insight in insights:
                st.markdown(f"""
                    <div style="background: #f8fafc; border-left: 4px solid #3b82f6;
                                padding: 12px 16px; margin-bottom: 8px; border-radius: 0 8px 8px 0;">
                        <p style="margin: 0; color: #334155; font-size: 14px;">{insight}</p>
                    </div>
                """, unsafe_allow_html=True)

    # 권장 사항
    with col2:
        recommendations = insights_data.get('recommendations', [])
        if recommendations:
            st.markdown("**🎯 권장 액션**")
            for rec in recommendations:
                st.markdown(f"""
                    <div style="background: #fef3c7; border-left: 4px solid #f59e0b;
                                padding: 12px 16px; margin-bottom: 8px; border-radius: 0 8px 8px 0;">
                        <p style="margin: 0; color: #92400e; font-size: 14px;">{rec}</p>
                    </div>
                """, unsafe_allow_html=True)
        else:
            st.markdown("**🎯 권장 액션**")
            st.info("현재 특별한 권장 사항이 없습니다. 좋은 성과를 유지하세요!")


def render_editable_summary(default_text: str, key: str, label: str = "요약 수정"):
    """수정 가능한 요약 텍스트 컴포넌트"""
    # session_state에서 저장된 값 확인
    state_key = f"editable_{key}"

    if state_key not in st.session_state:
        st.session_state[state_key] = default_text

    with st.expander(f"✏️ {label}", expanded=False):
        edited_text = st.text_area(
            "내용을 수정하세요:",
            value=st.session_state[state_key],
            height=150,
            key=f"textarea_{key}"
        )

        col1, col2 = st.columns([1, 4])
        with col1:
            if st.button("저장", key=f"save_{key}"):
                st.session_state[state_key] = edited_text
                st.success("저장되었습니다!")
        with col2:
            if st.button("초기화", key=f"reset_{key}"):
                st.session_state[state_key] = default_text
                st.rerun()

    return st.session_state[state_key]


def render_editable_insights_section(insights_data: Dict[str, Any], section_key: str):
    """수정 가능한 마케팅 인사이트 섹션"""
    if not insights_data:
        return

    st.markdown("---")

    # 탭으로 인사이트 보기/수정 구분
    tab1, tab2 = st.tabs(["📊 인사이트 보기", "✏️ 내용 수정"])

    with tab1:
        st.subheader("📈 마케팅 인사이트 및 방향성")

        # 요약 - 수정된 내용 표시
        summary_key = f"summary_{section_key}"
        summary = st.session_state.get(summary_key, insights_data.get('summary', ''))

        if summary:
            st.markdown(f"""
                <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
                            padding: 20px; border-radius: 12px; margin-bottom: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                    <p style="color: white; font-size: 16px; margin: 0; line-height: 1.6; font-weight: 500;">
                        💡 {summary}
                    </p>
                </div>
            """, unsafe_allow_html=True)

        col1, col2 = st.columns(2)

        # 인사이트 - 수정된 내용 표시
        with col1:
            insights_key = f"insights_{section_key}"
            insights = st.session_state.get(insights_key, insights_data.get('insights', []))

            if insights:
                st.markdown("**📊 핵심 인사이트**")
                for i, insight in enumerate(insights):
                    st.markdown(f"""
                        <div style="background: #f0f9ff; border-left: 4px solid #3b82f6;
                                    padding: 12px 16px; margin-bottom: 8px; border-radius: 0 8px 8px 0;">
                            <p style="margin: 0; color: #1e40af; font-size: 14px;">{insight}</p>
                        </div>
                    """, unsafe_allow_html=True)

        # 권장 사항 - 수정된 내용 표시
        with col2:
            recs_key = f"recommendations_{section_key}"
            recommendations = st.session_state.get(recs_key, insights_data.get('recommendations', []))

            if recommendations:
                st.markdown("**🎯 권장 액션**")
                for rec in recommendations:
                    st.markdown(f"""
                        <div style="background: #fffbeb; border-left: 4px solid #f59e0b;
                                    padding: 12px 16px; margin-bottom: 8px; border-radius: 0 8px 8px 0;">
                            <p style="margin: 0; color: #92400e; font-size: 14px;">{rec}</p>
                        </div>
                    """, unsafe_allow_html=True)
            else:
                st.markdown("**🎯 권장 액션**")
                st.success("현재 특별한 권장 사항이 없습니다. 좋은 성과를 유지하세요!")

    with tab2:
        st.subheader("✏️ 인사이트 내용 수정")
        st.caption("분석 내용을 직접 수정하여 리포트에 반영할 수 있습니다.")

        # 요약 수정
        summary_key = f"summary_{section_key}"
        if summary_key not in st.session_state:
            st.session_state[summary_key] = insights_data.get('summary', '')

        new_summary = st.text_area(
            "💡 요약 문구",
            value=st.session_state[summary_key],
            height=80,
            key=f"edit_summary_{section_key}"
        )

        # 인사이트 수정
        insights_key = f"insights_{section_key}"
        if insights_key not in st.session_state:
            st.session_state[insights_key] = insights_data.get('insights', [])

        current_insights = st.session_state[insights_key]
        st.markdown("**📊 핵심 인사이트**")

        new_insights = []
        for i, insight in enumerate(current_insights):
            edited = st.text_input(
                f"인사이트 {i+1}",
                value=insight,
                key=f"edit_insight_{section_key}_{i}"
            )
            if edited.strip():
                new_insights.append(edited)

        # 새 인사이트 추가
        new_insight = st.text_input(
            "새 인사이트 추가",
            placeholder="새로운 인사이트를 입력하세요...",
            key=f"new_insight_{section_key}"
        )

        # 권장 사항 수정
        recs_key = f"recommendations_{section_key}"
        if recs_key not in st.session_state:
            st.session_state[recs_key] = insights_data.get('recommendations', [])

        current_recs = st.session_state[recs_key]
        st.markdown("**🎯 권장 액션**")

        new_recs = []
        for i, rec in enumerate(current_recs):
            edited = st.text_input(
                f"권장 사항 {i+1}",
                value=rec,
                key=f"edit_rec_{section_key}_{i}"
            )
            if edited.strip():
                new_recs.append(edited)

        # 새 권장 사항 추가
        new_rec = st.text_input(
            "새 권장 사항 추가",
            placeholder="새로운 권장 사항을 입력하세요...",
            key=f"new_rec_{section_key}"
        )

        # 저장 버튼
        col1, col2, col3 = st.columns([1, 1, 3])
        with col1:
            if st.button("💾 변경사항 저장", key=f"save_all_{section_key}"):
                st.session_state[summary_key] = new_summary

                final_insights = new_insights.copy()
                if new_insight.strip():
                    final_insights.append(new_insight)
                st.session_state[insights_key] = final_insights

                final_recs = new_recs.copy()
                if new_rec.strip():
                    final_recs.append(new_rec)
                st.session_state[recs_key] = final_recs

                st.success("저장되었습니다!")
                st.rerun()

        with col2:
            if st.button("🔄 초기화", key=f"reset_all_{section_key}"):
                st.session_state[summary_key] = insights_data.get('summary', '')
                st.session_state[insights_key] = insights_data.get('insights', [])
                st.session_state[recs_key] = insights_data.get('recommendations', [])
                st.rerun()


def render_key_metrics_cards(metrics: Dict[str, str], title: str = "핵심 지표"):
    """핵심 지표 카드 렌더링"""
    if not metrics:
        return

    st.markdown(f"**{title}**")
    cols = st.columns(len(metrics))

    colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

    for i, (label, value) in enumerate(metrics.items()):
        with cols[i]:
            color = colors[i % len(colors)]
            st.markdown(f"""
                <div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px;
                            padding: 16px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                    <p style="color: {color}; font-size: 11px; font-weight: 600; margin: 0;
                              text-transform: uppercase; letter-spacing: 0.5px;">{label}</p>
                    <p style="font-size: 24px; font-weight: 700; color: #1e293b; margin: 8px 0 0 0;">{value}</p>
                </div>
            """, unsafe_allow_html=True)


def create_comparison_bar_chart(curr_data: Dict, prev_data: Dict,
                                 metrics: List[Dict], title: str) -> go.Figure:
    """Create grouped bar chart comparing two months."""
    labels = [m['label'] for m in metrics]
    curr_values = [m.get('curr', 0) for m in metrics]
    prev_values = [m.get('prev', 0) for m in metrics]

    fig = go.Figure()

    fig.add_trace(go.Bar(
        name='전월',
        x=labels,
        y=prev_values,
        marker_color='#94a3b8',
        text=[format_number(v) for v in prev_values],
        textposition='outside'
    ))

    fig.add_trace(go.Bar(
        name='이번달',
        x=labels,
        y=curr_values,
        marker_color='#3b82f6',
        text=[format_number(v) for v in curr_values],
        textposition='outside'
    ))

    fig.update_layout(
        title=dict(text=title, x=0.5, xanchor='center'),
        barmode='group',
        **PLOTLY_LAYOUT
    )

    return fig


def create_trend_chart(data: List[Dict], x_col: str, y_col: str, title: str) -> go.Figure:
    """Create a clean line chart."""
    if not data:
        return None

    df = pd.DataFrame(data)
    if df.empty or x_col not in df.columns or y_col not in df.columns:
        return None

    fig = go.Figure()

    fig.add_trace(go.Scatter(
        x=df[x_col],
        y=df[y_col],
        mode='lines+markers',
        line=dict(color=COLORS['primary'], width=3),
        marker=dict(size=10, color='white', line=dict(width=3, color=COLORS['primary'])),
        name=title,
        fill='tozeroy',
        fillcolor='rgba(59, 130, 246, 0.1)'
    ))

    fig.update_layout(
        title=dict(text=title, x=0.5, xanchor='center'),
        **PLOTLY_LAYOUT,
        hovermode='x unified'
    )

    return fig


def create_bar_chart(data: List[Dict], x_col: str, y_col: str, title: str,
                     horizontal: bool = False) -> go.Figure:
    """Create a clean bar chart."""
    if not data:
        return None

    df = pd.DataFrame(data)
    if df.empty:
        return None

    if horizontal:
        fig = go.Figure(go.Bar(
            y=df[x_col],
            x=df[y_col],
            orientation='h',
            marker=dict(color=COLORS['primary'], cornerradius=4),
            text=df[y_col].apply(lambda x: format_number(x)),
            textposition='outside'
        ))
    else:
        fig = go.Figure(go.Bar(
            x=df[x_col],
            y=df[y_col],
            marker=dict(color=COLORS['primary'], cornerradius=4),
            text=df[y_col].apply(lambda x: format_number(x)),
            textposition='outside'
        ))

    fig.update_layout(
        title=dict(text=title, x=0.5, xanchor='center'),
        **PLOTLY_LAYOUT
    )

    return fig


def create_funnel_comparison_chart(prev_data: Dict, curr_data: Dict,
                                    prev_month: str, curr_month: str) -> go.Figure:
    """예약 퍼널 비교 차트 - 2번 사진 스타일로 시각화"""
    categories = ['총 신청', '내원 확정', '취소/노쇼']
    prev_values = [
        prev_data.get('total_reservations', 0),
        prev_data.get('completed_count', 0),
        prev_data.get('canceled_count', 0)
    ]
    curr_values = [
        curr_data.get('total_reservations', 0),
        curr_data.get('completed_count', 0),
        curr_data.get('canceled_count', 0)
    ]

    fig = go.Figure()

    # 전월 바
    fig.add_trace(go.Bar(
        name=prev_month,
        y=categories,
        x=prev_values,
        orientation='h',
        marker=dict(color='#94a3b8', cornerradius=4),
        text=[format_number(v) for v in prev_values],
        textposition='inside',
        textfont=dict(color='white', size=14, family='Pretendard')
    ))

    # 이번달 바
    fig.add_trace(go.Bar(
        name=curr_month,
        y=categories,
        x=curr_values,
        orientation='h',
        marker=dict(color='#3b82f6', cornerradius=4),
        text=[format_number(v) for v in curr_values],
        textposition='inside',
        textfont=dict(color='white', size=14, family='Pretendard')
    ))

    fig.update_layout(
        barmode='group',
        title=dict(text='예약 퍼널 비교', x=0.5, xanchor='center', font=dict(size=18)),
        **PLOTLY_LAYOUT,
        height=300,
        legend=dict(
            orientation='h',
            yanchor='bottom',
            y=1.02,
            xanchor='center',
            x=0.5
        ),
        yaxis=dict(categoryorder='array', categoryarray=categories[::-1])
    )

    return fig


def create_top5_horizontal_bar(data: List[Dict], label_col: str, value_col: str,
                                title: str, color: str = '#3b82f6') -> go.Figure:
    """TOP5 데이터를 수평 바 차트로 시각화 - 2번 사진 스타일"""
    if not data:
        return None

    df = pd.DataFrame(data[:5])  # TOP5만
    if df.empty or label_col not in df.columns or value_col not in df.columns:
        return None

    # 역순으로 정렬 (아래에서 위로 큰 순)
    df = df.iloc[::-1]

    max_val = df[value_col].max() if not df[value_col].empty else 1

    fig = go.Figure()

    fig.add_trace(go.Bar(
        y=df[label_col],
        x=df[value_col],
        orientation='h',
        marker=dict(
            color=color,
            cornerradius=4
        ),
        text=[f"{v}건" for v in df[value_col]],
        textposition='outside',
        textfont=dict(size=12, family='Pretendard')
    ))

    fig.update_layout(
        title=dict(text=title, x=0.5, xanchor='center', font=dict(size=14)),
        font=dict(family="Inter, Noto Sans KR, sans-serif", color="#1E293B"),
        paper_bgcolor='rgba(0,0,0,0)',
        plot_bgcolor='rgba(0,0,0,0)',
        height=200,
        margin=dict(l=120, r=50, t=40, b=20),
        xaxis=dict(
            range=[0, max_val * 1.3],
            showgrid=True,
            gridcolor='#E2E8F0'
        ),
        yaxis=dict(
            gridcolor='#E2E8F0',
            linecolor='#CBD5E1',
            tickfont=dict(color='#64748B')
        ),
        showlegend=False
    )

    return fig


def render_reservation_tab(result: Dict[str, Any]):
    """Render reservation tab with side-by-side month columns using Streamlit native components."""
    if not result:
        st.info("데이터가 없습니다.")
        return

    current_month = result.get('month', '-')
    prev_month = result.get('prev_month', '-')

    curr_data = result.get('current_month_data', {})
    prev_data = result.get('prev_month_data', {})

    st.subheader("📊 예약 퍼널 분석")

    # 2번 사진 스타일 - 양쪽에 월 헤더와 아이콘 카드
    col_prev, col_curr = st.columns(2)

    with col_prev:
        st.markdown(f"""
            <div style="text-align: center; padding: 16px 0; margin-bottom: 16px;">
                <span style="font-size: 24px; font-weight: 700; color: #475569;">{prev_month}</span>
            </div>
        """, unsafe_allow_html=True)

        # 아이콘 카드 형식으로 메트릭 표시
        metric_cols = st.columns(3)
        with metric_cols[0]:
            st.markdown("""
                <div style="background: #f1f5f9; border-radius: 12px; padding: 16px; text-align: center;">
                    <div style="width: 40px; height: 40px; background: #3b82f6; border-radius: 8px; margin: 0 auto 8px; display: flex; align-items: center; justify-content: center;">
                        <span style="color: white; font-size: 20px;">📋</span>
                    </div>
                    <p style="color: #64748b; font-size: 12px; margin: 0;">총 신청</p>
                    <p style="font-size: 24px; font-weight: 700; color: #1e293b; margin: 4px 0;">{:,} 건</p>
                </div>
            """.format(prev_data.get('total_reservations', 0)), unsafe_allow_html=True)
        with metric_cols[1]:
            st.markdown("""
                <div style="background: #f0fdf4; border-radius: 12px; padding: 16px; text-align: center;">
                    <div style="width: 40px; height: 40px; background: #22c55e; border-radius: 8px; margin: 0 auto 8px; display: flex; align-items: center; justify-content: center;">
                        <span style="color: white; font-size: 20px;">✅</span>
                    </div>
                    <p style="color: #64748b; font-size: 12px; margin: 0;">내원 확정</p>
                    <p style="font-size: 24px; font-weight: 700; color: #1e293b; margin: 4px 0;">{:,} 건</p>
                </div>
            """.format(prev_data.get('completed_count', 0)), unsafe_allow_html=True)
        with metric_cols[2]:
            st.markdown("""
                <div style="background: #fef2f2; border-radius: 12px; padding: 16px; text-align: center;">
                    <div style="width: 40px; height: 40px; background: #ef4444; border-radius: 8px; margin: 0 auto 8px; display: flex; align-items: center; justify-content: center;">
                        <span style="color: white; font-size: 20px;">❌</span>
                    </div>
                    <p style="color: #64748b; font-size: 12px; margin: 0;">취소/노쇼</p>
                    <p style="font-size: 24px; font-weight: 700; color: #1e293b; margin: 4px 0;">{:,} 건</p>
                </div>
            """.format(prev_data.get('canceled_count', 0)), unsafe_allow_html=True)

    with col_curr:
        st.markdown(f"""
            <div style="text-align: center; padding: 16px 0; margin-bottom: 16px;">
                <span style="font-size: 24px; font-weight: 700; color: #3b82f6;">{current_month}</span>
            </div>
        """, unsafe_allow_html=True)

        metric_cols = st.columns(3)
        with metric_cols[0]:
            st.markdown("""
                <div style="background: #eff6ff; border-radius: 12px; padding: 16px; text-align: center; border: 2px solid #3b82f6;">
                    <div style="width: 40px; height: 40px; background: #3b82f6; border-radius: 8px; margin: 0 auto 8px; display: flex; align-items: center; justify-content: center;">
                        <span style="color: white; font-size: 20px;">📋</span>
                    </div>
                    <p style="color: #3b82f6; font-size: 12px; margin: 0;">총 신청</p>
                    <p style="font-size: 24px; font-weight: 700; color: #1e293b; margin: 4px 0;">{:,} 건</p>
                </div>
            """.format(curr_data.get('total_reservations', 0)), unsafe_allow_html=True)
        with metric_cols[1]:
            st.markdown("""
                <div style="background: #f0fdf4; border-radius: 12px; padding: 16px; text-align: center; border: 2px solid #22c55e;">
                    <div style="width: 40px; height: 40px; background: #22c55e; border-radius: 8px; margin: 0 auto 8px; display: flex; align-items: center; justify-content: center;">
                        <span style="color: white; font-size: 20px;">✅</span>
                    </div>
                    <p style="color: #22c55e; font-size: 12px; margin: 0;">내원 확정</p>
                    <p style="font-size: 24px; font-weight: 700; color: #1e293b; margin: 4px 0;">{:,} 건</p>
                </div>
            """.format(curr_data.get('completed_count', 0)), unsafe_allow_html=True)
        with metric_cols[2]:
            st.markdown("""
                <div style="background: #fef2f2; border-radius: 12px; padding: 16px; text-align: center; border: 2px solid #ef4444;">
                    <div style="width: 40px; height: 40px; background: #ef4444; border-radius: 8px; margin: 0 auto 8px; display: flex; align-items: center; justify-content: center;">
                        <span style="color: white; font-size: 20px;">❌</span>
                    </div>
                    <p style="color: #ef4444; font-size: 12px; margin: 0;">취소/노쇼</p>
                    <p style="font-size: 24px; font-weight: 700; color: #1e293b; margin: 4px 0;">{:,} 건</p>
                </div>
            """.format(curr_data.get('canceled_count', 0)), unsafe_allow_html=True)

    # 전월 대비 변화 - 시각적 비교 차트
    st.markdown("#### 📈 전월 대비 변화")
    render_change_summary_st([
        {'label': '총 신청', 'curr': curr_data.get('total_reservations', 0), 'prev': prev_data.get('total_reservations', 0)},
        {'label': '내원 확정', 'curr': curr_data.get('completed_count', 0), 'prev': prev_data.get('completed_count', 0)},
        {'label': '취소율', 'curr': curr_data.get('cancel_rate', 0), 'prev': prev_data.get('cancel_rate', 0), 'reverse': True},
    ])

    st.divider()

    tables = result.get('tables', {})

    # 주요 희망 진료 TOP5 - 차트로 시각화 (2번 사진 스타일)
    st.markdown("### 🦷 주요 희망 진료 TOP5")
    col1, col2 = st.columns(2)
    with col1:
        prev_treatment = tables.get('prev_treatment_top5', [])
        fig = create_top5_horizontal_bar(prev_treatment, 'treatment', 'count', prev_month, '#94a3b8')
        if fig:
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("데이터 없음")

    with col2:
        curr_treatment = tables.get('treatment_top5', [])
        fig = create_top5_horizontal_bar(curr_treatment, 'treatment', 'count', current_month, '#3b82f6')
        if fig:
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("데이터 없음")

    # 어떻게 치과를 알게 되었는지 TOP5 - 차트로 시각화
    prev_how_found = tables.get('prev_how_found_top5', [])
    curr_how_found = tables.get('how_found_top5', [])
    if prev_how_found or curr_how_found:
        st.markdown("### 🔍 어떻게 치과를 알게 되었는지? TOP5")
        col1, col2 = st.columns(2)
        with col1:
            fig = create_top5_horizontal_bar(prev_how_found, 'how_found', 'count', prev_month, '#94a3b8')
            if fig:
                st.plotly_chart(fig, use_container_width=True)
            else:
                st.info("데이터 없음")

        with col2:
            fig = create_top5_horizontal_bar(curr_how_found, 'how_found', 'count', current_month, '#3b82f6')
            if fig:
                st.plotly_chart(fig, use_container_width=True)
            else:
                st.info("데이터 없음")

    # 주요 예약 취소 사유 TOP5 - 차트로 시각화
    st.markdown("### ❌ 주요 예약 취소 사유 TOP5")
    col1, col2 = st.columns(2)
    with col1:
        prev_cancel = tables.get('prev_cancel_reason_top5', [])
        fig = create_top5_horizontal_bar(prev_cancel, 'cancel_reason', 'count', prev_month, '#f97316')
        if fig:
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("데이터 없음")

    with col2:
        curr_cancel = tables.get('cancel_reason_top5', [])
        fig = create_top5_horizontal_bar(curr_cancel, 'cancel_reason', 'count', current_month, '#ef4444')
        if fig:
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("데이터 없음")

    # AI 특이사항 표시
    ai_curr_count = tables.get('ai_source_count', 0)
    ai_prev_count = tables.get('prev_ai_source_count', 0)
    ai_sources = tables.get('ai_sources', [])

    if ai_curr_count > 0 or ai_prev_count > 0:
        st.markdown("### 🤖 특이사항: AI를 통한 유입")
        col1, col2 = st.columns(2)
        with col1:
            if ai_prev_count > 0:
                st.warning(f"**{prev_month}**: AI(ChatGPT, Gemini 등)를 통해 치과를 알게 된 고객 **{ai_prev_count}건**")
            else:
                st.info(f"**{prev_month}**: AI 유입 없음")
        with col2:
            if ai_curr_count > 0:
                st.warning(f"**{current_month}**: AI(ChatGPT, Gemini 등)를 통해 치과를 알게 된 고객 **{ai_curr_count}건**")
                if ai_sources:
                    with st.expander("AI 유입 상세 내용"):
                        for src in ai_sources:
                            st.write(f"• {src}")
            else:
                st.info(f"**{current_month}**: AI 유입 없음")

    st.divider()

    # Charts side by side
    st.markdown("### 📈 추이 분석")
    col1, col2 = st.columns(2)
    with col1:
        chart_data = result.get('charts', {}).get('monthly_trend', [])
        fig = create_trend_chart(chart_data, 'year_month', 'total', '월별 예약 추이')
        if fig:
            st.plotly_chart(fig, use_container_width=True)

    with col2:
        inflow = tables.get('inflow_top5', [])
        fig = create_bar_chart(inflow, 'inflow', 'count', '주요 유입 경로 TOP5', horizontal=True)
        if fig:
            st.plotly_chart(fig, use_container_width=True)

    # 마케팅 인사이트 섹션
    if analyze_reservation_data:
        insights_data = analyze_reservation_data(result)
        if insights_data:
            render_editable_insights_section(insights_data, "reservation")


def render_ads_tab(result: Dict[str, Any]):
    """Render ads tab with side-by-side month columns using Streamlit native components."""
    if not result:
        st.info("데이터가 없습니다.")
        return

    current_month = result.get('month', '-')
    prev_month = result.get('prev_month', '-')

    curr = result.get('current_month_data', {})
    prev = result.get('prev_month_data', {})
    curr_campaign = curr.get('campaign', {})
    prev_campaign = prev.get('campaign', {})
    kpi = result.get('kpi', {})

    # CPA 데이터 가져오기
    cpa = kpi.get('cpa', 0)
    prev_cpa = kpi.get('prev_cpa', 0)
    cpa_growth = kpi.get('cpa_growth', 0)
    actual_reservations = kpi.get('actual_reservations', 0)

    st.subheader("📊 광고팀 성과")

    # CPA 강조 배너 (환자 1인당 마케팅 비용)
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
            else:
                cpa_change_text = "전월과 동일"

        st.markdown(f"""
            <div style="background: linear-gradient(135deg, #0055FF 0%, #3b82f6 100%); border-radius: 16px; padding: 24px; margin-bottom: 24px; color: white; text-align: center;">
                <p style="font-size: 14px; margin: 0 0 8px 0; opacity: 0.9;">💰 환자 1인당 마케팅 비용 (CPA)</p>
                <p style="font-size: 36px; font-weight: 800; margin: 0;">₩{int(cpa):,}</p>
                <p style="font-size: 12px; margin: 8px 0 0 0; opacity: 0.8;">실 예약 환자 {actual_reservations:,}명 기준</p>
                {f'<p style="font-size: 13px; margin: 8px 0 0 0; color: {cpa_change_color}; background: white; display: inline-block; padding: 4px 12px; border-radius: 20px;">{cpa_change_text}</p>' if cpa_change_text else ''}
            </div>
        """, unsafe_allow_html=True)

    # Two columns for month comparison
    col_prev, col_curr = st.columns(2)

    with col_prev:
        render_month_header_st(prev_month, is_current=False)
        render_metrics_st([
            {'label': '광고비', 'value': prev.get('total_spend', 0), 'icon': '💰'},
            {'label': '노출수', 'value': prev_campaign.get('total_impressions', 0), 'icon': '👁️'},
            {'label': '클릭수', 'value': prev_campaign.get('total_clicks', 0), 'icon': '👆'},
        ])

    with col_curr:
        render_month_header_st(current_month, is_current=True)
        render_metrics_st([
            {'label': '광고비', 'value': curr.get('total_spend', 0), 'icon': '💰'},
            {'label': '노출수', 'value': curr_campaign.get('total_impressions', 0), 'icon': '👁️'},
            {'label': '클릭수', 'value': curr_campaign.get('total_clicks', 0), 'icon': '👆'},
        ])

    # Change summary
    st.markdown("#### 📈 전월 대비 변화")
    render_change_summary_st([
        {'label': '광고비', 'curr': curr.get('total_spend', 0), 'prev': prev.get('total_spend', 0), 'reverse': True},
        {'label': '노출수', 'curr': curr_campaign.get('total_impressions', 0), 'prev': prev_campaign.get('total_impressions', 0)},
        {'label': '클릭수', 'curr': curr_campaign.get('total_clicks', 0), 'prev': prev_campaign.get('total_clicks', 0)},
    ])

    st.divider()

    # CTR comparison
    st.markdown("### 🎯 CTR 비교")
    col1, col2 = st.columns(2)
    with col1:
        st.metric(label="전월 평균 CTR", value=f"{prev_campaign.get('avg_ctr', 0):.2f}%")
    with col2:
        change, pct = calculate_change(curr_campaign.get('avg_ctr', 0), prev_campaign.get('avg_ctr', 0))
        st.metric(
            label="이번달 평균 CTR",
            value=f"{curr_campaign.get('avg_ctr', 0):.2f}%",
            delta=f"{pct:+.1f}%"
        )

    st.divider()

    # Charts
    st.markdown("### 📈 추이 분석")
    col1, col2 = st.columns(2)
    with col1:
        chart_data = result.get('tables', {}).get('monthly_spend', [])
        fig = create_trend_chart(chart_data, 'year_month', 'spend', '월별 광고비 추이')
        if fig:
            st.plotly_chart(fig, use_container_width=True)

    with col2:
        top5 = result.get('tables', {}).get('keyword_top5_impressions', [])
        fig = create_bar_chart(top5, 'keyword', 'impressions', '키워드 노출 TOP5', horizontal=True)
        if fig:
            st.plotly_chart(fig, use_container_width=True)

    # 마케팅 인사이트 섹션
    if analyze_ads_data:
        insights_data = analyze_ads_data(result)
        if insights_data:
            render_editable_insights_section(insights_data, "ads")


def render_blog_tab(result: Dict[str, Any]):
    """Render blog tab with side-by-side month columns using Streamlit native components."""
    if not result:
        st.info("데이터가 없습니다.")
        return

    current_month = result.get('month', '-')
    prev_month = result.get('prev_month', '-')

    curr = result.get('current_month_data', {})
    prev = result.get('prev_month_data', {})
    curr_work = curr.get('work', {})
    prev_work = prev.get('work', {})

    st.subheader("📊 콘텐츠팀 성과 분석")

    # 계약건수, 발행완료, 이월건수 (CSV 파일의 "지난달 이월 건수" 컬럼 값 사용)
    kpi = result.get('kpi', {})
    prev_contract = prev_work.get('contract_count', 0)
    prev_published = prev_work.get('published_count', 0)
    prev_carryover = kpi.get('prev_carryover_count', 0) or prev_work.get('base_carryover', 0) or max(0, prev_contract - prev_published)

    curr_contract = curr_work.get('contract_count', 0)
    curr_published = curr_work.get('published_count', 0)
    curr_carryover = kpi.get('carryover_count', 0) or curr_work.get('base_carryover', 0) or max(0, curr_contract - curr_published)

    # 자료 미수신 건수 (상태가 '자료대기'인 항목)
    prev_pending_data = prev_work.get('pending_data_count', 0)
    curr_pending_data = curr_work.get('pending_data_count', 0)

    # Two columns for month comparison - 예약 탭과 동일한 카드 스타일
    col_prev, col_curr = st.columns(2)

    with col_prev:
        st.markdown(f"""
            <div style="text-align: center; padding: 16px 0; margin-bottom: 16px;">
                <span style="font-size: 24px; font-weight: 700; color: #475569;">{prev_month}</span>
            </div>
        """, unsafe_allow_html=True)

        # 메트릭 카드 - 5열 (총조회수, 계약건수, 발행완료, 이월건수, 완료율)
        metric_cols = st.columns(5)
        with metric_cols[0]:
            st.markdown(f"""
                <div style="background: #f1f5f9; border-radius: 12px; padding: 12px 8px; text-align: center;">
                    <div style="font-size: 20px; margin-bottom: 4px;">👁️</div>
                    <p style="color: #64748b; font-size: 11px; margin: 0;">총 조회수</p>
                    <p style="font-size: 18px; font-weight: 700; color: #1e293b; margin: 4px 0;">{prev.get('total_views', 0):,}</p>
                </div>
            """, unsafe_allow_html=True)
        with metric_cols[1]:
            st.markdown(f"""
                <div style="background: #f1f5f9; border-radius: 12px; padding: 12px 8px; text-align: center;">
                    <div style="font-size: 20px; margin-bottom: 4px;">📄</div>
                    <p style="color: #64748b; font-size: 11px; margin: 0;">계약 건수</p>
                    <p style="font-size: 18px; font-weight: 700; color: #1e293b; margin: 4px 0;">{prev_contract}</p>
                </div>
            """, unsafe_allow_html=True)
        with metric_cols[2]:
            st.markdown(f"""
                <div style="background: #f0fdf4; border-radius: 12px; padding: 12px 8px; text-align: center;">
                    <div style="font-size: 20px; margin-bottom: 4px;">✅</div>
                    <p style="color: #64748b; font-size: 11px; margin: 0;">발행 완료</p>
                    <p style="font-size: 18px; font-weight: 700; color: #22c55e; margin: 4px 0;">{prev_published}</p>
                </div>
            """, unsafe_allow_html=True)
        with metric_cols[3]:
            carryover_color = '#f97316' if prev_carryover > 0 else '#64748b'
            pending_note = f'<p style="color: #f59e0b; font-size: 9px; margin: 2px 0 0 0;">⏳ 병원 측 임상 자료 대기 중 ({prev_pending_data}건)</p>' if prev_pending_data > 0 else ''
            st.markdown(f"""
                <div style="background: #fff7ed; border-radius: 12px; padding: 12px 8px; text-align: center;">
                    <div style="font-size: 20px; margin-bottom: 4px;">📦</div>
                    <p style="color: #64748b; font-size: 11px; margin: 0;">이월 건수</p>
                    <p style="font-size: 18px; font-weight: 700; color: {carryover_color}; margin: 4px 0;">{prev_carryover}</p>
                    {pending_note}
                </div>
            """, unsafe_allow_html=True)
        with metric_cols[4]:
            completion_rate = prev_work.get('completion_rate', 0)
            rate_color = '#22c55e' if completion_rate >= 80 else ('#f59e0b' if completion_rate >= 50 else '#ef4444')
            st.markdown(f"""
                <div style="background: #f1f5f9; border-radius: 12px; padding: 12px 8px; text-align: center;">
                    <div style="font-size: 20px; margin-bottom: 4px;">📊</div>
                    <p style="color: #64748b; font-size: 11px; margin: 0;">완료율</p>
                    <p style="font-size: 18px; font-weight: 700; color: {rate_color}; margin: 4px 0;">{completion_rate:.0f}%</p>
                </div>
            """, unsafe_allow_html=True)

    with col_curr:
        st.markdown(f"""
            <div style="text-align: center; padding: 16px 0; margin-bottom: 16px;">
                <span style="font-size: 24px; font-weight: 700; color: #3b82f6;">{current_month}</span>
            </div>
        """, unsafe_allow_html=True)

        # 메트릭 카드 - 5열 (이번 달, 파란색 테두리)
        metric_cols = st.columns(5)
        with metric_cols[0]:
            st.markdown(f"""
                <div style="background: #eff6ff; border-radius: 12px; padding: 12px 8px; text-align: center; border: 2px solid #3b82f6;">
                    <div style="font-size: 20px; margin-bottom: 4px;">👁️</div>
                    <p style="color: #3b82f6; font-size: 11px; margin: 0;">총 조회수</p>
                    <p style="font-size: 18px; font-weight: 700; color: #1e293b; margin: 4px 0;">{curr.get('total_views', 0):,}</p>
                </div>
            """, unsafe_allow_html=True)
        with metric_cols[1]:
            st.markdown(f"""
                <div style="background: #eff6ff; border-radius: 12px; padding: 12px 8px; text-align: center; border: 2px solid #3b82f6;">
                    <div style="font-size: 20px; margin-bottom: 4px;">📄</div>
                    <p style="color: #3b82f6; font-size: 11px; margin: 0;">계약 건수</p>
                    <p style="font-size: 18px; font-weight: 700; color: #1e293b; margin: 4px 0;">{curr_contract}</p>
                </div>
            """, unsafe_allow_html=True)
        with metric_cols[2]:
            st.markdown(f"""
                <div style="background: #f0fdf4; border-radius: 12px; padding: 12px 8px; text-align: center; border: 2px solid #22c55e;">
                    <div style="font-size: 20px; margin-bottom: 4px;">✅</div>
                    <p style="color: #22c55e; font-size: 11px; margin: 0;">발행 완료</p>
                    <p style="font-size: 18px; font-weight: 700; color: #22c55e; margin: 4px 0;">{curr_published}</p>
                </div>
            """, unsafe_allow_html=True)
        with metric_cols[3]:
            carryover_color = '#f97316' if curr_carryover > 0 else '#64748b'
            carryover_border = '#f97316' if curr_carryover > 0 else '#e2e8f0'
            pending_note = f'<p style="color: #f59e0b; font-size: 9px; margin: 2px 0 0 0;">⏳ 병원 측 임상 자료 대기 중 ({curr_pending_data}건)</p>' if curr_pending_data > 0 else ''
            st.markdown(f"""
                <div style="background: #fff7ed; border-radius: 12px; padding: 12px 8px; text-align: center; border: 2px solid {carryover_border};">
                    <div style="font-size: 20px; margin-bottom: 4px;">📦</div>
                    <p style="color: #f97316; font-size: 11px; margin: 0;">이월 건수</p>
                    <p style="font-size: 18px; font-weight: 700; color: {carryover_color}; margin: 4px 0;">{curr_carryover}</p>
                    {pending_note}
                </div>
            """, unsafe_allow_html=True)
        with metric_cols[4]:
            completion_rate = curr_work.get('completion_rate', 0)
            rate_color = '#22c55e' if completion_rate >= 80 else ('#f59e0b' if completion_rate >= 50 else '#ef4444')
            rate_border = '#22c55e' if completion_rate >= 80 else ('#f59e0b' if completion_rate >= 50 else '#ef4444')
            st.markdown(f"""
                <div style="background: #f1f5f9; border-radius: 12px; padding: 12px 8px; text-align: center; border: 2px solid {rate_border};">
                    <div style="font-size: 20px; margin-bottom: 4px;">📊</div>
                    <p style="color: {rate_color}; font-size: 11px; margin: 0;">완료율</p>
                    <p style="font-size: 18px; font-weight: 700; color: {rate_color}; margin: 4px 0;">{completion_rate:.0f}%</p>
                </div>
            """, unsafe_allow_html=True)

    # Change summary
    st.markdown("#### 📈 전월 대비 변화")
    render_change_summary_st([
        {'label': '조회수', 'curr': curr.get('total_views', 0), 'prev': prev.get('total_views', 0)},
        {'label': '발행 완료', 'curr': curr_published, 'prev': prev_published},
        {'label': '완료율', 'curr': curr_work.get('completion_rate', 0), 'prev': prev_work.get('completion_rate', 0)},
    ])

    st.divider()

    # 성과 원인 진단 (종합 의견)
    diagnosis = result.get('diagnosis', {})
    if diagnosis.get('has_issue') or diagnosis.get('severity') == 'success':
        st.markdown("### 📋 종합 의견")
        if diagnosis.get('severity') == 'critical':
            st.error(diagnosis.get('message', ''))
            st.warning(diagnosis.get('recommendation', ''))
        elif diagnosis.get('severity') == 'warning':
            st.warning(diagnosis.get('message', ''))
            st.info(diagnosis.get('recommendation', ''))
        elif diagnosis.get('severity') == 'success':
            st.success(diagnosis.get('message', ''))
            if diagnosis.get('recommendation'):
                st.info(diagnosis.get('recommendation', ''))
        st.divider()

    # 급상승 검색어 TOP10
    tables = result.get('tables', {})
    search_keywords = tables.get('search_keywords_top10', [])
    if search_keywords:
        st.markdown("### 🔥 이달의 급상승 검색어 TOP 10")
        col1, col2 = st.columns(2)
        for idx, kw in enumerate(search_keywords):
            with col1 if idx % 2 == 0 else col2:
                rank_color = '#3b82f6' if idx < 3 else '#64748b'
                st.markdown(f"""
                    <div style="display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.75rem; background: #f8fafc; border-radius: 8px; margin-bottom: 0.5rem; border: 1px solid #e2e8f0;">
                        <span style="width: 24px; height: 24px; background: {rank_color}; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 700;">{idx + 1}</span>
                        <span style="flex: 1; font-size: 0.875rem; color: #1e293b; font-weight: 500;">{kw.get('keyword', '')}</span>
                        <span style="font-size: 0.8125rem; color: #3b82f6; font-weight: 600;">{kw.get('ratio', 0)}%</span>
                    </div>
                """, unsafe_allow_html=True)
        st.caption("💡 이 키워드들은 유입 URL에서 추출한 실제 검색어입니다. 콘텐츠 기획 시 참고하세요.")
        st.divider()

    # 효자 콘텐츠 (스테디셀러)
    steady_sellers = tables.get('steady_sellers', [])
    if steady_sellers:
        st.markdown("### 🏆 효자 콘텐츠 (스테디셀러)")
        st.info("과거에 작성했지만 여전히 인기가 많은 효자 글입니다. 최신 정보로 업데이트(리라이팅)를 고려하세요.")
        for post in steady_sellers:
            st.markdown(f"""
                <div style="display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem; background: #fefce8; border-radius: 8px; margin-bottom: 0.5rem; border: 1px solid #fef08a;">
                    <span style="background: #eab308; color: white; font-size: 0.625rem; padding: 0.125rem 0.375rem; border-radius: 9999px; font-weight: 600;">스테디셀러</span>
                    <span style="flex: 1; font-size: 0.875rem; color: #1e293b; font-weight: 500;">{post.get('title', '')[:40]}{'...' if len(post.get('title', '')) > 40 else ''}</span>
                    <span style="font-size: 0.8125rem; color: #3b82f6; font-weight: 600;">{post.get('views', 0):,}회</span>
                    <span style="font-size: 0.75rem; color: #64748b;">{post.get('write_date', '')}</span>
                </div>
            """, unsafe_allow_html=True)
        st.divider()

    # 조회수 TOP5 (전월 vs 당월)
    st.markdown("### 👁️ 조회수 TOP 5 게시물")
    col_prev, col_curr = st.columns(2)

    with col_prev:
        st.markdown(f"<p style='text-align: center; font-weight: 700; color: #64748b;'>{prev_month}</p>", unsafe_allow_html=True)
        prev_views = tables.get('prev_views_top5', [])
        if prev_views:
            max_views = max(v.get('views', 1) for v in prev_views[:5]) or 1
            for idx, post in enumerate(prev_views[:5]):
                title = post.get('title', '')[:35]
                views = post.get('views', 0)
                pct = (views / max_views) * 100
                st.markdown(f"""
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                        <span style="width: 24px; height: 24px; background: #94a3b8; color: white; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;">{idx + 1}</span>
                        <div style="flex: 1;">
                            <p style="margin: 0; font-size: 12px; color: #475569;">{title}...</p>
                            <div style="height: 6px; background: #e2e8f0; border-radius: 3px; margin-top: 4px;">
                                <div style="height: 100%; width: {pct}%; background: #94a3b8; border-radius: 3px;"></div>
                            </div>
                        </div>
                        <span style="font-size: 12px; font-weight: 600; color: #64748b;">{views:,}회</span>
                    </div>
                """, unsafe_allow_html=True)
        else:
            st.info("전월 데이터 없음")

    with col_curr:
        st.markdown(f"<p style='text-align: center; font-weight: 700; color: #3b82f6;'>{current_month}</p>", unsafe_allow_html=True)
        curr_views = tables.get('views_top5', [])
        if curr_views:
            max_views = max(v.get('views', 1) for v in curr_views[:5]) or 1
            for idx, post in enumerate(curr_views[:5]):
                title = post.get('title', '')[:35]
                views = post.get('views', 0)
                pct = (views / max_views) * 100
                rank_color = '#3b82f6' if idx < 3 else '#64748b'
                st.markdown(f"""
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                        <span style="width: 24px; height: 24px; background: {rank_color}; color: white; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;">{idx + 1}</span>
                        <div style="flex: 1;">
                            <p style="margin: 0; font-size: 12px; color: #1e293b;">{title}...</p>
                            <div style="height: 6px; background: #e2e8f0; border-radius: 3px; margin-top: 4px;">
                                <div style="height: 100%; width: {pct}%; background: linear-gradient(90deg, #3b82f6, #60a5fa); border-radius: 3px;"></div>
                            </div>
                        </div>
                        <span style="font-size: 12px; font-weight: 600; color: #3b82f6;">{views:,}회</span>
                    </div>
                """, unsafe_allow_html=True)
        else:
            st.info("당월 조회수 데이터가 없습니다.")

    st.divider()

    # 검색 유입 TOP5 (전월 vs 당월)
    st.markdown("### 🔍 검색 유입 TOP 5 유입경로")
    col_prev, col_curr = st.columns(2)

    with col_prev:
        st.markdown(f"<p style='text-align: center; font-weight: 700; color: #64748b;'>{prev_month}</p>", unsafe_allow_html=True)
        prev_traffic = tables.get('prev_traffic_top5', [])
        if prev_traffic:
            max_ratio = max(t.get('ratio', 1) for t in prev_traffic[:5]) or 1
            for idx, src in enumerate(prev_traffic[:5]):
                source = src.get('source', '')[:30]
                ratio = src.get('ratio', 0)
                pct = (ratio / max_ratio) * 100
                st.markdown(f"""
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                        <span style="width: 24px; height: 24px; background: #94a3b8; color: white; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;">{idx + 1}</span>
                        <div style="flex: 1;">
                            <p style="margin: 0; font-size: 12px; color: #475569;">{source}</p>
                            <div style="height: 6px; background: #e2e8f0; border-radius: 3px; margin-top: 4px;">
                                <div style="height: 100%; width: {pct}%; background: #94a3b8; border-radius: 3px;"></div>
                            </div>
                        </div>
                        <span style="font-size: 12px; font-weight: 600; color: #64748b;">{ratio:.1f}%</span>
                    </div>
                """, unsafe_allow_html=True)
        else:
            st.info("전월 데이터 없음")

    with col_curr:
        st.markdown(f"<p style='text-align: center; font-weight: 700; color: #22c55e;'>{current_month}</p>", unsafe_allow_html=True)
        curr_traffic = tables.get('traffic_top5', [])
        if curr_traffic:
            max_ratio = max(t.get('ratio', 1) for t in curr_traffic[:5]) or 1
            for idx, src in enumerate(curr_traffic[:5]):
                source = src.get('source', '')[:30]
                ratio = src.get('ratio', 0)
                pct = (ratio / max_ratio) * 100
                rank_color = '#22c55e' if idx < 3 else '#64748b'
                st.markdown(f"""
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                        <span style="width: 24px; height: 24px; background: {rank_color}; color: white; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;">{idx + 1}</span>
                        <div style="flex: 1;">
                            <p style="margin: 0; font-size: 12px; color: #1e293b;">{source}</p>
                            <div style="height: 6px; background: #e2e8f0; border-radius: 3px; margin-top: 4px;">
                                <div style="height: 100%; width: {pct}%; background: linear-gradient(90deg, #22c55e, #4ade80); border-radius: 3px;"></div>
                            </div>
                        </div>
                        <span style="font-size: 12px; font-weight: 600; color: #22c55e;">{ratio:.1f}%</span>
                    </div>
                """, unsafe_allow_html=True)
        else:
            st.info("당월 트래픽 데이터가 없습니다.")

    st.divider()

    # Charts
    st.markdown("### 📈 추이 분석")
    col1, col2 = st.columns(2)
    with col1:
        chart_data = result.get('charts', {}).get('views_trend', [])
        fig = create_trend_chart(chart_data, 'year_month', 'total_views', '월별 조회수 추이')
        if fig:
            st.plotly_chart(fig, use_container_width=True)

    with col2:
        traffic_chart = result.get('tables', {}).get('traffic_top5', [])
        fig = create_bar_chart(traffic_chart, 'source', 'ratio', '트래픽 소스 TOP5 (%)', horizontal=True)
        if fig:
            st.plotly_chart(fig, use_container_width=True)

    # 마케팅 인사이트 섹션
    if analyze_blog_data:
        insights_data = analyze_blog_data(result)
        if insights_data:
            render_editable_insights_section(insights_data, "blog")


def render_design_tab(result: Dict[str, Any]):
    """Render design tab with side-by-side month columns using Streamlit native components."""
    if not result:
        st.info("데이터가 없습니다.")
        return

    current_month = result.get('month', '-')
    prev_month = result.get('prev_month', '-')

    kpi = result.get('kpi', {})
    curr_data = result.get('current_month_data', {})
    prev_data = result.get('prev_month_data', {})

    st.subheader("📊 디자인팀 성과 분석")

    # 완료율 계산
    prev_total = prev_data.get('total_tasks', 0) or 0
    prev_completed = prev_data.get('completed_tasks', 0) or 0
    prev_completion_rate = (prev_completed / prev_total * 100) if prev_total > 0 else 0

    curr_total = curr_data.get('total_tasks', 0) or 0
    curr_completed = curr_data.get('completed_tasks', 0) or 0
    curr_completion_rate = (curr_completed / curr_total * 100) if curr_total > 0 else 0

    # Two columns for month comparison - 콘텐츠팀과 동일한 카드 스타일
    col_prev, col_curr = st.columns(2)

    with col_prev:
        st.markdown(f"""
            <div style="text-align: center; padding: 16px 0; margin-bottom: 16px;">
                <span style="font-size: 24px; font-weight: 700; color: #475569;">{prev_month}</span>
            </div>
        """, unsafe_allow_html=True)

        # 메트릭 카드 - 4열 (총 작업, 완료, 평균 수정, 고수정 비율)
        metric_cols = st.columns(4)
        with metric_cols[0]:
            st.markdown(f"""
                <div style="background: #f1f5f9; border-radius: 12px; padding: 12px 8px; text-align: center;">
                    <div style="font-size: 20px; margin-bottom: 4px;">📋</div>
                    <p style="color: #64748b; font-size: 11px; margin: 0;">총 작업</p>
                    <p style="font-size: 18px; font-weight: 700; color: #1e293b; margin: 4px 0;">{prev_total}</p>
                </div>
            """, unsafe_allow_html=True)
        with metric_cols[1]:
            st.markdown(f"""
                <div style="background: #f0fdf4; border-radius: 12px; padding: 12px 8px; text-align: center;">
                    <div style="font-size: 20px; margin-bottom: 4px;">✅</div>
                    <p style="color: #64748b; font-size: 11px; margin: 0;">완료</p>
                    <p style="font-size: 18px; font-weight: 700; color: #22c55e; margin: 4px 0;">{prev_completed}</p>
                </div>
            """, unsafe_allow_html=True)
        with metric_cols[2]:
            prev_avg_rev = prev_data.get('avg_revision', 0) or 0
            rev_color = '#ef4444' if prev_avg_rev >= 3 else ('#f59e0b' if prev_avg_rev >= 2 else '#22c55e')
            st.markdown(f"""
                <div style="background: #f1f5f9; border-radius: 12px; padding: 12px 8px; text-align: center;">
                    <div style="font-size: 20px; margin-bottom: 4px;">🔄</div>
                    <p style="color: #64748b; font-size: 11px; margin: 0;">평균 수정</p>
                    <p style="font-size: 18px; font-weight: 700; color: {rev_color}; margin: 4px 0;">{prev_avg_rev:.1f}회</p>
                </div>
            """, unsafe_allow_html=True)
        with metric_cols[3]:
            prev_heavy_rate = prev_data.get('heavy_revision_rate', 0) or 0
            heavy_color = '#ef4444' if prev_heavy_rate >= 30 else ('#f59e0b' if prev_heavy_rate >= 15 else '#22c55e')
            st.markdown(f"""
                <div style="background: #fef2f2; border-radius: 12px; padding: 12px 8px; text-align: center;">
                    <div style="font-size: 20px; margin-bottom: 4px;">⚠️</div>
                    <p style="color: #64748b; font-size: 11px; margin: 0;">고수정 비율</p>
                    <p style="font-size: 18px; font-weight: 700; color: {heavy_color}; margin: 4px 0;">{prev_heavy_rate:.0f}%</p>
                </div>
            """, unsafe_allow_html=True)

    with col_curr:
        st.markdown(f"""
            <div style="text-align: center; padding: 16px 0; margin-bottom: 16px;">
                <span style="font-size: 24px; font-weight: 700; color: #3b82f6;">{current_month}</span>
            </div>
        """, unsafe_allow_html=True)

        # 메트릭 카드 - 4열 (이번 달, 파란색 테두리)
        metric_cols = st.columns(4)
        with metric_cols[0]:
            st.markdown(f"""
                <div style="background: #eff6ff; border-radius: 12px; padding: 12px 8px; text-align: center; border: 2px solid #3b82f6;">
                    <div style="font-size: 20px; margin-bottom: 4px;">📋</div>
                    <p style="color: #3b82f6; font-size: 11px; margin: 0;">총 작업</p>
                    <p style="font-size: 18px; font-weight: 700; color: #1e293b; margin: 4px 0;">{curr_total}</p>
                </div>
            """, unsafe_allow_html=True)
        with metric_cols[1]:
            st.markdown(f"""
                <div style="background: #f0fdf4; border-radius: 12px; padding: 12px 8px; text-align: center; border: 2px solid #22c55e;">
                    <div style="font-size: 20px; margin-bottom: 4px;">✅</div>
                    <p style="color: #22c55e; font-size: 11px; margin: 0;">완료</p>
                    <p style="font-size: 18px; font-weight: 700; color: #22c55e; margin: 4px 0;">{curr_completed}</p>
                </div>
            """, unsafe_allow_html=True)
        with metric_cols[2]:
            curr_avg_rev = curr_data.get('avg_revision', kpi.get('avg_revision', 0)) or 0
            rev_color = '#ef4444' if curr_avg_rev >= 3 else ('#f59e0b' if curr_avg_rev >= 2 else '#22c55e')
            rev_border = rev_color
            st.markdown(f"""
                <div style="background: #f1f5f9; border-radius: 12px; padding: 12px 8px; text-align: center; border: 2px solid {rev_border};">
                    <div style="font-size: 20px; margin-bottom: 4px;">🔄</div>
                    <p style="color: {rev_color}; font-size: 11px; margin: 0;">평균 수정</p>
                    <p style="font-size: 18px; font-weight: 700; color: {rev_color}; margin: 4px 0;">{curr_avg_rev:.1f}회</p>
                </div>
            """, unsafe_allow_html=True)
        with metric_cols[3]:
            curr_heavy_rate = curr_data.get('heavy_revision_rate', kpi.get('heavy_revision_rate', 0)) or 0
            heavy_color = '#ef4444' if curr_heavy_rate >= 30 else ('#f59e0b' if curr_heavy_rate >= 15 else '#22c55e')
            heavy_border = heavy_color
            st.markdown(f"""
                <div style="background: #fef2f2; border-radius: 12px; padding: 12px 8px; text-align: center; border: 2px solid {heavy_border};">
                    <div style="font-size: 20px; margin-bottom: 4px;">⚠️</div>
                    <p style="color: {heavy_color}; font-size: 11px; margin: 0;">고수정 비율</p>
                    <p style="font-size: 18px; font-weight: 700; color: {heavy_color}; margin: 4px 0;">{curr_heavy_rate:.0f}%</p>
                </div>
            """, unsafe_allow_html=True)

    # Change summary
    st.markdown("#### 📈 전월 대비 변화")
    render_change_summary_st([
        {'label': '작업 건수', 'curr': curr_total, 'prev': prev_total},
        {'label': '완료 건수', 'curr': curr_completed, 'prev': prev_completed},
        {'label': '고수정 비율', 'curr': curr_heavy_rate, 'prev': prev_data.get('heavy_revision_rate', 0), 'reverse': True},
    ])

    st.divider()

    # 고수정 업무 TOP5 (차트)
    st.markdown("### 📊 고수정 업무 분석")
    col1, col2 = st.columns(2)

    with col1:
        heavy = result.get('tables', {}).get('heavy_revision_tasks', [])
        if heavy:
            st.markdown("#### ⚠️ 고수정 업무 TOP5")
            for idx, task in enumerate(heavy[:5]):
                task_name = task.get('task_name', '')[:30]
                rev_count = task.get('revision_count', 0)
                max_rev = max(t.get('revision_count', 1) for t in heavy[:5]) or 1
                pct = (rev_count / max_rev) * 100
                rank_color = '#ef4444' if idx == 0 else ('#f59e0b' if idx == 1 else '#64748b')
                st.markdown(f"""
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                        <span style="width: 24px; height: 24px; background: {rank_color}; color: white; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;">{idx + 1}</span>
                        <div style="flex: 1;">
                            <p style="margin: 0; font-size: 13px; color: #1e293b;">{task_name}</p>
                            <div style="height: 6px; background: #e2e8f0; border-radius: 3px; margin-top: 4px;">
                                <div style="height: 100%; width: {pct}%; background: linear-gradient(90deg, #ef4444, #f87171); border-radius: 3px;"></div>
                            </div>
                        </div>
                        <span style="font-size: 13px; font-weight: 600; color: #ef4444;">{rev_count}회</span>
                    </div>
                """, unsafe_allow_html=True)
        else:
            st.info("고수정 업무 데이터가 없습니다.")

    with col2:
        chart_data = result.get('charts', {}).get('monthly_trend', [])
        if chart_data:
            fig = create_trend_chart(chart_data, 'year_month', 'completed', '월별 완료 건수 추이')
            if fig:
                st.plotly_chart(fig, use_container_width=True)

    # 마케팅 인사이트 섹션
    if analyze_design_data:
        insights_data = analyze_design_data(result)
        if insights_data:
            render_editable_insights_section(insights_data, "design")


def render_youtube_tab(result: Dict[str, Any]):
    """Render youtube tab with side-by-side month columns using Streamlit native components."""
    if not result:
        st.info("데이터가 없습니다.")
        return

    current_month = result.get('month', '-')
    prev_month = result.get('prev_month', '-')

    curr_data = result.get('current_month_data', {})
    prev_data = result.get('prev_month_data', {})
    curr_content = curr_data.get('content', {})
    prev_content = prev_data.get('content', {})

    st.subheader("📊 영상팀 성과 분석")

    # 값 추출
    prev_views = prev_content.get('total_views', 0) or 0
    prev_impressions = prev_content.get('total_impressions', 0) or 0
    prev_subscribers = prev_content.get('new_subscribers', 0) or 0
    prev_ctr = prev_content.get('avg_ctr', 0) or 0

    curr_views = curr_content.get('total_views', 0) or 0
    curr_impressions = curr_content.get('total_impressions', 0) or 0
    curr_subscribers = curr_content.get('new_subscribers', 0) or 0
    curr_ctr = curr_content.get('avg_ctr', 0) or 0

    # Two columns for month comparison - 콘텐츠팀과 동일한 카드 스타일
    col_prev, col_curr = st.columns(2)

    with col_prev:
        st.markdown(f"""
            <div style="text-align: center; padding: 16px 0; margin-bottom: 16px;">
                <span style="font-size: 24px; font-weight: 700; color: #475569;">{prev_month}</span>
            </div>
        """, unsafe_allow_html=True)

        # 메트릭 카드 - 4열 (조회수, 노출수, 구독자, CTR)
        metric_cols = st.columns(4)
        with metric_cols[0]:
            st.markdown(f"""
                <div style="background: #fef2f2; border-radius: 12px; padding: 12px 8px; text-align: center;">
                    <div style="font-size: 20px; margin-bottom: 4px;">👁️</div>
                    <p style="color: #64748b; font-size: 11px; margin: 0;">조회수</p>
                    <p style="font-size: 18px; font-weight: 700; color: #dc2626; margin: 4px 0;">{prev_views:,}</p>
                </div>
            """, unsafe_allow_html=True)
        with metric_cols[1]:
            st.markdown(f"""
                <div style="background: #f1f5f9; border-radius: 12px; padding: 12px 8px; text-align: center;">
                    <div style="font-size: 20px; margin-bottom: 4px;">📊</div>
                    <p style="color: #64748b; font-size: 11px; margin: 0;">노출수</p>
                    <p style="font-size: 18px; font-weight: 700; color: #1e293b; margin: 4px 0;">{prev_impressions:,}</p>
                </div>
            """, unsafe_allow_html=True)
        with metric_cols[2]:
            st.markdown(f"""
                <div style="background: #f0fdf4; border-radius: 12px; padding: 12px 8px; text-align: center;">
                    <div style="font-size: 20px; margin-bottom: 4px;">👥</div>
                    <p style="color: #64748b; font-size: 11px; margin: 0;">신규 구독자</p>
                    <p style="font-size: 18px; font-weight: 700; color: #22c55e; margin: 4px 0;">+{prev_subscribers:,}</p>
                </div>
            """, unsafe_allow_html=True)
        with metric_cols[3]:
            ctr_color = '#22c55e' if prev_ctr >= 5 else ('#f59e0b' if prev_ctr >= 3 else '#64748b')
            st.markdown(f"""
                <div style="background: #f1f5f9; border-radius: 12px; padding: 12px 8px; text-align: center;">
                    <div style="font-size: 20px; margin-bottom: 4px;">📈</div>
                    <p style="color: #64748b; font-size: 11px; margin: 0;">평균 CTR</p>
                    <p style="font-size: 18px; font-weight: 700; color: {ctr_color}; margin: 4px 0;">{prev_ctr:.1f}%</p>
                </div>
            """, unsafe_allow_html=True)

    with col_curr:
        st.markdown(f"""
            <div style="text-align: center; padding: 16px 0; margin-bottom: 16px;">
                <span style="font-size: 24px; font-weight: 700; color: #3b82f6;">{current_month}</span>
            </div>
        """, unsafe_allow_html=True)

        # 메트릭 카드 - 4열 (이번 달, 파란색 테두리)
        metric_cols = st.columns(4)
        with metric_cols[0]:
            st.markdown(f"""
                <div style="background: #fef2f2; border-radius: 12px; padding: 12px 8px; text-align: center; border: 2px solid #dc2626;">
                    <div style="font-size: 20px; margin-bottom: 4px;">👁️</div>
                    <p style="color: #dc2626; font-size: 11px; margin: 0;">조회수</p>
                    <p style="font-size: 18px; font-weight: 700; color: #dc2626; margin: 4px 0;">{curr_views:,}</p>
                </div>
            """, unsafe_allow_html=True)
        with metric_cols[1]:
            st.markdown(f"""
                <div style="background: #eff6ff; border-radius: 12px; padding: 12px 8px; text-align: center; border: 2px solid #3b82f6;">
                    <div style="font-size: 20px; margin-bottom: 4px;">📊</div>
                    <p style="color: #3b82f6; font-size: 11px; margin: 0;">노출수</p>
                    <p style="font-size: 18px; font-weight: 700; color: #1e293b; margin: 4px 0;">{curr_impressions:,}</p>
                </div>
            """, unsafe_allow_html=True)
        with metric_cols[2]:
            st.markdown(f"""
                <div style="background: #f0fdf4; border-radius: 12px; padding: 12px 8px; text-align: center; border: 2px solid #22c55e;">
                    <div style="font-size: 20px; margin-bottom: 4px;">👥</div>
                    <p style="color: #22c55e; font-size: 11px; margin: 0;">신규 구독자</p>
                    <p style="font-size: 18px; font-weight: 700; color: #22c55e; margin: 4px 0;">+{curr_subscribers:,}</p>
                </div>
            """, unsafe_allow_html=True)
        with metric_cols[3]:
            ctr_color = '#22c55e' if curr_ctr >= 5 else ('#f59e0b' if curr_ctr >= 3 else '#64748b')
            ctr_border = ctr_color
            st.markdown(f"""
                <div style="background: #f1f5f9; border-radius: 12px; padding: 12px 8px; text-align: center; border: 2px solid {ctr_border};">
                    <div style="font-size: 20px; margin-bottom: 4px;">📈</div>
                    <p style="color: {ctr_color}; font-size: 11px; margin: 0;">평균 CTR</p>
                    <p style="font-size: 18px; font-weight: 700; color: {ctr_color}; margin: 4px 0;">{curr_ctr:.1f}%</p>
                </div>
            """, unsafe_allow_html=True)

    # Change summary
    st.markdown("#### 📈 전월 대비 변화")
    render_change_summary_st([
        {'label': '조회수', 'curr': curr_views, 'prev': prev_views},
        {'label': '노출수', 'curr': curr_impressions, 'prev': prev_impressions},
        {'label': '평균 CTR', 'curr': curr_ctr, 'prev': prev_ctr},
    ])

    st.divider()

    # 인기 영상 TOP3 (전월 vs 당월)
    st.markdown("### 🎬 조회수 TOP 3 동영상")
    tables = result.get('tables', {})
    col_prev, col_curr = st.columns(2)

    with col_prev:
        st.markdown(f"<p style='text-align: center; font-weight: 700; color: #64748b;'>{prev_month}</p>", unsafe_allow_html=True)
        prev_top = tables.get('prev_top5_videos', [])
        if prev_top:
            max_views = max(v.get('views', 1) for v in prev_top[:3]) or 1
            for idx, video in enumerate(prev_top[:3]):
                title = video.get('title', '')[:35]
                views = video.get('views', 0)
                pct = (views / max_views) * 100
                rank_color = '#94a3b8'
                st.markdown(f"""
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                        <span style="width: 24px; height: 24px; background: {rank_color}; color: white; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;">{idx + 1}</span>
                        <div style="flex: 1;">
                            <p style="margin: 0; font-size: 13px; color: #475569;">{title}...</p>
                            <div style="height: 6px; background: #e2e8f0; border-radius: 3px; margin-top: 4px;">
                                <div style="height: 100%; width: {pct}%; background: #94a3b8; border-radius: 3px;"></div>
                            </div>
                        </div>
                        <span style="font-size: 13px; font-weight: 600; color: #64748b;">{views:,}회</span>
                    </div>
                """, unsafe_allow_html=True)
        else:
            st.info("전월 데이터 없음")

    with col_curr:
        st.markdown(f"<p style='text-align: center; font-weight: 700; color: #dc2626;'>{current_month}</p>", unsafe_allow_html=True)
        curr_top = tables.get('top5_videos', [])
        if curr_top:
            max_views = max(v.get('views', 1) for v in curr_top[:3]) or 1
            for idx, video in enumerate(curr_top[:3]):
                title = video.get('title', '')[:35]
                views = video.get('views', 0)
                pct = (views / max_views) * 100
                rank_color = '#dc2626' if idx == 0 else ('#f59e0b' if idx == 1 else '#a16207')
                st.markdown(f"""
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                        <span style="width: 24px; height: 24px; background: {rank_color}; color: white; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;">{idx + 1}</span>
                        <div style="flex: 1;">
                            <p style="margin: 0; font-size: 13px; color: #1e293b;">{title}...</p>
                            <div style="height: 6px; background: #e2e8f0; border-radius: 3px; margin-top: 4px;">
                                <div style="height: 100%; width: {pct}%; background: linear-gradient(90deg, #dc2626, #f87171); border-radius: 3px;"></div>
                            </div>
                        </div>
                        <span style="font-size: 13px; font-weight: 600; color: #dc2626;">{views:,}회</span>
                    </div>
                """, unsafe_allow_html=True)
        else:
            st.info("당월 영상 데이터가 없습니다.")

    st.divider()

    # 트래픽 소스 TOP3 (전월 vs 당월)
    st.markdown("### 📡 트래픽 소스 TOP 3")
    # 아이콘 매핑
    source_icons = {
        '검색': '🔍', '유튜브 검색': '🔍', 'YouTube 검색': '🔍',
        '탐색': '🧭', '탐색 기능': '🧭',
        '외부': '🔗', '외부 소스': '🔗',
        '추천': '👍', '추천 동영상': '👍',
        '채널 페이지': '📺', '채널': '📺',
        '알림': '🔔',
        '재생목록': '📋',
    }

    col_prev, col_curr = st.columns(2)

    with col_prev:
        st.markdown(f"<p style='text-align: center; font-weight: 700; color: #64748b;'>{prev_month}</p>", unsafe_allow_html=True)
        prev_traffic = tables.get('prev_traffic_by_source', [])
        if prev_traffic:
            max_views = max(s.get('views', 1) for s in prev_traffic[:3]) or 1
            for idx, src in enumerate(prev_traffic[:3]):
                source_name = src.get('source', '')
                src_views = src.get('views', 0)
                pct = (src_views / max_views) * 100
                icon = '📊'
                for key, ic in source_icons.items():
                    if key in source_name:
                        icon = ic
                        break
                st.markdown(f"""
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                        <span style="font-size: 20px; opacity: 0.6;">{icon}</span>
                        <div style="flex: 1;">
                            <p style="margin: 0; font-size: 13px; color: #475569;">{source_name}</p>
                            <div style="height: 6px; background: #e2e8f0; border-radius: 3px; margin-top: 4px;">
                                <div style="height: 100%; width: {pct}%; background: #94a3b8; border-radius: 3px;"></div>
                            </div>
                        </div>
                        <span style="font-size: 13px; font-weight: 600; color: #64748b;">{src_views:,}회</span>
                    </div>
                """, unsafe_allow_html=True)
        else:
            st.info("전월 데이터 없음")

    with col_curr:
        st.markdown(f"<p style='text-align: center; font-weight: 700; color: #3b82f6;'>{current_month}</p>", unsafe_allow_html=True)
        curr_traffic = tables.get('traffic_by_source', [])
        if curr_traffic:
            max_views = max(s.get('views', 1) for s in curr_traffic[:3]) or 1
            for idx, src in enumerate(curr_traffic[:3]):
                source_name = src.get('source', '')
                src_views = src.get('views', 0)
                pct = (src_views / max_views) * 100
                icon = '📊'
                for key, ic in source_icons.items():
                    if key in source_name:
                        icon = ic
                        break
                st.markdown(f"""
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                        <span style="font-size: 20px;">{icon}</span>
                        <div style="flex: 1;">
                            <p style="margin: 0; font-size: 13px; color: #1e293b;">{source_name}</p>
                            <div style="height: 6px; background: #e2e8f0; border-radius: 3px; margin-top: 4px;">
                                <div style="height: 100%; width: {pct}%; background: linear-gradient(90deg, #3b82f6, #60a5fa); border-radius: 3px;"></div>
                            </div>
                        </div>
                        <span style="font-size: 13px; font-weight: 600; color: #3b82f6;">{src_views:,}회</span>
                    </div>
                """, unsafe_allow_html=True)
        else:
            st.info("당월 트래픽 데이터가 없습니다.")

    # 월별 추이 차트
    st.divider()
    st.markdown("### 📈 월별 추이")
    chart_data = result.get('charts', {}).get('monthly_content_totals', [])
    if chart_data:
        fig = create_trend_chart(chart_data, 'file_month', 'total_views', '월별 조회수 추이')
        if fig:
            st.plotly_chart(fig, use_container_width=True)

    # 마케팅 인사이트 섹션
    if analyze_youtube_data:
        insights_data = analyze_youtube_data(result)
        if insights_data:
            render_editable_insights_section(insights_data, "youtube")


def render_setting_tab(result: Dict[str, Any]):
    """Render setting tab using Streamlit native components."""
    if not result:
        st.info("데이터가 없습니다.")
        return

    kpi = result.get('kpi', {})

    st.subheader("📊 초기세팅 현황")

    # Metrics using st.metric
    render_metrics_st([
        {'label': '평균 진행률', 'value': kpi.get('avg_progress_rate', 0), 'icon': '📊'},
        {'label': '완료 병원', 'value': kpi.get('completed_clinics', 0), 'icon': '🏥'},
        {'label': '위험 병원', 'value': kpi.get('risk_clinics', 0), 'icon': '⚠️'},
    ])

    st.divider()

    col1, col2 = st.columns(2)
    with col1:
        rates = result.get('tables', {}).get('channel_completion_rate', [])
        fig = create_bar_chart(rates, 'channel', 'completion_rate', '채널별 완료율', horizontal=True)
        if fig:
            st.plotly_chart(fig, use_container_width=True)

    with col2:
        render_data_table(result.get('tables', {}).get('clinic_progress', []), "병원별 진행 현황")


def render_data_table(data: List[Dict], title: str = None):
    """Render data table."""
    if not data:
        return
    if title:
        st.markdown(f"**{title}**")
    st.dataframe(pd.DataFrame(data), use_container_width=True, hide_index=True)
