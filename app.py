"""
Daily Report Generator - Streamlit Application
Clean UI with Centralized Upload & Data Aggregation
"""

import streamlit as st
from datetime import datetime
import os

# Import processors
from src.processors import (
    process_ads,
    process_design,
    process_reservation,
    process_blog,
    process_youtube,
    process_setting
)

# Import utilities
from src.utils import route_files, LoadedFile, load_uploaded_file

# Import UI components
from src.ui.layout import (
    render_ads_tab,
    render_design_tab,
    render_reservation_tab,
    render_blog_tab,
    render_youtube_tab,
    render_setting_tab
)

# Import HTML generator
from src.reporting.html_generator import generate_html_report, get_report_filename


# Page configuration
st.set_page_config(
    page_title="일일 리포트 생성기",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# Load custom CSS
def load_css():
    css_path = os.path.join(os.path.dirname(__file__), 'src', 'ui', 'style.css')
    if os.path.exists(css_path):
        with open(css_path, 'r', encoding='utf-8') as f:
            st.markdown(f'<style>{f.read()}</style>', unsafe_allow_html=True)

load_css()


def initialize_session_state():
    """Initialize session state variables."""
    if 'processed_results' not in st.session_state:
        st.session_state.processed_results = {
            'ads': {},
            'design': {},
            'reservation': {},
            'blog': {},
            'youtube': {},
            'setting': {}
        }
    if 'files_uploaded' not in st.session_state:
        st.session_state.files_uploaded = False

    # Store all loaded files to enable aggregation
    if 'all_loaded_files' not in st.session_state:
        st.session_state.all_loaded_files = []

    # Report settings (editable by user)
    if 'report_settings' not in st.session_state:
        st.session_state.report_settings = {
            'clinic_name': '서울리멤버치과',
            'report_date': datetime.now().strftime('%Y년 %m월 %d일'),
            'report_title_prefix': '월간 분석 보고서'
        }

    # Edit mode flag
    if 'edit_mode' not in st.session_state:
        st.session_state.edit_mode = False


def process_uploaded_files(uploaded_files):
    """Process uploaded files and route to appropriate processors."""
    if not uploaded_files:
        return

    # Add new files to session state (avoid duplicates by name)
    existing_names = {f.name for f in st.session_state.all_loaded_files}
    new_files_count = 0
    
    for uf in uploaded_files:
        if uf.name not in existing_names:
            st.session_state.all_loaded_files.append(load_uploaded_file(uf))
            existing_names.add(uf.name)
            new_files_count += 1
    
    if not st.session_state.all_loaded_files:
        st.warning("처리할 파일이 없습니다.")
        return

    # Route ALL accumulated files to processors
    routed_files = route_files(st.session_state.all_loaded_files)

    # Process each department's files
    # 순서 중요: 예약 데이터를 먼저 처리하여 광고의 CPA 계산에 사용
    with st.spinner(f'데이터 처리 중... (총 {len(st.session_state.all_loaded_files)}개 파일)'):
        # 1. 예약 데이터 먼저 처리 (광고 CPA 계산에 필요)
        if routed_files['reservation']:
            st.session_state.processed_results['reservation'] = process_reservation(routed_files['reservation'])

        # 2. 광고 데이터 처리 (예약 데이터로 CPA 계산)
        if routed_files['ads']:
            reservation_data = st.session_state.processed_results.get('reservation')
            st.session_state.processed_results['ads'] = process_ads(routed_files['ads'], reservation_data)

        if routed_files['design']:
            st.session_state.processed_results['design'] = process_design(routed_files['design'])

        if routed_files['blog']:
            st.session_state.processed_results['blog'] = process_blog(routed_files['blog'])

        if routed_files['youtube']:
            st.session_state.processed_results['youtube'] = process_youtube(routed_files['youtube'])

        if routed_files['setting']:
            st.session_state.processed_results['setting'] = process_setting(routed_files['setting'])

    st.session_state.files_uploaded = True
    st.rerun()


def render_upload_section():
    """Render the centralized upload section with individual category uploaders."""
    # Custom CSS for bigger button and clean UI
    st.markdown("""
    <style>
        /* Main Button Styling */
        div.stButton > button {
            width: 100%;
            border-radius: 12px;
            font-weight: 700 !important;
            transition: all 0.2s ease-in-out;
        }
        
        /* Primary Button (Start Analysis) specific */
        div.stButton > button[kind="primary"] {
            background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
            border: none;
            padding: 1rem 2rem;
            font-size: 1.5rem !important;
            box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2), 0 2px 4px -1px rgba(37, 99, 235, 0.1);
        }
        div.stButton > button[kind="primary"]:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 15px -3px rgba(37, 99, 235, 0.3), 0 4px 6px -2px rgba(37, 99, 235, 0.15);
        }

        /* Upload Card Styling */
        .upload-card {
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 16px;
            padding: 1.5rem;
            text-align: center;
            height: 100%;
            box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
            transition: all 0.2s;
        }
        .upload-card:hover {
            border-color: #3b82f6;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }
        .step-header {
            background: #f1f5f9;
            padding: 0.5rem 1rem;
            border-radius: 8px;
            display: inline-block;
            margin-bottom: 1rem;
            font-weight: 600;
            color: #475569;
        }
    </style>
    
    <div style="text-align: center; margin-bottom: 3rem; padding: 2rem 0;">
        <h1 style="font-size: 2.5rem; font-weight: 800; color: #1e293b; margin-bottom: 1rem;">🚀 일일 리포트 생성기</h1>
        <p style="font-size: 1.1rem; color: #64748b;">쉽고 빠르게 병원 성과 데이터를 분석하세요.</p>
    </div>
    """, unsafe_allow_html=True)

    # Step 1: Settings
    st.markdown('<div class="step-header">STEP 1. 기본 정보 설정</div>', unsafe_allow_html=True)
    with st.container():
        col1, col2 = st.columns([2, 1])
        with col1:
            clinic_name = st.text_input(
                "🏥 치과명",
                value=st.session_state.report_settings['clinic_name'],
                placeholder="예: 서울리멤버치과",
                key="main_clinic_name"
            )
            if clinic_name != st.session_state.report_settings['clinic_name']:
                st.session_state.report_settings['clinic_name'] = clinic_name
        with col2:
            report_date = st.text_input(
                "📅 보고서 작성일",
                value=st.session_state.report_settings['report_date'],
                key="main_report_date"
            )
            if report_date != st.session_state.report_settings['report_date']:
                st.session_state.report_settings['report_date'] = report_date

    st.markdown("---")

    # Step 2: Upload Files
    st.markdown('<div class="step-header">STEP 2. 데이터 파일 업로드</div>', unsafe_allow_html=True)
    
    # Category configurations
    categories = [
        {"key": "reservation", "icon": "📅", "title": "네이버 예약", "desc": "예약자 관리 엑셀 업로드"},
        {"key": "blog", "icon": "📝", "title": "블로그", "desc": "블로그 통계/유입 분석"},
        {"key": "youtube", "icon": "🎬", "title": "유튜브", "desc": "영상 콘텐츠 조회수/DB"},
        {"key": "design", "icon": "🎨", "title": "디자인", "desc": "디자인 업무 협조 요청서"},
        {"key": "ads", "icon": "📊", "title": "네이버 광고", "desc": "소진 내역/캠페인 보고서"},
        {"key": "setting", "icon": "⚙️", "title": "초기 세팅", "desc": "세팅 현황 파일"},
    ]

    all_uploaded_files = []
    
    # Grid Layout for Uploads
    row1 = st.columns(3)
    row2 = st.columns(3)
    
    for idx, cat in enumerate(categories):
        target_col = row1[idx] if idx < 3 else row2[idx-3]
        
        with target_col:
            st.markdown(f"""
            <div class="upload-card">
                <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">{cat['icon']}</div>
                <div style="font-weight: 700; font-size: 1.1rem; color: #1e293b; margin-bottom: 0.25rem;">{cat['title']}</div>
                <div style="font-size: 0.875rem; color: #94a3b8; margin-bottom: 1rem;">{cat['desc']}</div>
            </div>
            """, unsafe_allow_html=True)
            
            uploaded = st.file_uploader(
                f"{cat['title']}",
                type=['xlsx', 'csv'],
                accept_multiple_files=True,
                key=f"upload_{cat['key']}",
                label_visibility="collapsed"
            )
            
            if uploaded:
                all_uploaded_files.extend(uploaded)
                st.markdown(f"""
                <div style="text-align: center; color: #22c55e; font-size: 0.875rem; font-weight: 600; margin-top: 0.5rem;">
                    ✅ {len(uploaded)}개 파일 준비됨
                </div>
                """, unsafe_allow_html=True)

    st.markdown("---")

    # Step 3: Action Button
    st.markdown('<div class="step-header">STEP 3. 분석 시작</div>', unsafe_allow_html=True)
    
    col1, col2, col3 = st.columns([1, 2, 1])
    with col2:
        total_files = len(all_uploaded_files)
        if total_files > 0:
            st.markdown(f"""
            <div style="text-align: center; margin-bottom: 1rem; color: #3b82f6; font-weight: 600;">
                총 {total_files}개의 파일이 선택되었습니다.
            </div>
            """, unsafe_allow_html=True)
            
            # Big Primary Button
            if st.button("🚀 데이터 분석 시작하기", type="primary", use_container_width=True):
                process_uploaded_files(all_uploaded_files)
        else:
            st.button("🚀 파일을 먼저 업로드해주세요", type="primary", use_container_width=True, disabled=True)


def render_report_settings():
    """Render report settings panel (clinic name, date, etc.)."""
    settings = st.session_state.report_settings

    with st.expander("⚙️ 보고서 설정", expanded=st.session_state.edit_mode):
        col1, col2, col3 = st.columns([2, 2, 1])

        with col1:
            new_clinic_name = st.text_input(
                "치과명",
                value=settings['clinic_name'],
                key="input_clinic_name"
            )

        with col2:
            new_report_date = st.text_input(
                "보고서 작성일",
                value=settings['report_date'],
                key="input_report_date"
            )

        with col3:
            st.write("")  # Spacer
            st.write("")
            if st.button("💾 저장", type="primary", use_container_width=True):
                st.session_state.report_settings['clinic_name'] = new_clinic_name
                st.session_state.report_settings['report_date'] = new_report_date
                st.session_state.edit_mode = False
                st.success("설정이 저장되었습니다!")
                st.rerun()

        # Display current settings
        st.markdown(f"""
        <div style="background: #f8fafc; border-radius: 8px; padding: 12px; margin-top: 8px;">
            <span style="color: #64748b; font-size: 14px;">
                현재 설정: <strong>{settings['clinic_name']}</strong> | {settings['report_date']}
            </span>
        </div>
        """, unsafe_allow_html=True)


def render_data_editor():
    """Render manual data editing interface."""
    st.markdown("### ✏️ 데이터 수동 편집")
    st.caption("각 섹션의 데이터를 수동으로 수정할 수 있습니다. 수정 후 '변경사항 적용' 버튼을 클릭하세요.")

    results = st.session_state.processed_results

    # 예약 데이터 편집
    with st.expander("📅 예약 데이터 편집", expanded=False):
        if results.get('reservation'):
            res_data = results['reservation']
            col1, col2 = st.columns(2)

            with col1:
                st.markdown("**전월 데이터**")
                prev_data = res_data.get('prev_month', {})
                prev_total = st.number_input("전월 총 예약건", value=int(prev_data.get('total_reservations', 0)), key="edit_res_prev_total")
                prev_new = st.number_input("전월 신규 예약", value=int(prev_data.get('new_reservations', 0)), key="edit_res_prev_new")
                prev_revisit = st.number_input("전월 재진 예약", value=int(prev_data.get('revisit_reservations', 0)), key="edit_res_prev_revisit")

            with col2:
                st.markdown("**당월 데이터**")
                curr_data = res_data.get('current_month', {})
                curr_total = st.number_input("당월 총 예약건", value=int(curr_data.get('total_reservations', 0)), key="edit_res_curr_total")
                curr_new = st.number_input("당월 신규 예약", value=int(curr_data.get('new_reservations', 0)), key="edit_res_curr_new")
                curr_revisit = st.number_input("당월 재진 예약", value=int(curr_data.get('revisit_reservations', 0)), key="edit_res_curr_revisit")

            if st.button("💾 예약 데이터 저장", key="save_res"):
                results['reservation']['prev_month']['total_reservations'] = prev_total
                results['reservation']['prev_month']['new_reservations'] = prev_new
                results['reservation']['prev_month']['revisit_reservations'] = prev_revisit
                results['reservation']['current_month']['total_reservations'] = curr_total
                results['reservation']['current_month']['new_reservations'] = curr_new
                results['reservation']['current_month']['revisit_reservations'] = curr_revisit
                st.success("예약 데이터가 저장되었습니다!")
                st.rerun()
        else:
            st.info("예약 데이터가 없습니다.")

    # 광고 데이터 편집
    with st.expander("📊 광고 데이터 편집", expanded=False):
        if results.get('ads'):
            ads_data = results['ads']
            col1, col2 = st.columns(2)

            with col1:
                st.markdown("**전월 데이터**")
                prev_ads = ads_data.get('prev_month', {})
                prev_spend = st.number_input("전월 광고비", value=int(prev_ads.get('total_spend', 0)), key="edit_ads_prev_spend")
                prev_imp = st.number_input("전월 노출수", value=int(prev_ads.get('total_impressions', 0)), key="edit_ads_prev_imp")
                prev_clicks = st.number_input("전월 클릭수", value=int(prev_ads.get('total_clicks', 0)), key="edit_ads_prev_clicks")

            with col2:
                st.markdown("**당월 데이터**")
                curr_ads = ads_data.get('current_month', {})
                curr_spend = st.number_input("당월 광고비", value=int(curr_ads.get('total_spend', 0)), key="edit_ads_curr_spend")
                curr_imp = st.number_input("당월 노출수", value=int(curr_ads.get('total_impressions', 0)), key="edit_ads_curr_imp")
                curr_clicks = st.number_input("당월 클릭수", value=int(curr_ads.get('total_clicks', 0)), key="edit_ads_curr_clicks")

            if st.button("💾 광고 데이터 저장", key="save_ads"):
                results['ads']['prev_month']['total_spend'] = prev_spend
                results['ads']['prev_month']['total_impressions'] = prev_imp
                results['ads']['prev_month']['total_clicks'] = prev_clicks
                results['ads']['current_month']['total_spend'] = curr_spend
                results['ads']['current_month']['total_impressions'] = curr_imp
                results['ads']['current_month']['total_clicks'] = curr_clicks
                st.success("광고 데이터가 저장되었습니다!")
                st.rerun()
        else:
            st.info("광고 데이터가 없습니다.")

    # 블로그 데이터 편집
    with st.expander("📝 블로그 데이터 편집", expanded=False):
        if results.get('blog'):
            blog_data = results['blog']
            col1, col2 = st.columns(2)

            with col1:
                st.markdown("**전월 데이터**")
                prev_blog = blog_data.get('prev_month', {})
                prev_posts = st.number_input("전월 포스팅 수", value=int(prev_blog.get('total_posts', 0)), key="edit_blog_prev_posts")
                prev_views = st.number_input("전월 조회수", value=int(prev_blog.get('total_views', 0)), key="edit_blog_prev_views")

            with col2:
                st.markdown("**당월 데이터**")
                curr_blog = blog_data.get('current_month', {})
                curr_posts = st.number_input("당월 포스팅 수", value=int(curr_blog.get('total_posts', 0)), key="edit_blog_curr_posts")
                curr_views = st.number_input("당월 조회수", value=int(curr_blog.get('total_views', 0)), key="edit_blog_curr_views")

            if st.button("💾 블로그 데이터 저장", key="save_blog"):
                results['blog']['prev_month']['total_posts'] = prev_posts
                results['blog']['prev_month']['total_views'] = prev_views
                results['blog']['current_month']['total_posts'] = curr_posts
                results['blog']['current_month']['total_views'] = curr_views
                st.success("블로그 데이터가 저장되었습니다!")
                st.rerun()
        else:
            st.info("블로그 데이터가 없습니다.")

    # 유튜브 데이터 편집
    with st.expander("🎬 유튜브 데이터 편집", expanded=False):
        if results.get('youtube'):
            yt_data = results['youtube']
            col1, col2 = st.columns(2)

            with col1:
                st.markdown("**전월 데이터**")
                prev_yt = yt_data.get('prev_month', {})
                prev_videos = st.number_input("전월 영상 수", value=int(prev_yt.get('total_videos', 0)), key="edit_yt_prev_videos")
                prev_yt_views = st.number_input("전월 조회수", value=int(prev_yt.get('total_views', 0)), key="edit_yt_prev_views")

            with col2:
                st.markdown("**당월 데이터**")
                curr_yt = yt_data.get('current_month', {})
                curr_videos = st.number_input("당월 영상 수", value=int(curr_yt.get('total_videos', 0)), key="edit_yt_curr_videos")
                curr_yt_views = st.number_input("당월 조회수", value=int(curr_yt.get('total_views', 0)), key="edit_yt_curr_views")

            if st.button("💾 유튜브 데이터 저장", key="save_yt"):
                results['youtube']['prev_month']['total_videos'] = prev_videos
                results['youtube']['prev_month']['total_views'] = prev_yt_views
                results['youtube']['current_month']['total_videos'] = curr_videos
                results['youtube']['current_month']['total_views'] = curr_yt_views
                st.success("유튜브 데이터가 저장되었습니다!")
                st.rerun()
        else:
            st.info("유튜브 데이터가 없습니다.")


def render_html_preview(html_content: str):
    """Render HTML report preview in an iframe."""
    import base64

    # Encode HTML to base64 for iframe src
    b64_html = base64.b64encode(html_content.encode('utf-8')).decode('utf-8')

    # Create iframe with the HTML content
    iframe_html = f"""
    <div style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin: 1rem 0;">
        <iframe
            src="data:text/html;base64,{b64_html}"
            width="100%"
            height="800px"
            style="border: none;"
        ></iframe>
    </div>
    """
    st.markdown(iframe_html, unsafe_allow_html=True)


def check_clinic_name_mismatch():
    """Check for clinic name mismatches across data files and return warnings."""
    results = st.session_state.processed_results
    detected_names = set()
    source_names = {}  # {source: clinic_name}

    # 예약 데이터에서 거래처명 추출
    if results.get('reservation'):
        res_data = results['reservation'].get('clean_data', {})
        # 예약 데이터는 파일명에서 추출하거나 별도 필드에서 가져올 수 있음

    # 블로그 데이터에서 거래처명 추출
    if results.get('blog'):
        blog_work = results['blog'].get('clean_data', {}).get('work', {})
        by_clinic = blog_work.get('by_clinic', [])
        for clinic_info in by_clinic:
            clinic_name = clinic_info.get('clinic', '')
            if clinic_name:
                detected_names.add(clinic_name)
                source_names['블로그'] = clinic_name

    # 디자인 데이터에서 거래처명 추출
    if results.get('design'):
        design_clean = results['design'].get('clean_data', {})
        if 'clinic_name' in design_clean:
            clinic_name = design_clean['clinic_name']
            if clinic_name:
                detected_names.add(clinic_name)
                source_names['디자인'] = clinic_name

    # 유튜브 데이터에서 거래처명 추출 (파일명에서)
    if results.get('youtube'):
        yt_clean = results['youtube'].get('clean_data', {})
        if 'clinic_name' in yt_clean:
            clinic_name = yt_clean['clinic_name']
            if clinic_name:
                detected_names.add(clinic_name)
                source_names['유튜브'] = clinic_name

    return detected_names, source_names


def render_dashboard():
    """Render the main dashboard after data processing."""
    settings = st.session_state.report_settings

    # 거래처명 불일치 경고 체크
    detected_names, source_names = check_clinic_name_mismatch()
    if len(detected_names) > 1:
        st.warning(f"""
        ⚠️ **거래처명 불일치 감지**

        데이터 파일에서 서로 다른 거래처명이 감지되었습니다:
        {', '.join([f'**{name}**' for name in detected_names])}

        각 데이터 출처: {', '.join([f'{src}: {name}' for src, name in source_names.items()])}

        올바른 거래처의 데이터인지 확인해주세요.
        """)

    # Header with clinic name
    col1, col2, col3 = st.columns([2, 1, 1])
    with col1:
        st.markdown(f"""
        <div>
            <h1 style="margin-bottom: 0;">{settings['clinic_name']} 통합 성과 리포트</h1>
            <p style="color: #64748b; font-size: 14px; margin-top: 4px;">{settings['report_date']} 발행</p>
        </div>
        """, unsafe_allow_html=True)
    with col2:
        if st.button("✏️ 설정 수정", use_container_width=True):
            st.session_state.edit_mode = not st.session_state.edit_mode
            st.rerun()
    with col3:
        if st.button("🔄 재시작", use_container_width=True):
            st.session_state.files_uploaded = False
            st.session_state.processed_results = {}
            st.session_state.all_loaded_files = []
            st.session_state.edit_mode = False
            st.rerun()

    # Report settings panel
    render_report_settings()

    # 뷰 모드 선택 (데이터 편집 / 미리보기)
    if 'view_mode' not in st.session_state:
        st.session_state.view_mode = 'data'  # 'data' or 'preview'

    st.markdown("---")
    view_col1, view_col2, view_col3 = st.columns([1, 1, 1])
    with view_col1:
        if st.button("📊 데이터 보기", use_container_width=True,
                     type="primary" if st.session_state.view_mode == 'data' else "secondary"):
            st.session_state.view_mode = 'data'
            st.rerun()
    with view_col2:
        if st.button("✏️ 데이터 편집", use_container_width=True,
                     type="primary" if st.session_state.view_mode == 'edit' else "secondary"):
            st.session_state.view_mode = 'edit'
            st.rerun()
    with view_col3:
        if st.button("👁️ 보고서 미리보기", use_container_width=True,
                     type="primary" if st.session_state.view_mode == 'preview' else "secondary"):
            st.session_state.view_mode = 'preview'
            st.rerun()

    # Generate HTML report for preview and download
    html_report = generate_html_report(
        st.session_state.processed_results,
        clinic_name=settings['clinic_name'],
        report_date=settings['report_date']
    )
    filename = get_report_filename(settings['clinic_name'])

    if st.session_state.view_mode == 'data':
        # 기존 탭 뷰
        tab_reservation, tab_blog, tab_ads, tab_design, tab_youtube, tab_setting = st.tabs([
            "📅 예약", "📝 블로그", "📊 광고", "🎨 디자인", "🎬 유튜브", "⚙️ 초기세팅"
        ])

        results = st.session_state.processed_results

        with tab_reservation:
            render_reservation_tab(results.get('reservation', {}))

        with tab_blog:
            render_blog_tab(results.get('blog', {}))

        with tab_ads:
            render_ads_tab(results.get('ads', {}))

        with tab_design:
            render_design_tab(results.get('design', {}))

        with tab_youtube:
            render_youtube_tab(results.get('youtube', {}))

        with tab_setting:
            render_setting_tab(results.get('setting', {}))

    elif st.session_state.view_mode == 'edit':
        # 데이터 편집 모드
        render_data_editor()

    elif st.session_state.view_mode == 'preview':
        # HTML 보고서 미리보기
        st.markdown("### 👁️ HTML 보고서 미리보기")
        st.caption("아래는 다운로드될 HTML 보고서의 실제 모습입니다.")
        render_html_preview(html_report)

    # Download Section
    st.markdown("---")
    col1, col2, col3 = st.columns([1, 2, 1])
    with col2:
        st.download_button(
            label="📥 HTML 보고서 다운로드",
            data=html_report.encode('utf-8'),
            file_name=filename,
            mime="text/html",
            use_container_width=True
        )


def main():
    """Main application entry point."""
    initialize_session_state()
    
    if not st.session_state.files_uploaded:
        render_upload_section()
    else:
        render_dashboard()


if __name__ == "__main__":
    main()
# git initial tracking trigger